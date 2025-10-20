export function toast(
    message,
    { type = 'info', duration = 0, dismissible = true } = {}
  ) {
    // duration=0 또는 미설정 => 자동 삭제 안 함 (원하면 ms 넣어서 자동삭제 가능)
  
    // 루트 만들기
    let root = document.getElementById('toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toast-root';
      root.setAttribute('aria-live', 'polite');
      document.body.appendChild(root);
    }
  
    // 엘리먼트
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
      <div class="row">
        <span class="msg"></span>
        ${dismissible ? '<button class="close" aria-label="닫기" title="닫기">×</button>' : ''}
      </div>
    `;
    el.querySelector('.msg').textContent = String(message ?? '');
  
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
  
    const remove = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 220);
    };
  
    // X 버튼으로만 닫히게 (자동삭제 OFF)
    if (dismissible) {
      el.querySelector('.close').onclick = remove;
    }
  
    // 필요하면 개별 호출에서 duration 전달해 자동삭제를 켤 수 있음
    if (Number.isFinite(duration) && duration > 0) {
      setTimeout(remove, duration);
    }
  
    return { close: remove };
  }
