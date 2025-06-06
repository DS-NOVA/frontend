function openModal(title) {
  document.querySelector('.modal-title').textContent = title;
  document.getElementById('feedbackModal').style.display = 'block';
}

function closeModal() {
  document.getElementById('feedbackModal').style.display = 'none';
  document.querySelector('.feedback-textarea').value = '';
}

function submitFeedback() {
  const feedback = document.querySelector('.feedback-textarea').value;
  if (feedback.trim()) {
    alert('피드백이 전송되었습니다.');
    closeModal();
  } else {
    alert('피드백 내용을 입력해주세요.');
  }
}

// 모달 외부 클릭 시 모달 닫기
window.onclick = function(event) {
  const modal = document.getElementById('feedbackModal');
  if (event.target === modal) closeModal();
}

// 페이징 관련 변수
const itemsPerPage = 4;
let currentPage = 1;
let expanded = false;  // 접힘/펼침 상태 확인용

document.addEventListener('DOMContentLoaded', function() {
  const historyItems = document.querySelectorAll('.history-item');
  const showMoreBtn = document.getElementById('showMoreBtn');
  const moreButtonWrapper = document.getElementById('moreButtonWrapper');

  function updateVisibleItems() {
    const totalItems = historyItems.length;
    const itemsToShow = currentPage * itemsPerPage;

    historyItems.forEach((item, index) => {
      item.style.display = index < itemsToShow ? 'grid' : 'none';
    });

    // 버튼 텍스트 바꾸기
    if (itemsToShow >= totalItems) {
      showMoreBtn.textContent = '접기';
      expanded = true;
    } else {
      showMoreBtn.textContent = '더 보기';
      expanded = false;
    }
  }

  showMoreBtn.addEventListener('click', () => {
    const totalPages = Math.ceil(historyItems.length / itemsPerPage);

    if (expanded) {
      // 접기 기능
      currentPage = 1;
      updateVisibleItems();
    } else {
      // 펼치기 기능
      currentPage++;
      updateVisibleItems();
    }
  });

  updateVisibleItems();
});