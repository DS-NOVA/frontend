/*document.getElementById('login-btn').addEventListener('click', () => {
  window.location.href = 'dashboard.html';
});*/

//추후 수정
document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await response.json();
    if (response.ok) {
      // 로그인 성공 시에만 이동
      window.location.href = 'dashboard.html';
    } else {
      alert(result.message || '로그인 실패');
    }
  } catch (err) {
    console.error('로그인 에러:', err);
  }
});

