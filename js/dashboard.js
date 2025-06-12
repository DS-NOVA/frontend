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
  let currentOverlay = null;


  //예제로 쓸 데이터 구조
  const TestvideoData = {
    '26_lightning.mp4': {
      outputSrc: '../videos/26_lightning.mp4',
      fps: 30,
      overlayRanges: [
        { start: 1, end: 25, overlaySrc: '../overlays/overlay_26_lightning_0001_0025.mp4' },
        { start: 35, end: 59, overlaySrc: '../overlays/overlay_26_lightning_0035_0059.mp4' },
        { start: 72, end: 132, overlaySrc: '../overlays/overlay_26_lightning_0072_0132.mp4' },
        { start: 138, end: 202, overlaySrc: '../overlays/overlay_26_lightning_0138_0202.mp4' },
        { start: 207, end: 268, overlaySrc: '../overlays/overlay_26_lightning_0207_0268.mp4' }
      ]
    }
  }

  //오버레이를 위한 fps 구하기
  function frameToSeconds(frame, fps) {
  return frame / fps;
}

  //백엔드에서 정보 받아오기
  async function saveRawFrameData(rawFrameData) {
    const FrameToVideoData = {};

    for (const [fileName, { outputSrc, fps, overlayRanges }] of Object.entries(rawFrameData)) {
      /*const overlayRanges = overlays.map(({ startFrame, endFrame, overlaySrc }) => ({
        start: startFrame / fps,
        end: endFrame / fps,
        overlaySrc
      }));*/


      const overlay = await Promise.all(
      overlayRanges.map(async ({ start, overlaySrc }) => {
        const startSec = frameToSeconds(start, fps);
        const duration = await getOverlayDuration(overlaySrc);
        return {
          start: startSec,
          end: startSec + duration, // 실제 영상 길이만큼
          overlaySrc
        };
      })
    );


      FrameToVideoData[fileName] = {
        outputSrc,
        overlayRanges:overlay
      };
    }

    return FrameToVideoData;
  }

  //종료 시점(추후 수정)
  function getOverlayDuration(overlaySrc) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = overlaySrc;
    video.preload = 'metadata';

    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => reject(`영상 로딩 실패: ${overlaySrc}`);
  });
}
  function handlerPauseBtn(){
        if (pause)  {
    console.log("click start");
    outputVideo.play().then(() => {
      const currentTime = outputVideo.currentTime;
      let activeRange = null;

      if (!currentOverlay) {
        activeRange = overlayRanges.find(range =>
          Math.abs(currentTime - range.start) <= 0.1
        );
      }

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
      const currentVideo = TestvideoData[videoKey]; //추후 수정
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

      currentInputURL = inputURL;

  
      /*range 설정
      overlayRanges = currentVideo.overlayRanges;
      let currentOverlay = null;*/

      //타임라인 생성하기
      outputVideo.addEventListener('loadedmetadata', () => {
      const duration = outputVideo.duration;
      if (!duration || isNaN(duration)) {
        console.warn("비디오 duration이 아직 로드되지 않았습니다.");
        return;
      }
      document.querySelector('.timeline-container').innerHTML = "";
      
      //시작, 끝 구역 가져오기
      overlayRanges.forEach(range => {
        const bar = document.createElement('div');
        bar.classList.add('timeline-bar');

        const safeEnd = Math.min(range.end, duration);
        const left = (range.start / duration) * 100;
        const width = ((safeEnd - range.start) / duration) * 100;

        if (width > 100) {
          console.warn("오버레이 width 100% 초과:", { range, duration });
        }

        bar.style.left = `${left}%`;
        bar.style.width = `${width}%`;
        document.querySelector('.timeline-container').appendChild(bar);
      });
    })
      //오버레이 정보 생성하기
      saveRawFrameData(TestvideoData).then(videoData => {
        overlayRanges = videoData[videoKey].overlayRanges;
        console.log(" 변환된 videoData:", videoData);

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
            //const timeThreshold = 1.0; // 초 단위 허용 범위 (±0.2초)

            // 클릭 시점에서 가까운 오버레이 range 탐색
            const activeRange = overlayRanges.find(range =>
            clickTime >= range.start && clickTime <= range.end
          );


            if (activeRange) {
              overlayVideo.src = activeRange.overlaySrc;
              overlayVideo.load();
              overlayVideo.currentTime = clickTime - activeRange.start;
              overlayVideo.style.opacity = "1";
              overlayVideo.play().catch(err => console.log("overlayVideo play blocked:", err));
            } else if(activeRange && currentOverlay !== activeRange){
              overlayVideo.src = activeRange.overlaySrc;
              overlayVideo.load();
              overlayVideo.currentTime = 0;
              overlayVideo.style.opacity = "1";
              overlayVideo.play();
              currentOverlay = activeRange;
            }  
            else {
              overlayVideo.pause();
              overlayVideo.src = "";
              overlayVideo.style.opacity = "0";
            }
      });
        
        outputVideo.src = outputURL;
        outputVideo.load();
    });

    
    currentOutputURL = outputURL; //output 영상 가져오기
    


      //결과 비디오 시작 시
      
      if(handlerTimeUpdate){
        outputVideo.removeEventListener("timeupdate", handlerTimeUpdate);
      }
      handlerTimeUpdate =() => {
          console.log("결과 비디오 실행 중");
              if (pause) return;
              const currentTime = outputVideo.currentTime;

              //let activeRange = null;

              /*if (!currentOverlay) {
                activeRange = overlayRanges.find(range =>
                  currentTime >= range.start && currentTime <= range.end
                );
              }*/
            const activeRange = overlayRanges.find(range =>
              currentTime >= range.start && currentTime <= range.end
            );

              console.log("currentTime:", currentTime, "activeRange:", activeRange);

              //변환 구간일 경우 
              if(activeRange){
                const offset = currentTime - activeRange.start;

                if (!currentOverlay || currentOverlay.overlaySrc !== activeRange.overlaySrc) {
                  overlayVideo.src = activeRange.overlaySrc;
                  overlayVideo.load();
                  overlayVideo.onloadeddata = () => {
                    overlayVideo.currentTime = offset;
                    overlayVideo.style.opacity = "1";
                    overlayVideo.play();
                    currentOverlay = activeRange;
                  };
                }else {
                    overlayVideo.currentTime = offset;
                    overlayVideo.style.opacity = "1";
                    overlayVideo.play();
                  }
                }
                else{
                overlayVideo.pause();
                overlayVideo.src = "";
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
});
    }
);



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
