document.addEventListener('DOMContentLoaded', () => {
  const uploadButton = document.getElementById('dashboard-upload');
  const fileInput = document.getElementById('videoInput');
  const inputVideo = document.getElementById('inputVideo');
  const outputVideo = document.getElementById('outputVideo');
  const overlayVideo = document.getElementById('overlayVideo');

  const startTime = 3, endTime = 5; //추후에 시작, 끝 타임 가져오기

  uploadButton.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];

  if (file) {
    const videoURL = URL.createObjectURL(file);
    inputVideo.src = videoURL;
    inputVideo.load();
    inputVideo.play();

    /*추후 변경*/
    outputVideo.src = videoURL;
    outputVideo.load();
    overlayVideo.load();

    outputVideo.play();

    //결과 비디오 시작 시
    outputVideo.addEventListener("timeupdate", () => {
      const currentTime = outputVideo.currentTime; 
        if(currentTime >= startTime && currentTime <= endTime){
          console.log("it's overlay");
          if(overlayVideo.paused && overlayVideo.style.display ==="none"){
            overlayVideo.style.display = "block";
            overlayVideo.play();
          }
      }else{//지정 시간 외에
        if (!overlayVideo.paused && overlayVideo.style.display === "block"){
          overlayVideo.pause();
          overlayVideo.style.display = "none";
        } 
      }
    });
    outputVideo.addEventListener('pause', () => {
    overlayVideo.pause();
  });
    
  }
});
});
