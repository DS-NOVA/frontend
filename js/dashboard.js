document.addEventListener('DOMContentLoaded', () => {
  const uploadButton = document.getElementById('dashboard-upload');
  const fileInput = document.getElementById('videoInput');
  const inputVideo = document.getElementById('inputVideo');
  const outputVideo = document.getElementById('outputVideo');
  const overlayVideo = document.getElementById('overlayVideo');
  const pauseBtn = document.getElementById('pauseBtn');
  
  let pause = false;
  
  //변경될 값
  const overlayRanges = [
    { start: 3, end: 5 },
    { start: 8, end: 10 }
  ];

  function handlerTimeUpdate(){
    console.log("결과 비디오 실행 중");

        const currentTime = outputVideo.currentTime;
        if (pause) return;

        const activeRange = overlayRanges.find(
          range => currentTime >= range.start && currentTime <= range.end
        );
        console.log(activeRange);

         //변환 구간일 경우 
        if(activeRange){
          const offset = currentTime - activeRange.start;

          overlayVideo.style.opacity = "1";
          if (overlayVideo.paused) {
            //변환 구간에서 정지인 경우
            overlayVideo.currentTime = offset;
            overlayVideo.play();
          } else {
            // 변환 중에서 재생 중인 경우 end 값에 도달 시 정지
            const drift = Math.abs(overlayVideo.currentTime - offset);
              if (drift > 0.2) {
                overlayVideo.currentTime = offset;
              }
          }
        }else{
          //변환 구간이 아닌 경우 정지
          overlayVideo.pause();
          overlayVideo.style.opacity = "0";
        }
  }

  function handlerPauseBtn(){
    pause = !pause;

        if (pause) {
          console.log("click pause");
          outputVideo.pause();
          overlayVideo.pause();
        } else {
          console.log("click start");
          outputVideo.play();

          const currentTime = outputVideo.currentTime;

          const activeRange = overlayRanges.find(
            range => currentTime >= range.start && currentTime <= range.end
          );

          if (activeRange) {
            overlayVideo.style.opacity = "1";
            overlayVideo.currentTime = currentTime - activeRange.start;
            overlayVideo.play();
          }
        }
  }

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
      outputVideo.removeEventListener("timeupdate", handlerTimeUpdate);

      pause = false;
      overlayVideo.pause();
      overlayVideo.currentTime = 0;
      overlayVideo.style.opacity = "0";

      outputVideo.addEventListener("timeupdate", handlerTimeUpdate);

      //pauseBtn
      pauseBtn.removeEventListener('click', handlerPauseBtn);
      pauseBtn.addEventListener('click', handlerPauseBtn);
      

      /*타임라인 */
      outputVideo.addEventListener('loadedmetadata', () => {
        //이전 타임라인 제거
        document.querySelector('.timeline-container').innerHTML = "";
        //전체 길이 계산
        const duration = outputVideo.duration;
        //시작, 끝 구역 가져오기
        overlayRanges.forEach(range => {
          const bar = document.createElement('div');
          bar.classList.add('timeline-bar');

          // 비율 계산
          const leftPercent = (range.start / duration) * 100;
          const widthPercent = ((range.end - range.start) / duration) * 100;
          //붙여 넣기
          bar.style.left = `${leftPercent}%`;
          bar.style.width = `${widthPercent}%`;

          // 삽입
          document.querySelector('.timeline-container').appendChild(bar);
    });
      });
    }
  });
  
});
