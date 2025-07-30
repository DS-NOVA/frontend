
document.getElementById('login-btn').addEventListener('click', async (e) => {
  e.preventDefault();
    //로그인 버튼 눌렀을 때
    //필드가 다 채워졌는지 2차 확인
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  if(!email || password.length < 6){
        e.preventDefault();
        alert("모든 필드를 바르게 입력해주세요.");
    }

  //백엔드 연동하기 (토큰 생성되어야 함 -> 로컬 스토리지에 저장)
  const formData = new URLSearchParams();
  formData.append("username", email);  // 백엔드에서는 OAuth2PasswordRequestForm 때문에 email를 username으로 받아야 함
  formData.append("password", password);

  try {
    const response = await fetch('http://127.0.0.1:8000/nova/auth/login', {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const result = await response.json();
    if (response.ok) {
      // 로그인 성공 시에만 이동
      window.location.href = 'dashboard.html';
      localStorage.setItem("accessToken", result.access_token); //추후 httpOnly 쿠키 (백엔드) 로 변경
    } else {
      alert(result.message || '로그인 실패');
    }
  } catch (err) {
    console.error('로그인 에러:', err);
  }
});

