import { API_BASE, ensureAccess, authFetch, initAuth, isLoggedIn, getUserEmailLazy } from './auth.js';
import {toast} from './toast.js'
// 전역
let currentVideoTitle = '';
const itemsPerPage = 4;
let currentPage = 1;
let expanded = false;
// 전역
let paginationState = { total: 0, limit: 12, offset: 0 };

/* =========================
 * ✅ user_id 추출 유틸
 * ========================= */
function base64UrlDecode(str) {
  try {
    const s = str.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4;
    const withPad = pad ? s + '='.repeat(4 - pad) : s;
    return atob(withPad);
  } catch {
    return null;
  }
}
function getUserEmailFromContext() {
  // 1) 전역 객체
  const email1 =
    (window.CURRENT_USER && window.CURRENT_USER.email) ||
    (window.USER && window.USER.email);
  if (email1 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email1))) {
    return String(email1);
  }

  // 2) 토큰 클레임
  const token = window.ACCESS_TOKEN;
  if (!token || token.split('.').length < 2) return null;
  const payloadJson = base64UrlDecode(token.split('.')[1]);
  if (!payloadJson) return null;

  try {
    const p = JSON.parse(payloadJson);

    // 후보들 순회
    const candidates = [
      p.email,
      Array.isArray(p.emails) ? p.emails[0] : undefined,
      p.preferred_username,
      p.upn,                // AzureAD 계정일 때 종종 이메일
      p.login,              // 일부 IdP
    ].filter(Boolean);

    for (const c of candidates) {
      if (c && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(c))) {
        return String(c);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function getUserIdFromContext() {
  const id =
    (window.CURRENT_USER && window.CURRENT_USER.id) ||
    (window.USER && window.USER.id);
  if (id != null) return String(id);
  const token = window.ACCESS_TOKEN;
  if (!token || token.split('.').length < 2) return null;
  const payloadJson = base64UrlDecode(token.split('.')[1]);
  if (!payloadJson) return null;
  try {
    const p = JSON.parse(payloadJson);
    const raw = p.user_id ?? p.sub ?? p.uid ?? p.id;
    return raw == null ? null : String(raw);
  } catch { return null; }
}

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
  
  try{
    const feedback = document.querySelector('.feedback-textarea').value.trim();
    if (!feedback) return alert('피드백 내용을 입력해주세요.');

    await ensureAccess(); // 기존 로직 유지
    if (!window.ACCESS_TOKEN) return alert('로그인이 필요합니다.');

    const userEmail = getUserEmailFromContext();
    const userIdStr = getUserIdFromContext();     // 기존 유틸 그대로
    console.log('[whoami] USER=', window.USER, 'USER.email=', window.USER?.email,
    'CURRENT_USER=', window.CURRENT_USER, 'CURRENT_USER.email=', window.CURRENT_USER?.email);
    if (!userEmail && !userIdStr) {
      alert('사용자 식별값(이메일 또는 ID)을 확인할 수 없습니다. 다시 로그인해 주세요.');
      return;
    }
    const feedbackData = {
      user_email: userEmail ?? undefined,
      user_id: userIdStr,
      feedback_type: 'general',
      video_title: currentVideoTitle,
      content: feedback,
    };

    // (디버깅용) 실제 전송 값 확인
    console.log('[feedback] email:', userEmail, 'id:', userIdStr);

    const resp = await authFetch(`${API_BASE}/nova/auth/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedbackData),
    });

    if (!resp.ok) {
      // ✅ 에러 본문을 최대한 읽어서 안내
      const txt = await resp.text().catch(() => '');
      console.error('피드백 실패:', resp.status, txt);

      if (resp.status === 401) {
        alert('로그인이 필요합니다.');
      } else {
        let extra = '';
        try {
          const j = JSON.parse(txt);
          if (j?.detail) {
            if (Array.isArray(j.detail)) {
              extra =
                '\n' +
                j.detail
                  .map(e => {
                    const loc = Array.isArray(e.loc) ? e.loc.join('.') : '';
                    return `${e.msg || e.type}${loc ? ` (${loc})` : ''}`;
                  })
                  .join('\n');
            } else if (typeof j.detail === 'string') {
              extra = '\n' + j.detail;
            } else if (j.detail?.msg) {
              extra = '\n' + j.detail.msg;
            }
          } else if (j?.message) {
            extra = '\n' + j.message;
          }
        } catch {
          // ignore JSON parse error
        }
        alert(`피드백 실패: ${resp.status}${extra}`);
      }
      return;
    }

    const result = await resp.json().catch(() => ({}));
    //alert(result.message || '피드백이 전송되었습니다.');
    toast('피드백이 전송되었습니다.', { type: 'success' });
    closeModal();
  } catch (e) {
    console.error('피드백 전송 오류:', e);
    alert('피드백 전송 중 오류가 발생했습니다. 다시 시도해 주세요.');
  }
}

function refreshPagination(state) {
  if (!state) return; // 인자 누락 방지

  const pageInfo = document.getElementById('page-info');
  const prevBtn = document.getElementById('page-prev');
  const nextBtn = document.getElementById('page-next');
  if (!pageInfo || !prevBtn || !nextBtn) {
    console.warn('[pagination] 필요한 엘리먼트가 없습니다.');
    return;
  }

  const { total, limit, offset } = state;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  pageInfo.textContent = `${currentPage} / ${totalPages}`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;

  // 버튼 이벤트(중복 바인딩 방지용 먼저 제거)
  prevBtn.onclick = null;
  nextBtn.onclick = null;
  prevBtn.onclick = async () => {
    if (currentPage <= 1) return;
    const newOffset = Math.max(0, offset - limit);
    await renderPage(newOffset, limit);
  };
  nextBtn.onclick = async () => {
    if (currentPage >= totalPages) return;
    const newOffset = offset + limit;
    await renderPage(newOffset, limit);
  };
}

async function renderPage(offset = 0, limit = 12) {
  const historyListEl = document.getElementById('historyList');
  historyListEl.innerHTML = '';

  const { items, total, limit: L, offset: O } = await loadHistory(offset, limit);

  items.forEach(item => {
    renderHistoryItem(item.video_title || `video_${item.video_id}`, item.video_id);
  });

  paginationState = { total, limit: L, offset: O }; // 전역 갱신
  refreshPagination(paginationState);
}

async function saveHistory(videoId) {
  try {
    await ensureAccess();
    const response = await authFetch(
      `${API_BASE}/nova/history/${encodeURIComponent(videoId)}`,
      {
        method: 'POST',
      }
    );
    if (response.ok) {
      const result = await response.json().catch(() => ({}));
      console.log('히스토리 저장 완료:', result);
    } else {
      console.error('히스토리 저장 실패:', response.status);
    }
  } catch (err) {
    console.error('히스토리 저장 중 오류:', err);
  }
}

async function loadHistory(offset = 0, limit = 12) {
  await ensureAccess();
  const res = await authFetch(
    `${API_BASE}/nova/history/list?offset=${offset}&limit=${limit}`
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`히스토리 로드 실패: ${res.status} ${t}`);
  }
  const data = await res.json();

  // 목록 렌더는 호출한 쪽에서 하게 하고, 여기서는 데이터만 반환
  return {
    items: Array.isArray(data.history) ? data.history : [],
    total: Number(data.total ?? 0),
    limit: Number(data.limit ?? limit),
    offset: Number(data.offset ?? offset),
  };
}
async function deleteHistory(videoId) {
  await ensureAccess();
  const res = await authFetch(
    `${API_BASE}/nova/history/${encodeURIComponent(videoId)}`,
    {
      method: 'DELETE',
    }
  );

  if (res.ok) return await res.json().catch(() => ({}));

  const errText = await res.text().catch(() => '');
  console.error('히스토리/비디오 삭제 실패:', res.status, errText);
  if (res.status === 401) alert('삭제 권한이 없습니다. 로그인 상태를 확인해주세요.');
  else if (res.status === 404) alert('이미 삭제되었거나 존재하지 않습니다.');
  else alert(`삭제 실패: ${res.status}`);
  return null;
}

function renderHistoryItem(title, videoId) {
  const historyList = document.getElementById('historyList');
  const div = document.createElement('div');
  div.className = 'history-item';
  div.dataset.id = videoId;

  const titleDiv = document.createElement('div');
  titleDiv.className = 'video-title';
  titleDiv.textContent = title;
  titleDiv.style.cursor = 'pointer';
  titleDiv.onclick = () => {
    window.location.href = `/html/dashboard.html?video_id=${encodeURIComponent(
      videoId
    )}`;
  };

  const feedbackBtn = document.createElement('button');
  feedbackBtn.className = 'feedback-btn';
  feedbackBtn.textContent = '피드백 보내기';
  feedbackBtn.onclick = () => openModal(title);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = '삭제';
  deleteBtn.onclick = async () => {
    const res = await deleteHistory(videoId); // ✅ 항상 전체 삭제
    if (res) {
      //alert(res.message || '삭제 완료');
      toast('삭제 완료', { type: 'success' });
      await renderPage(paginationState.offset, paginationState.limit); // 목록/페이지네이션 갱신
    }
  };

  div.appendChild(titleDiv);
  div.appendChild(feedbackBtn);
  div.appendChild(deleteBtn);
  historyList.appendChild(div);
}

document.addEventListener('DOMContentLoaded', async () => {
  await initAuth();
  const loggedIn = await isLoggedIn();
  if (!loggedIn) {
    alert('로그인이 필요합니다.');
    window.location.replace('/html/login.html?next=/html/history.html');
    return;
  }

  // 최초 1페이지
  await renderPage(0, 12);

  // “더 보기” 버튼을 페이지 증가로 매핑 (원한다면 유지)
  const showMoreBtn = document.getElementById('showMoreBtn');
  if (showMoreBtn) {
    showMoreBtn.onclick = async () => {
      const { total, limit, offset } = paginationState;
      const currentPage = Math.floor(offset / limit) + 1;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      if (currentPage < totalPages) {
        await renderPage(offset + limit, limit);
      }
    };
  }

  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('feedback-submit-btn')?.addEventListener('click', submitFeedback);
});
