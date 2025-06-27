// dashboard.js 최상단 또는 dashboard.html <script>에 추가
if (window.LiveReloadBlocked !== true) {
  const originalReload = window.location.reload;
  window.location.reload = function () {
    console.warn('LiveReload 금지');
    return;
  };
  window.LiveReloadBlocked = true;
}

Object.defineProperty(window, 'WebSocket', {
  get() {
    console.warn("WebSocket 차단 (LiveReload용)");
    return function() {};  // dummy WebSocket
  },
});


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

  let TestvideoData = {};

  //예제로 쓸 데이터 구조
  /*const TestvideoData = {
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
  }*/

  //오버레이를 위한 fps 구하기
  function frameToSeconds(frame, fps) {
  return frame / fps;
}

  //백엔드에서 정보 받아오기
  async function saveRawFrameData(rawFrameData) {
    console.log("saveRawFrameData 실행");
    const FrameToVideoData = {};

    for (const [fileName, { outputSrc, overlayRanges }] of Object.entries(rawFrameData)) {
        /*
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
    );*/

    FrameToVideoData[fileName] = {
        outputSrc,
        overlayRanges
      };
    }

    return FrameToVideoData;
  }

  //종료 시점 구하기(추후 수정)
  /*
  function getOverlayDuration(overlaySrc) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.src = overlaySrc;
      video.preload = 'metadata';

      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(`영상 로딩 실패: ${overlaySrc}`);
    });
}*/

//정지 버튼 눌렀을때
  function handlerPauseBtn(){
    if (pause)  {
    console.log("click start");
    outputVideo.play().then(() => {
      const currentTime = outputVideo.currentTime;
      const activeRange = overlayRanges.find(range =>
        currentTime >= range.start && currentTime <= range.end
      );

      if (activeRange) {
        overlayVideo.src = activeRange.overlaySrc;
        overlayVideo.load();
        overlayVideo.onloadeddata = () => {
          overlayVideo.currentTime = currentTime - activeRange.start;
          overlayVideo.style.opacity = "1";
          overlayVideo.play().catch(e => {
            console.warn("Overlay autoplay failed:", e);
          });
        };
      }

      pause = false;
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

//play 버튼 이후에 실행되어야 하는 함수
  async function handleVideoAfterUpload(file) {
    console.log("handleVideoAfterUpload 호출됨"); 

    const videoKey = file.name;
    const currentVideo = TestvideoData[videoKey];
    if (!currentVideo) return alert("등록되지 않은 영상입니다.");

    const inputURL = URL.createObjectURL(file);
    const outputURL = currentVideo.outputSrc;

    inputVideo.src = inputURL;
    outputVideo.src = outputURL;

    currentInputURL = inputURL;
    currentOutputURL = outputURL;

    // output 메타데이터 준비 대기
    await new Promise(resolve => {
      outputVideo.onloadedmetadata = () => {
        console.log(" outputVideo metadata loaded");
        resolve();
      };
      outputVideo.load();
    });

    // overlayRange 세팅
    const videoData = await saveRawFrameData(TestvideoData);
    overlayRanges = videoData[videoKey].overlayRanges;
    console.log(overlayRanges);

    // timeline, timeupdate 등 리스너 등록
    setupTimeline();
    setupTimeUpdateHandler();

    // 초기 상태
    overlayVideo.pause();
    overlayVideo.currentTime = 0;
    overlayVideo.style.opacity = "0";
    pause = false;

    // 실제 재생
    inputVideo.play().catch(err => console.log("input play blocked:", err));
    outputVideo.play().catch(err => console.log("output play blocked:", err));
  }

  function setupTimeline() {
  const duration = outputVideo.duration;
  const container = document.querySelector('.timeline-container');
  container.innerHTML = "";

  overlayRanges.forEach(range => {
    const bar = document.createElement('div');
    bar.classList.add('timeline-bar');

    const safeEnd = Math.min(range.end, duration);
    bar.style.left = `${(range.start / duration) * 100}%`;
    bar.style.width = `${((safeEnd - range.start) / duration) * 100}%`;

    container.appendChild(bar);
  });

  container.onclick = e => {
  const rect = container.getBoundingClientRect();
  const percent = (e.clientX - rect.left) / rect.width;
  const clickTime = percent * duration;

  pause = false;
  outputVideo.currentTime = clickTime;

  const activeRange = overlayRanges.find(r => clickTime >= r.start && clickTime <= r.end);
  if (activeRange) {
    overlayVideo.src = activeRange.overlaySrc;
    overlayVideo.load();

    overlayVideo.onloadeddata = () => {
      overlayVideo.currentTime = clickTime - activeRange.start;
      overlayVideo.style.opacity = "1";

      overlayVideo.play().catch(e => {
        console.warn("Overlay play error:", e);
      });
    };
  } else {
    overlayVideo.pause();
    overlayVideo.src = "";
    overlayVideo.style.opacity = "0";
  }
};
  }

function setupTimeUpdateHandler() {
  if (handlerTimeUpdate) {
    outputVideo.removeEventListener("timeupdate", handlerTimeUpdate);
  }

  handlerTimeUpdate = () => {
    if (pause) return;
    const currentTime = outputVideo.currentTime;

    const activeRange = overlayRanges.find(range =>
      currentTime >= range.start && currentTime <= range.end
    );

    if (activeRange) {
      const offset = currentTime - activeRange.start;

      if (!currentOverlay || currentOverlay.overlaySrc !== activeRange.overlaySrc) {
        overlayVideo.src = activeRange.overlaySrc;
        overlayVideo.load();
        overlayVideo.onloadeddata = () => {
          overlayVideo.currentTime = offset;
          overlayVideo.style.opacity = "1";
          currentOverlay = activeRange;

          overlayVideo.play().catch(err => console.warn("Overlay autoplay 실패:", err));
        };
      } else {
        overlayVideo.currentTime = offset;
        overlayVideo.style.opacity = "1";
      }
    } else {
      overlayVideo.pause();
      overlayVideo.src = "";
      overlayVideo.style.opacity = "0";
      currentOverlay = null;
    }
  };

  outputVideo.addEventListener("timeupdate", handlerTimeUpdate);
}


  uploadButton.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });


document.addEventListener('DOMContentLoaded', () => {
  pauseBtn.removeEventListener('click', handlerPauseBtn);
  pauseBtn.addEventListener('click', handlerPauseBtn);
    }
);



document.getElementById('dashboard-play').addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const file = document.getElementById('videoInput').files[0];
  if (!file) {
    alert('파일을 선택해주세요');
    return;
  }

  const formData = new FormData();
  formData.append('video', file);
  formData.forEach((value, key) => {
  console.log(`${key}:`, value);
});

  try {
    const response = await fetch('http://127.0.0.1:8000/nova/dashboard/video/upload/', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    
    console.log(result);
    alert(result.message);

    TestvideoData[file.name] = {
      outputSrc: result.outputSrc,
      fps: result.fps,
      overlayRanges: result.overlays
    };
    
    await handleVideoAfterUpload(file);
    console.log("inputVideo.src:", inputVideo.src);
    console.log("outputVideo.src:", outputVideo.src);
    
  } catch (err) {
    console.error(err);
    // 왜 자꾸 서버에 잘 올라가는데 업로드 실패가 뜨는지..? 모르겠음 추후 수정 예정
    // alert('업로드 실패'); 
  }
});


window.addEventListener('beforeunload', (e) => {
  console.warn('🚨 페이지 unload 발생!');
});

['assign', 'replace'].forEach(method => {
  const original = window.location[method];
  window.location[method] = function(...args) {
    console.warn(`🚨 location.${method} called with:`, ...args);
    debugger;
    return original.apply(this, args);
  };
});