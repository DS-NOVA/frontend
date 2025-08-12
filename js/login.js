import { API_BASE } from './auth.js';

const form = document.querySelector('.login-form');   // 폼에 바인딩 권장
const loginBtn = document.getElementById('login-btn');

function bindOnce(el, type, handler) {
  if (el.dataset.bound) return;
  el.dataset.bound = '1';
  el.addEventListener(type, handler);
}

bindOnce(form, 'submit', onSubmit);
bindOnce(loginBtn, 'click', (e) => {
  e.preventDefault();
  form?.requestSubmit(); // 버튼 클릭도 폼 submit 경로로 통일
});

async function onSubmit(e){
  e.preventDefault();
    //로그인 버튼 눌렀을 때
    //필드가 다 채워졌는지 2차 확인
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  if(!email || password.length < 6){
        e.preventDefault();
        alert("모든 필드를 바르게 입력해주세요.");
        return;
    }

  //백엔드 연동하기
  const formData = new URLSearchParams();
  formData.append("username", email);  // 백엔드에서는 OAuth2PasswordRequestForm 때문에 email를 username으로 받아야 함
  formData.append("password", password);

  try {
    const response = await fetch(`${API_BASE}/nova/auth/login`, {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, //OAuth2PasswordRequestForm
      credentials: 'include' //access 토큰 재발급
    });

    const data = await response.json().catch(()=> ({}));

    if (response.ok) {
      // 전역 토큰에 반드시 저장
      window.ACCESS_TOKEN = data.access_token || null;
      window.location.href = '/html/dashboard.html';
      return;
    } 
    // 에러 메시지 안전 파싱
    const detail = Array.isArray(data?.detail)
      ? (data.detail[0]?.msg || JSON.stringify(data.detail))
      : (data?.detail || data?.message || '로그인 실패');
    alert(typeof detail === 'string' ? detail : JSON.stringify(detail));

  } catch (err) {
    console.error('로그인 에러:', err);
    alert('네트워크 오류가 발생했습니다.');
  }finally {
    loginBtn.disabled = false;
    loginBtn.textContent = '로그인';
  }
}

