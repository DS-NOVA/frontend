
document.addEventListener("DOMContentLoaded", () => {
  console.log("Frontend loaded!");
});

// 공통 컴포넌트 로드
function loadComponent(id, url) {
  fetch(url)
    .then(response => response.text())
    .then(data => {
      document.getElementById(id).innerHTML = data;

      //로고 클릭 시 이동
      const logo = document.getElementById('nav_logo');
      if (logo) {
        logo.addEventListener('click', function () {
          console.log("로고 클릭");
          window.location.href = "main.html";
        });
      }

        //로그인 유무에 따른 분기 
        if(!isLoggedIn()){
          //로그인이 되어있지 않을 경우 sign in/ log in이 보여야 함 
          document.querySelector('.user-profile').style.display = 'none'; 

          document.getElementById('nav-log-in').addEventListener('click', function(){
            window.location.href='login.html';
            });
          document.getElementById('nav-sign-up').addEventListener('click', function(){
            window.location.href='signup.html';
            });
        }else{
          //로그인이 되어있을 경우 id가 보이게끔 함
          document.querySelector('.non-user-profile').style.display = 'none';
          document.getElementById('user-id').textContent = getEmail();
        }
    });
}

loadComponent('nav', 'nav.html'); 

