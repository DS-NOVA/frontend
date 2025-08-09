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

  let originalName = '';


  //오버레이를 위한 fps 구하기
  function frameToSeconds(frame, fps) {
  return frame / fps;
}

  //백엔드에서 정보 받아오기
  async function saveRawFrameData(rawFrameData) {
    console.log("saveRawFrameData 실행");
    const FrameToVideoData = {};

    for (const [fileName, { outputSrc, overlayRanges }] of Object.entries(rawFrameData)) {
      FrameToVideoData[fileName] = {
          outputSrc,
          overlayRanges
        };
    }

    return FrameToVideoData;
  }

    // 추가: 툴팁 표시 함수
    const tooltip = document.getElementById('timelineTooltip');
    const tooltipTime = document.getElementById('tooltipTime');

  function showTooltip(e, range) {
    const tooltipTitle = tooltip.querySelector('.tooltip-title');
    const tooltipDesc = tooltip.querySelector('.tooltip-desc');
    
    tooltipTitle.textContent = range.title || '오버레이 효과';
    tooltipDesc.textContent = range.description || '효과 설명';
    tooltipTime.textContent = `${range.start}s - ${range.end}s`;
    
    tooltip.classList.add('show');
    updateTooltipPosition(e);
  }

  // 추가: 툴팁 숨김 함수
  function hideTooltip() {
    tooltip.classList.remove('show');
  }

  // 추가: 툴팁 위치 업데이트 함수
  function updateTooltipPosition(e) {
    const rect = document.querySelector('.timeline-container').getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    
    const tooltipPercentage = (mouseX / rect.width) * 100;
    
    tooltip.style.left = `${tooltipPercentage}%`;
    tooltip.style.transform = 'translateX(-50%)'; // 중앙 정렬
  }

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
// 히스토리 저장
async function saveHistory(videoId, token) {
  try {
    const response = await fetch(`http://127.0.0.1:8000/nova/history/${videoId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("히스토리 저장 실패:", errorText);
    } else {
      console.log("히스토리 저장 성공");
    }
  } catch (err) {
    console.error("히스토리 저장 중 오류:", err);
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

/*
  fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if(!file) return;
      originalName = file.name; 

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
      
      //타임라인 위에 변환 부분 표시 
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
          
          bar.addEventListener('mouseenter', (e) => showTooltip(e, range));
          bar.addEventListener('mouseleave', hideTooltip);
          bar.addEventListener('mousemove', (e) => updateTooltipPosition(e));
          
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
      });*/



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
      overlayRanges: result.overlays,
      videoId: parseInt(result.video_id)
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

// 원본 영상 다운로드 (테스트용)
function mapFileNameToId(fileName) {
    const cleanedName = fileName
    .replace("_converted", "")
    .replace(".mp4", "")
    .trim();

  const map = {
    "4_firetruck_flash": 2,   
  };
  return map[cleanedName];
}

window.addEventListener('beforeunload', (e) => {
  console.warn('🚨 페이지 unload 발생!');
});

['assign', 'replace'].forEach(method => {
  const original = window.location[method];
  window.location[method] = function(...args) {
    console.warn(`🚨 location.${method} called with:`, ...args);
    debugger;
    return original.apply(this, args);
  }
});

document.getElementById('dashboard-save').addEventListener('click', async () => {
  const btn = document.getElementById('dashboard-save'); 
  if (btn.dataset.busy === '1') return;
  btn.dataset.busy = '1';
  btn.disabled = true;
  
  const outputVideoEl = document.getElementById('outputVideo');
  const videoSrc = outputVideoEl.src;

  if (!videoSrc) {
    alert("변환된 영상이 없습니다.");
    btn.dataset.busy = '0';                                
    btn.disabled = false;
    return;
  }

  try {
    const response = await fetch(videoSrc);
    const blob = await response.blob();

    // 다운로드 트리거
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = blobUrl;
    a.download = `${originalName}_converted.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);

    // localStorage에 이력 저장 추가
    const fileName = a.download; // 위에서 설정한 이름 그대로 사용

    // 히스토리 저장 (테스트)
    //const rawId = parseInt(TestvideoData[originalName]?.videoId);
    //const videoId = typeof rawId === "string" ? parseInt(rawId) : rawId;

    //let token = localStorage.getItem("access_token");
    //if (!token) {
    //  token="";
    //}
    //console.log("히스토리 저장 시도:", { videoId, token: token ? '***' : null });

     //if (videoId && !isNaN(videoId) && token) {
    //  await saveHistory(videoId, token);
    //  console.log("히스토리 저장 완료");
    //} else {
    //  console.warn("토큰 또는 videoId가 유효하지 않아 히스토리 건너뜀");
    //}

    const history = JSON.parse(localStorage.getItem("video_history") || "[]");
    history.unshift({
      title: fileName,
      video_id: videoId,
      savedAt: timestamp,
    });
    localStorage.setItem("video_history", JSON.stringify(history));
    console.log("로컬 저장 완료:", fileName);

  } catch (error) {
    console.error("영상 저장 실패:", error);
    alert("영상 저장 중 오류가 발생했습니다.");
  } finally {
    btn.dataset.busy = '0';
    btn.disabled = false;
  }
});

document.addEventListener("DOMContentLoaded", () => {
  pauseBtn.removeEventListener('click', handlerPauseBtn);
  pauseBtn.addEventListener('click', handlerPauseBtn);

  const userId = document.getElementById("user-id");

  if (userId) {
    userId.style.cursor = "pointer";

    userId.addEventListener("click", () => {
      window.location.href = "history.html";
    });
  }
});
// 사용자가 업로드한 원본 파일 이름으로 저장
document.getElementById('videoInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    originalName = file.name;
    console.log("originalName 세팅됨:", originalName);
  }
});