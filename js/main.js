import { ensureAccess } from './auth.js';

document.getElementById('main-dashboard')?.addEventListener('click', async () => {
  try {
    //갱신 시도
    await ensureAccess();
    //토큰이 있으면 곧바로 대시보드
    if (window.ACCESS_TOKEN) {
      window.location.href = '/html/dashboard.html';
      return;
    }
    //없으면 로그인 페이지
    window.location.href = '/html/login.html';
  } catch {
    //네트워크 오류 등도 로그인으로
    window.location.href = '/html/login.html';
  }
});
