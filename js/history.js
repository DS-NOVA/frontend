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
  const feedback = document.querySelector('.feedback-textarea').value;
  
  if (!feedback.trim()) {
    alert('피드백 내용을 입력해주세요.');
    return;
  }

  try {
    // 사용자 ID 가져오기 (실제 로그인 시스템에 맞게 수정 필요)
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
        'Authorization': 'dummy-token'
      },
      body: JSON.stringify(feedbackData)
    });

    if (response.ok) {
      const result = await response.json();
      alert(result.message);
      closeModal();
    } else {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('피드백 전송 오류:', error);
    alert('피드백 전송 중 오류가 발생했습니다. 다시 시도해 주세요.');
  }
}

// 모달 외부 클릭 시 모달 닫기
window.onclick = function(event) {
  const modal = document.getElementById('feedbackModal');
  if (event.target === modal) closeModal();
}

document.addEventListener('DOMContentLoaded', function() {
  const historyList = document.getElementById('historyList');
  const showMoreBtn = document.getElementById('showMoreBtn');

  const historyData = JSON.parse(localStorage.getItem("video_history") || "[]");

  // 1. 기존 하드코딩 제거
  historyList.innerHTML = "";

  // 2. 실제 히스토리 항목을 DOM으로 생성
  historyData.forEach(item => {
    const div = document.createElement("div");
    div.className = "history-item";

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
    deleteBtn.onclick = () => {
      const updated = historyData.filter(h => h.title !== item.title);
      localStorage.setItem("video_history", JSON.stringify(updated));
      div.remove();
      refreshPagination(); // 삭제 후 재렌더링
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