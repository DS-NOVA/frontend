
document.addEventListener("DOMContentLoaded", () => {
  console.log("Frontend loaded!");
});

// 공통 컴포넌트 로드
function loadComponent(id, url) {
  fetch(url)
    .then(response => response.text())
    .then(data => {
      document.getElementById(id).innerHTML = data;

            
        document.getElementById('nav-log-in').addEventListener('click', function(){
        window.location.href='login.html';
        });

        document.getElementById('nav-sign-up').addEventListener('click', function(){
        window.location.href='signup.html';
        });
    });
}

loadComponent('nav', 'nav.html');