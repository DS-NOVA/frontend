document.addEventListener("DOMContentLoaded", () => {
  console.log("Frontend loaded!");
});

// 공통 컴포넌트 로드
function loadComponent(id, url) {
  fetch(url)
    .then(response => response.text())
    .then(data => {
      document.getElementById(id).innerHTML = data;
    });
}

loadComponent('nav', 'nav.html');
