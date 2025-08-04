
document.getElementById('main-dashboard').addEventListener('click', function(){
  
  
  if(!isLoggedIn()){
    //토큰이 없는 경우는 로그인 페이지로
    window.location.href='login.html';
  }else{
    //이전에 로그인한 기록이 있는 경우는 자동으로 대시보드 페이지
    window.location.href='dashboard.html';
  }
})
