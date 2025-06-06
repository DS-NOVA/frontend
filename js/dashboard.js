document.addEventListener('DOMContentLoaded', () => {
  const uploadButton = document.getElementById('dashboard-upload');
  const fileInput = document.getElementById('videoInput');
  const inputVideo = document.getElementById('inputVideo');
  const outputVideo = document.getElementById('outputVideo');
  let selectedFile = null;
  const overlayVideo = document.getElementById('overlayVideo');
  const pauseBtn = document.getElementById('pauseBtn');
  
  let handlerTimeUpdate = null;
  let pause = false;
  let currentInputURL = null;
  let currentOutputURL = null;
  let overlayRanges = [];

  //예제로 쓸 데이터 구조
  const videoData = {
    'coffee.mp4': {
      outputSrc: '../videos/coffee.mp4',
      overlayRanges: [
        { start: 3, end: 5, overlaySrc: '../overlays/pattern.mp4' },
        { start: 8, end: 10, overlaySrc: '../overlays/dog.mp4' }
      ]
    },
    'write.mp4': {
      outputSrc: '../videos/write.mp4',
      overlayRanges: [
        { start: 2, end: 4, overlaySrc: '../overlays/pattern.mp4' },
        { start: 7, end: 10, overlaySrc: '../overlays/dog.mp4' }
      ]
    }
  };

  function handlerPauseBtn(){
        if (pause)  {
    console.log("click start");
    outputVideo.play().then(() => {
      const currentTime = outputVideo.currentTime;
      const activeRange = overlayRanges.find(
        range => currentTime >= range.start && currentTime <= range.end
      );

      if (activeRange) {
        overlayVideo.style.opacity = "1";
        overlayVideo.currentTime = currentTime - activeRange.start;
        overlayVideo.play();
      }

      pause = false; // 성공한 경우에만 상태 변경
    }).catch(e => {
      console.log('Autoplay prevented:', e);
    });
  } else {
    console.log("click pause");
    outputVideo.pause();
    overlayVideo.pause();
    pause = true;
  }
          
}

  uploadButton.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if(!file) return;

      const videoKey = file.name;
      const currentVideo = videoData[videoKey];
      if(!currentVideo) return alert("등록되지 않은 영상입니다.");

    // 메모리 누수 방지로 코드 수정
      if (currentInputURL) {
        URL.revokeObjectURL(currentInputURL);
      }
      if (currentOutputURL) {
        URL.revokeObjectURL(currentOutputURL);
      }

      // 새 URL 생성 및 저장
      const inputURL = URL.createObjectURL(file);
      const outputURL = currentVideo.outputSrc || inputURL;  // 추후 진짜 output 이랑 분리 시 다른 파일로 대체

      inputVideo.src = inputURL;
      inputVideo.load();
      inputVideo.play();

      outputVideo.src = outputURL;
      outputVideo.load();

      currentInputURL = inputURL;
      currentOutputURL = outputURL;
  
      //range 설정
      overlayRanges = currentVideo.overlayRanges;
      let currentOverlay = null;


      //결과 비디오 시작 시
      
      if(handlerTimeUpdate){
        outputVideo.removeEventListener("timeupdate", handlerTimeUpdate);
      }
      handlerTimeUpdate =() => {
          console.log("결과 비디오 실행 중");
              if (pause) return;
              const currentTime = outputVideo.currentTime;

              const activeRange = overlayRanges.find(
                range => currentTime >= range.start && currentTime <= range.end
              );
              console.log(activeRange);

              //변환 구간일 경우 
              if(activeRange){
                const offset = currentTime - activeRange.start;
                if (currentOverlay !== activeRange) {
                        overlayVideo.src = activeRange.overlaySrc;
                        overlayVideo.load();
                        overlayVideo.currentTime = 0;
                        overlayVideo.play();
                        currentOverlay = activeRange;
                      }
                overlayVideo.style.opacity = "1";
                if (Math.abs(overlayVideo.currentTime - offset) > 0.2) {
                  overlayVideo.currentTime = offset;
                }
              }else{
                //변환 구간이 아닌 경우 정지
                overlayVideo.pause();
                overlayVideo.style.opacity = "0";
                currentOverlay = null;
              }
        };
      
        pause = false;
      overlayVideo.pause();
      overlayVideo.currentTime = 0;
      overlayVideo.style.opacity = "0";

      outputVideo.addEventListener("timeupdate", handlerTimeUpdate);

      //pauseBtn
      pauseBtn.removeEventListener('click', handlerPauseBtn);
      pauseBtn.addEventListener('click', handlerPauseBtn);
      
      outputVideo.addEventListener('ended', () => {
        pause = true; // 영상이 끝나면 상태를 정지로 갱신
        overlayVideo.pause();
        overlayVideo.style.opacity = "0";
      });
      
      /*타임라인 위에 변환 부분 표시 */
      outputVideo.addEventListener('loadedmetadata', () => {
        //이전 타임라인 제거
        const duration = outputVideo.duration;
        document.querySelector('.timeline-container').innerHTML = "";
        
        //시작, 끝 구역 가져오기
        overlayRanges.forEach(range => {
          const bar = document.createElement('div');
          bar.classList.add('timeline-bar');
          bar.style.left = `${(range.start / duration) * 100}%`;
          bar.style.width = `${((range.end - range.start) / duration) * 100}%`;
          // 삽입
          document.querySelector('.timeline-container').appendChild(bar);
    });
      });

      document.querySelector('.timeline-container').addEventListener('click', (e) => {
            const rect = document.querySelector('.timeline-container').getBoundingClientRect();
            const clickX = e.clientX - rect.left; // 클릭 위치
            const percent = clickX / rect.width;

            const duration = outputVideo.duration;
            const clickTime = percent * duration;

            pause = false; 

            // 영상 위치 이동
            outputVideo.currentTime = clickTime;
            console.log(clickTime);
            outputVideo.play().catch(err => console.log("outputVideo play blocked:", err));

            // overlay 여부 판단
            const activeRange = overlayRanges.find(
              range => clickTime >= range.start && clickTime <= range.end
            );

            if (activeRange) {
              overlayVideo.src = activeRange.overlaySrc;
              overlayVideo.load();
              overlayVideo.currentTime = clickTime - activeRange.start;
              overlayVideo.style.opacity = "1";
              overlayVideo.play().catch(err => console.log("overlayVideo play blocked:", err));
            } else {
              overlayVideo.pause();
              overlayVideo.style.opacity = "0";
            }
      });
    }
);
  
});

document.getElementById('dashboard-play').addEventListener('click', async () => {
  const file = document.getElementById('videoInput').files[0];
  if (!file) {
    alert('파일을 선택해주세요');
    return;
  }

  const formData = new FormData();
  formData.append('video', file);

  try {
    const response = await fetch('http://127.0.0.1:8000/nova/dashboard/video/upload/', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    
    console.log(result);
    alert(result.message);
  } catch (err) {
    console.error(err);
    // 왜 자꾸 서버에 잘 올라가는데 업로드 실패가 뜨는지..? 모르겠음 추후 수정 예정
    // alert('업로드 실패'); 
  }
});
