import { ensureAccess, authFetch, API_BASE } from './auth.js';

//로그인 아닌 경우
function showGuest() {
  document.querySelector('.user-profile')?.style.setProperty('display', 'none');
  document.querySelector('.non-user-profile')?.style.removeProperty('display');

  document.getElementById('nav-log-in')?.addEventListener('click', () => {
    window.location.href = '/html/login.html';
  });
  document.getElementById('nav-sign-up')?.addEventListener('click', () => {
    window.location.href = '/html/signup.html';
  });
}
//로그인 된 경우
function showUser(email, imageUrl) {
  document.querySelector('.non-user-profile')?.style.setProperty('display', 'none');
  document.querySelector('.user-profile')?.style.removeProperty('display');
  window.USER = { ...(window.USER || {}), email, imageUrl };
  window.CURRENT_USER = { ...(window.CURRENT_USER || {}), email, imageUrl };

  const el = document.getElementById('user-id');
  if (el) el.textContent = email || 'User';
  
  const imgEl = document.querySelector('.user_img');
  if (imgEl) {
    if (imageUrl?.startsWith('/')) {
      imgEl.src = `${API_BASE}${imageUrl}`;  
    } else if (imageUrl) {
      imgEl.src = imageUrl;                   // 절대 URL이면 그대로
    } else {
      imgEl.src = '/img/user_img.png';        // 기본 이미지
    }
  }

  const history = document.getElementById('nav-history');
  if (history && !history.dataset.bound) {
    history.dataset.bound = '1';
    history.addEventListener('click', () => {
      window.location.href = '/html/history.html'; 
    });
  }

  const btn = document.getElementById('nav-logout');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      await authFetch(`${API_BASE}/nova/auth/logout`, { method: 'POST' }).catch(()=>{});
      window.ACCESS_TOKEN = null;
      window.location.replace('/html/main.html');
    });
  }
}
//로고 클릭 시 이동
function clickLogo(){
  document.getElementById('nav_logo').addEventListener('click', async() => {
    window.location.href = '/html/main.html';
  });
}

async function bootNavLogic() {
  showGuest();
  try {
    await ensureAccess();                 // 필요할 때만 refresh (CSRF 없으면 패스)
    if (!window.ACCESS_TOKEN) return;     // 비로그인 -> 게스트 유지
    const resp = await authFetch(`${API_BASE}/nova/auth/me`);//여기 경로 추후 수정!!
    if (!resp.ok) return;
    const data = await resp.json();
    showUser(data?.user?.user_email, data?.user?.user_image);
  } catch {}
}

//처음 동작하는 함수
async function mountNav() {
  const host = document.getElementById('nav');
  if (!host) return;
  const res = await fetch('/html/nav.html');
  if (!res.ok) return;
  host.innerHTML = await res.text();
  clickLogo();
  await bootNavLogic();
}


document.addEventListener('DOMContentLoaded', async () => {
  await mountNav();
});
