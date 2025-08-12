import { API_BASE, ensureAccess, authFetch, initAuth, isLoggedIn } from './auth.js';

// 전역
let currentVideoTitle = '';
const itemsPerPage = 4;
let currentPage = 1;
let expanded = false;

function openModal(title) {
  currentVideoTitle = title;
  document.querySelector('.modal-title').textContent = title;
  document.querySelector('.file-name').textContent = title;
  document.getElementById('feedbackModal').style.display = 'block';
}

function closeModal() {
  document.getElementById('feedbackModal').style.display = 'none';
  document.querySelector('.feedback-textarea').value = '';
  currentVideoTitle = '';
}

async function submitFeedback() {
  const feedback = document.querySelector('.feedback-textarea').value.trim();
  if (!feedback) return alert('피드백 내용을 입력해주세요.');

  await ensureAccess();
  if (!window.ACCESS_TOKEN) return alert('로그인이 필요합니다.');

  try {
    const feedbackData = {
      feedback_type: 'general',
      video_title: currentVideoTitle,
      content: feedback,
    };

    const resp = await authFetch(`${API_BASE}/nova/auth/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedbackData),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(()=>'');
      console.error('피드백 실패:', resp.status, txt);
      if (resp.status === 401) alert('로그인이 필요합니다.');
      else alert(`피드백 실패: ${resp.status}`);
      return;
    }

    const result = await resp.json().catch(()=> ({}));
    alert(result.message || '피드백이 전송되었습니다.');
    closeModal();
  } catch (e) {
    console.error('피드백 전송 오류:', e);
    alert('피드백 전송 중 오류가 발생했습니다. 다시 시도해 주세요.');
  }
}

function refreshPagination() {
  const showMoreBtn = document.getElementById('showMoreBtn');
  const items = document.querySelectorAll('.history-item');
  const totalItems = items.length;
  const itemsToShow = currentPage * itemsPerPage;

  items.forEach((el, i) => {
    el.style.display = i < itemsToShow ? 'grid' : 'none';
  });

  if (itemsToShow >= totalItems) {
    showMoreBtn.textContent = '접기';
    expanded = true;
  } else {
    showMoreBtn.textContent = '더 보기';
    expanded = false;
  }

  showMoreBtn.style.display = totalItems <= itemsPerPage ? 'none' : 'inline-block';
}

async function saveHistory(videoId) {
  try {
    await ensureAccess();
    const response = await authFetch(`${API_BASE}/nova/history/${encodeURIComponent(videoId)}`, {
      method: 'POST',
    });
    if (response.ok) {
      const result = await response.json().catch(()=> ({}));
      console.log('히스토리 저장 완료:', result);
    } else {
      console.error('히스토리 저장 실패:', response.status);
    }
  } catch (err) {
    console.error('히스토리 저장 중 오류:', err);
  }
}

async function loadHistory(userVideoIds) {
  const historyList = document.getElementById('historyList');
  historyList.innerHTML = '';
  await ensureAccess();

  // 순차 호출이 느리면 Promise.all로 병렬화 가능
  for (const videoId of userVideoIds) {
    const res = await authFetch(`${API_BASE}/nova/history/${encodeURIComponent(videoId)}`);
    if (res.ok) {
      const data = await res.json().catch(()=> ({}));
      const item = data.history?.[0];
      if (item) renderHistoryItem(item.video_title, item.video_id);
    }
  }
}

async function deleteHistory(videoId) {
  await ensureAccess();
  const res = await authFetch(`${API_BASE}/nova/history/${encodeURIComponent(videoId)}`, {
    method: 'DELETE',
  });

  if (res.ok) return true;

  const errText = await res.text().catch(()=>'');
  console.error('히스토리 삭제 실패:', res.status, errText);
  if (res.status === 401) alert('삭제 권한이 없습니다. 로그인 상태를 확인해주세요.');
  else alert(`삭제 실패: ${res.status}`);
  return false;
}

function renderHistoryItem(title, videoId) {
  const historyList = document.getElementById('historyList');

  const div = document.createElement('div');
  div.className = 'history-item';
  div.dataset.id = videoId;

  const titleDiv = document.createElement('div');
  titleDiv.className = 'video-title';
  titleDiv.textContent = title;

  const feedbackBtn = document.createElement('button');
  feedbackBtn.className = 'feedback-btn';
  feedbackBtn.textContent = '피드백 보내기';
  feedbackBtn.onclick = () => openModal(title);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = '삭제';
  deleteBtn.onclick = async () => {
    const ok = await deleteHistory(videoId);
    if (ok) {
      const updated = JSON.parse(localStorage.getItem('video_history') || '[]')
        .filter(h => h.video_id !== videoId);
      localStorage.setItem('video_history', JSON.stringify(updated));
      div.remove();
      refreshPagination();
      alert('히스토리 삭제 완료');
    }
  };

  div.appendChild(titleDiv);
  div.appendChild(feedbackBtn);
  div.appendChild(deleteBtn);
  historyList.appendChild(div);
}

document.addEventListener('DOMContentLoaded', async () => {
  // 로그인 확인
  await initAuth();
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    alert('로그인이 필요합니다.');
    window.location.replace('/html/login.html?next=/html/history.html');
    return;
  }

  const historyList = document.getElementById('historyList');
  const showMoreBtn = document.getElementById('showMoreBtn');

  const localHistory = JSON.parse(localStorage.getItem('video_history') || '[]');
  const videoIds = localHistory.map(x => x.video_id);

  historyList.innerHTML = '';

  if (videoIds.length > 0) {
    await loadHistory(videoIds); // 서버 데이터
  } else {
    // 서버에 조회할 id가 없으면 로컬만 사용(선택)
    localHistory.forEach(item => renderHistoryItem(item.title, item.video_id));
  }

  refreshPagination();

  showMoreBtn.addEventListener('click', () => {
    const totalItems = document.querySelectorAll('.history-item').length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    currentPage = expanded ? 1 : Math.min(currentPage + 1, totalPages);
    refreshPagination();
  });
});
