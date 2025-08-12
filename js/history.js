import { API_BASE } from './auth.js';
// 전역 변수
let currentVideoTitle = '';

// 페이징 관련 변수
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
  if (!feedback) {
    alert('피드백 내용을 입력해주세요.');
    return;
  }

  const token = localStorage.getItem('access_token'); 
  if (!token) return alert('로그인이 필요합니다.');

  try {
    // 사용자 ID 가져오기
    const userId = document.getElementById('user-id').textContent || 'anonymous';
    
    const feedbackData = {
      user_id: userId,
      feedback_type: "general",
      video_title: currentVideoTitle,
      content: feedback
    };

    // API 호출
    const response = await fetch(`${API_BASE}/nova/auth/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(feedbackData)
    });

    if (!res.ok) {
      const txt = await res.text().catch(()=> '');
      console.error('피드백 실패:', res.status, txt);
      if (res.status === 401) alert('로그인이 필요합니다.');
      else alert(`피드백 실패: ${res.status}`);
      return;
    }

    const result = await res.json();
    alert(result.message || '피드백이 전송되었습니다.');
    closeModal();
  } catch (e) {
    console.error('피드백 전송 오류:', e);
    alert('피드백 전송 중 오류가 발생했습니다. 다시 시도해 주세요.');
  }
}

// 모달 외부 클릭 시 모달 닫기
window.onclick = function(event) {
  const modal = document.getElementById('feedbackModal');
  if (event.target === modal) closeModal();
}

document.addEventListener('DOMContentLoaded', async function() {
  const historyList = document.getElementById('historyList');
  const showMoreBtn = document.getElementById('showMoreBtn');

  const historyData = JSON.parse(localStorage.getItem("video_history") || "[]");

  const token = localStorage.getItem("access_token");
  const videoIds = historyData.map(item => item.video_id);
  if (token && videoIds.length > 0) {
    await loadHistory(token, videoIds);
    refreshPagination();
  }

  // 1. 기존 하드코딩 제거
  historyList.innerHTML = "";

  // 2. 실제 히스토리 항목을 DOM으로 생성
  historyData.forEach(item => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.dataset.id = item.video_id; 

    const titleDiv = document.createElement("div");
    titleDiv.className = "video-title";
    titleDiv.textContent = item.title;

    const feedbackBtn = document.createElement("button");
    feedbackBtn.className = "feedback-btn";
    feedbackBtn.textContent = "피드백 보내기";
    feedbackBtn.onclick = () => openModal(item.title);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "삭제";

    deleteBtn.onclick = async () => {
      const token = localStorage.getItem("access_token");
      const ok = await deleteHistory(item.video_id, token);

      if (ok) {
        const current = JSON.parse(localStorage.getItem("video_history") || "[]")
        const updated = current.filter(h => h.video_id !== item.video_id);
        localStorage.setItem("video_history", JSON.stringify(updated));
        div.remove();
        refreshPagination();
        alert("히스토리 삭제 완료");
      }
    };

    div.appendChild(titleDiv);
    div.appendChild(feedbackBtn);
    div.appendChild(deleteBtn);

    historyList.appendChild(div);
  });

  // 3. 페이징 적용 함수
  function updateVisibleItems() {
    const historyItems = document.querySelectorAll('.history-item');
    const totalItems = historyItems.length;
    const itemsToShow = currentPage * itemsPerPage;

    historyItems.forEach((item, index) => {
      item.style.display = index < itemsToShow ? 'grid' : 'none';
    });

    if (itemsToShow >= totalItems) {
      showMoreBtn.textContent = '접기';
      expanded = true;
    } else {
      showMoreBtn.textContent = '더 보기';
      expanded = false;
    }
  }

  function refreshPagination() {
    const historyItems = document.querySelectorAll('.history-item');
    currentPage = 1;
    updateVisibleItems();
    if (historyItems.length <= itemsPerPage) {
      showMoreBtn.style.display = 'none';
    } else {
      showMoreBtn.style.display = 'inline-block';
    }
  }

  showMoreBtn.addEventListener('click', () => {
    const totalItems = document.querySelectorAll('.history-item').length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    if (expanded) {
      currentPage = 1;
    } else {
      currentPage++;
    }
    updateVisibleItems();
  });

  // 초기 표시
  refreshPagination();
});

// 히스토리 저장 함수
async function saveHistory(videoId, token) {
  try {
    const response = await fetch(`${API_BASE}/nova/history/${videoId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const result = await response.json();
      console.log("히스토리 저장 완료:", result);
    } else {
      console.error("히스토리 저장 실패:", response.status);
    }
  } catch (err) {
    console.error("히스토리 저장 중 오류:", err);
  }
}

async function loadHistory(token, userVideoIds) {
  const historyList = document.getElementById("historyList");
  historyList.innerHTML = "";

  for (const videoId of userVideoIds) {
    const res = await fetch(`${API_BASE}/nova/history/${videoId}`, {
      headers: {
        'Authorization': `Bearer ${token}`}
    });
    
    if (res.ok) {
      const data = await res.json();
      const historyItem = data.history[0]; // 여러 개일 경우 조정
      renderHistoryItem(historyItem.video_title, historyItem.video_id); // 이미 있는 렌더링 함수 재사용
    }
  }
}

async function deleteHistory(videoId, token) {
  const res = await fetch(`${API_BASE}/nova/history/${videoId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (res.ok) {
    return true;
  } else {
    const errText = await res.text().catch(() => "");
    console.error("히스토리 삭제 실패:", res.status, errText);
    if (res.status === 401) alert("삭제 권한이 없습니다. 로그인 상태를 확인해주세요.");
    else alert(`삭제 실패: ${res.status}`);
    return false;
  }
}

function renderHistoryItem(title, videoId) {
  const historyList = document.getElementById("historyList");

  const div = document.createElement("div");
  div.className = "history-item";
  div.dataset.id = videoId;

  const titleDiv = document.createElement("div");
  titleDiv.className = "video-title";
  titleDiv.textContent = title;

  const feedbackBtn = document.createElement("button");
  feedbackBtn.className = "feedback-btn";
  feedbackBtn.textContent = "피드백 보내기";
  feedbackBtn.onclick = () => openModal(title);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "삭제";
  deleteBtn.onclick = async () => {
    const token = localStorage.getItem("access_token");
    await deleteHistory(videoId, token);
    const updated = JSON.parse(localStorage.getItem("video_history") || "[]").filter(h => h.video_id !== videoId);
    localStorage.setItem("video_history", JSON.stringify(updated));
    div.remove();
    refreshPagination();
  };

  div.appendChild(titleDiv);
  div.appendChild(feedbackBtn);
  div.appendChild(deleteBtn);

  historyList.appendChild(div);
}