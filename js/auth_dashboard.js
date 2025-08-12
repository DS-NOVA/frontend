import { initAuth, authFetch, API_BASE } from './auth.js';

(async function () {
  await initAuth();

  //경로 변경하기
  const me = await authFetch(`${API_BASE}/nova/auth/me`);
  if (!me.ok) {
    alert('세션이 만료되었거나 인증 실패. 다시 로그인해주세요.');
    window.location.href = '/html/login.html';
    return;
  }
})();

