import { API_BASE, ensureAccess, authFetch } from './auth.js';
// dashboard.js 최상단 또는 dashboard.html <script>에 추가

if (window.LiveReloadBlocked !== true) {
  try {
    Object.defineProperty(window, 'WebSocket', {
      configurable: true, // 나중에 복구 가능하도록
      get() {
        console.warn("WebSocket 차단 (LiveReload용)");
        return function () {}; // 더미
      },
    });
  } catch (e) {
    console.warn("WebSocket 재정의 실패:", e);
  }
}

Object.defineProperty(window, 'WebSocket', {
  get() {
    console.warn("WebSocket 차단 (LiveReload용)");
    return function() {};  // dummy WebSocket
  },
});


//스플래시
  const splashEl = document.getElementById('detect-splash');
  let splashTimeout = null;

  function showDetectSplash() { 
      console.log('스플래시 표시');
      if (splashEl) {
          splashEl.hidden = false;
      }
      if (splashTimeout) clearTimeout(splashTimeout);
      splashTimeout = setTimeout(() => {
          console.warn('스플래시 강제 숨김 (타임아웃)');
          hideDetectSplash();
      }, 30000);
  }

  function hideDetectSplash() { 
      console.log('스플래시 숨김');
      if (splashTimeout) {
          clearTimeout(splashTimeout);
          splashTimeout = null;
      }
      if (splashEl) splashEl.hidden = true;
  }
  
  document.addEventListener('DOMContentLoaded', hideDetectSplash);

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

  // ✅ 교체: 출력 타임라인(#outputTimelineHost) 기준으로 툴팁 위치 계산
  function updateTooltipPosition(e) {
    const host = document.getElementById('outputTimelineHost');
    if (!host || !tooltip) return;

    const rect = host.getBoundingClientRect();
    if (rect.width <= 0) return;

    const mouseX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, mouseX / rect.width));
    tooltip.style.left = `${pct * 100}%`;
    tooltip.style.transform = 'translateX(-50%)';
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
    await ensureAccess();
    const response = await authFetch(`${API_BASE}/nova/history/${encodeURIComponent(videoId)}`, {
      method: "POST"
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
  if (activeRange && activeRange.overlaySrc) {
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

    if (activeRange && activeRange.overlaySrc) {
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


//슬라이더
// 밝기
const brightnessSlider = document.getElementById("brightness");
const brightnessVal = document.getElementById("brightnessVal");

// 채도
const saturationSlider = document.getElementById("saturation");
const saturationVal = document.getElementById("saturationVal");

//슬라이더 색상
brightnessSlider.addEventListener('input', (e) => {
  const val = e.target.value;
  e.target.style.background = `linear-gradient(to right, #5287EA ${val*100}%, #ddd ${val*100}%)`;
});

saturationSlider.addEventListener('input', (e) => {
  const val = e.target.value;
  e.target.style.background = `linear-gradient(to right, #5287EA ${val*100}%, #ddd ${val*100}%)`;
});

// 슬라이더 값이 바뀔 때 span 업데이트
brightnessSlider.addEventListener("input", () => {
  brightnessVal.textContent = parseFloat(brightnessSlider.value).toFixed(2);
});

saturationSlider.addEventListener("input", () => {
  saturationVal.textContent = parseFloat(saturationSlider.value).toFixed(2);
});


document.getElementById('dashboard-play').addEventListener('click', async (e) => {
  // 슬라이더 비활성화
  brightnessSlider.disabled = true;
  saturationSlider.disabled = true;
  
  e.preventDefault();
  e.stopPropagation();


  const btn = e.currentTarget;
  btn.disabled = true;         // 중복 클릭 방지
  showDetectSplash();          // 클릭 즉시 스플래시 ON

  const file = document.getElementById('videoInput').files[0];
  if (!file) {
    alert('파일을 선택해주세요');
    return;
  }

  const formData = new FormData();
  const brightness = parseFloat(brightnessSlider.value).toFixed(2);
  const saturation = parseFloat(saturationSlider.value).toFixed(2);

  formData.append('brightness', brightness);
  formData.append('saturation', saturation);
  formData.append('video', file);
  
  showDetectSplash();

  try {
    // 1) 파일 확인
    const file = document.getElementById('videoInput').files[0];
    if (!file) {
      alert('파일을 선택해주세요');
      return;
    }

    // 2) 접근 보장
    await ensureAccess();

    // 3) 업로드
    const formData = new FormData();
    formData.append('video', file);

    const response = await authFetch(`${API_BASE}/nova/dashboard/video/upload/`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`업로드 실패 (${response.status}) ${text || ''}`);
    }

    // 4) 응답 파싱
    const result = await response.json();
    console.log('📦 upload result:', result);

    // 5) 비디오 src 결정(보간본 우선) + 캐시 방지
    const finalSrcBase = result.outputSrcInterpolated || result.outputSrc || '';
    const finalSrc = finalSrcBase
      ? `${finalSrcBase}${finalSrcBase.includes('?') ? '&' : '?'}cb=${Date.now()}`
      : '';

    // 6) overlayRanges 스키마 정규화 (내부에서만 처리)
    const overlayRangesSec = Array.isArray(result.riskyRanges)
       ? result.riskyRanges.map(({ start, end }) => ({
          start: Number(start) || 0,
          end: Number(end) || 0,
          // 단일 mp4 파이프라인이라 overlaySrc는 없음(미사용)
        }))
      : [];

    const interpPairs = Array.isArray(result.interpolatedSpans)
      ? result.interpolatedSpans.map(({ start, end }) => ({
          start: Number(start) || 0,
          end: Number(end) || 0,
        }))
      : [];

    console.log("🟥 riskyRanges(초, 웹표시/밝기):", overlayRangesSec);
    console.log("🟦 interpolatedSpans(초, 보간쌍):", interpPairs);
    // 7) 비디오 태그 즉시 교체
    const outputVideo = document.getElementById('outputVideo');
    if (outputVideo && finalSrc) {
      outputVideo.src = finalSrc;
      outputVideo.load?.();
    }

    // 8) 메타 저장 (여기서 finalSrc/overlayRanges를 먼저 만든 뒤 저장)
    const safeVideoId = isNaN(parseInt(result.video_id))
      ? result.video_id
      : parseInt(result.video_id);

    TestvideoData[file.name] = {
      outputSrc: finalSrc,                               // 보간본 우선
      fps: result.fps ?? null,
      overlayRanges: overlayRangesSec,             // 통합 스키마
      videoId: safeVideoId,
      graphData: Array.isArray(result.graphData) ? result.graphData : [],
      interpPairs: interpPairs,
      cvcvLabelOrder: Array.isArray(result.cvLabelOrder) ? result.cvLabelOrder : []
    };

    console.log("inputVideo.src:", document.getElementById('inputVideo')?.src);
    console.log("outputVideo.src:", outputVideo?.src);

    // 9) 그래프 렌더링 (응답 우선, 없으면 테스트 데이터 폴백)
    try {
      let graphDataToUse =
        (Array.isArray(result.graphData) && result.graphData.length > 0)
          ? result.graphData
          : null;

      if (!graphDataToUse) {
        const testResp = await fetch("/data/test_data.json", { cache: "no-store" });
        graphDataToUse = await testResp.json();
        console.log("✅ testData 불러옴(폴백):", graphDataToUse);
      } else {
        console.log("✅ result.graphData 사용");
      }

      // RiskGraph(graphDataToUse);
      const fps = Number(result.fps) || 30;
      const cvLabelOrder = Array.isArray(result.cvLabelOrder) ? result.cvLabelOrder : [];
      RiskGraph(graphDataToUse, fps, cvLabelOrder);

    } catch (gErr) {
      console.error("Graph 렌더링 실패:", gErr);
    }

    // 10) 후처리(타임라인/오버레이 등 세팅)
    await handleVideoAfterUpload(file);

    if (result?.message) {
      alert(result.message);
    } else {
      alert('업로드 및 처리 완료!');
    }
  } catch (err) {
    console.error(err);
    alert(`처리 중 오류가 발생했습니다.\n${err?.message || err}`);
  } finally {
    // 스플래시 OFF: 성공/실패 무관하게 종료
    hideDetectSplash();
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

    //히스토리 저장 (테스트)
    const rawId = parseInt(TestvideoData[originalName]?.videoId);
    const videoId = typeof rawId === "string" ? parseInt(rawId) : rawId;

    let token = localStorage.getItem("access_token");
    if (!token) {
      token="";
    }
    console.log("히스토리 저장 시도:", { videoId, token: token ? '***' : null });

    if (videoId && !isNaN(videoId) && token) {
      await saveHistory(videoId, token);
      console.log("히스토리 저장 완료");
    } else {
      console.warn("토큰 또는 videoId가 유효하지 않아 히스토리 건너뜀");
    }

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
  if(pauseBtn){
    pauseBtn.removeEventListener('click', handlerPauseBtn);
    pauseBtn.addEventListener('click', handlerPauseBtn);
  }
  

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

// 그래프
function RiskGraph(data, fps = 30, cvLabelOrder = []) {
  const graphContainer = document.querySelector("#graph");
  graphContainer.innerHTML = "";

  const seriesData = { "섬광": [], "패턴": [], "단색": [] };

  // labels: [ ...cv flags..., flash, pattern, redlight ]
  const labelsLen = Array.isArray(data?.[0]?.labels) ? data[0].labels.length : 0;
  if (labelsLen < 3) return; // 방어

  const nCv = labelsLen - 3;              // CV 지표 개수(보통 6)
  const idxFlash   = nCv + 0;             // flash
  const idxPattern = nCv + 1;             // pattern
  const idxRed     = nCv + 2;             // redlight
  const inRange = (i) => i >= 0 && i < labelsLen;

  // 네가 원한 매핑 (3번은 두 그룹에 걸치므로 가중 0.5)
  const GROUPS = {
    "섬광": [0, 2, 3, idxFlash].filter(inRange),
    "패턴": [4, 5, idxPattern].filter(inRange),
    "단색": [1, 3, idxRed].filter(inRange),
  };

  // (1) 가중치: 인덱스 3만 0.5, 나머지 1
  const W = (i) => (i === 3 ? 0.5 : 1);

  // (2) 그룹 분모: 가중치 합 (그룹 크기)
  const DEN = {
    "섬광": GROUPS["섬광"].reduce((a, i) => a + W(i), 0) || 1,
    "패턴": GROUPS["패턴"].reduce((a, i) => a + W(i), 0) || 1,
    "단색": GROUPS["단색"].reduce((a, i) => a + W(i), 0) || 1,
  };

  data.forEach((pt, i) => {
    // X축: 프레임 번호
    const x = (typeof pt.frame === "number")
      ? pt.frame
      : Number.isFinite(pt.start) ? Math.round(pt.start * fps) : i;

    const L = Array.isArray(pt.labels) ? pt.labels : [];

    // (3) 그룹 커버리지 = (켜진 라벨 가중합) / (그룹 크기)
    const covFlash   = GROUPS["섬광"].reduce((a, k) => a + W(k) * (Number(L[k]) || 0), 0) / DEN["섬광"];
    const covPattern = GROUPS["패턴"].reduce((a, k) => a + W(k) * (Number(L[k]) || 0), 0) / DEN["패턴"];
    const covRed     = GROUPS["단색"].reduce((a, k) => a + W(k) * (Number(L[k]) || 0), 0) / DEN["단색"];

    seriesData["섬광"].push({ x, y: covFlash   });
    seriesData["패턴"].push({ x, y: covPattern });
    seriesData["단색"].push({ x, y: covRed     });
  });

  const options = {
    chart: { type: 'area', height: 300, stacked: false, background: 'transparent', toolbar: { show: true } },
    stroke: { width:3, lineCap: 'round' }, 
    fill: { type: 'solid', opacity: 0.3 },
    grid:  { padding: { top: 8, right: 12, bottom: 12, left: 12 } },
    legend:{ position: 'top', horizontalAlign: 'left' },
    dataLabels: { enabled: false },
    series: [
      { name: "섬광", data: seriesData["섬광"] },
      { name: "패턴", data: seriesData["패턴"] },
      { name: "단색", data: seriesData["단색"] }
    ],
    xaxis: {
      type: 'numeric',
      title: { text: "프레임" },
      labels: { formatter: (v) => `${Math.round(v)}` },
      tickAmount: 10
    },
    yaxis: {
      min: 0, max: 1,
      title: { text: "그룹 커버리지(%)" },
      labels: { formatter: (val) => (Number(val) * 100).toFixed(0) }
    },
    tooltip: {
      x: { formatter: (frame) => `프레임 ${frame} (${(frame / fps).toFixed(3)}s)` },
      y: { formatter: (val) => `${(Number(val) * 100).toFixed(1)}%` }
    },
    colors: ['#FF78AA', '#5AED9C', '#FFEC5A']
  };

  new ApexCharts(graphContainer, options).render();
}

/* ===== Enhanced Timeline (non-conflict, drop-in) ===== */
(() => {
  // 헬퍼 (고유 접두사로 충돌 방지)
  const __clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
  const __isFiniteDur = (d) => Number.isFinite(d) && d > 0;
  const __pad2 = (n) => String(n).padStart(2, '0');
  const __fmtTime = (t) => {
    if (!Number.isFinite(t)) return '00:00';
    const s = Math.floor(t % 60);
    const m = Math.floor((t / 60) % 60);
    const h = Math.floor(t / 3600);
    return h > 0 ? `${h}:${__pad2(m)}:${__pad2(s)}` : `${__pad2(m)}:${__pad2(s)}`;
  };

  // 타임라인 컨트롤러 (진행바 + 노브 + 라벨 + 노란 오버레이)
  function createTimelineEnhanced({ host, video, ranges }) {
    if (!host || !video) return null;

    // 기존 루트 제거 후 교체
    let root = host.querySelector('.__timeline-root');
    if (root) root.remove();

    root = document.createElement('div');
    root.className = '__timeline-root';
    Object.assign(root.style, {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginTop: '12px',
      padding: '2px 0',
      userSelect: 'none',
      zIndex: '10000',
      pointerEvents: 'auto',
      overflow: 'visible',
      width: '100%',
    });

    const track = document.createElement('div');
    Object.assign(track.style, {
      position: 'relative',
      flex: '1 1 auto',
      height: '16px',
      cursor: 'pointer',
      background: 'linear-gradient(#e5e7eb,#e5e7eb) center/100% 4px no-repeat',
      borderRadius: '6px',
      overflow: 'visible',
    });

    const timeLabel = document.createElement('div');
    Object.assign(timeLabel.style, {
      flex: '0 0 auto',
      fontSize: '12px',
      color: '#111827',
      whiteSpace: 'nowrap',
    });
    timeLabel.textContent = '00:00 / 00:00';

    const progressLayer = document.createElement('div'); // 파란 진행바
    Object.assign(progressLayer.style, {
      position: 'absolute',
      top: '50%',
      left: '0',
      height: '6px',
      transform: 'translateY(-50%)',
      borderRadius: '4px',
      width: '0%',
      zIndex: '0',
      pointerEvents: 'none',
    });

    const rangeLayer = document.createElement('div'); // 노란 오버레이
    Object.assign(rangeLayer.style, {
      position: 'absolute',
      inset: '0 0 0 0',
      pointerEvents: 'none',
      overflow: 'visible',
      zIndex: '1',
    });

    const knob = document.createElement('div'); // 동그라미 노브
    Object.assign(knob.style, {
      position: 'absolute',
      top: '50%',
      left: '0%',
      width: '14px',
      height: '14px',
      transform: 'translate(-50%, -50%)',
      background: '#fff',
      border: '2px solid #111827',
      borderRadius: '999px',
      boxShadow: '0 1px 3px rgba(0,0,0,.2)',
      pointerEvents: 'auto',
      touchAction: 'none',
      zIndex: '2',
    });
    knob.setAttribute('role', 'slider');
    knob.setAttribute('tabindex', '0');
    knob.setAttribute('aria-valuemin', '0');

    // 조립
    track.appendChild(progressLayer);
    track.appendChild(rangeLayer);
    track.appendChild(knob);
    root.appendChild(track);
    root.appendChild(timeLabel);
    host.prepend(root);

    // 내부 범위 참조
    let rangesRef = Array.isArray(ranges) ? ranges : [];

    function renderRanges(duration) {
      rangeLayer.innerHTML = '';
      if (!__isFiniteDur(duration)) return;
      rangesRef.forEach((r) => {
        const s0 = Number(r.start) || 0;
        const e0 = Number(r.end) || 0;
        const s = Math.max(0, Math.min(s0, duration));
        const e = Math.max(0, Math.min(e0, duration));
        if (e <= s) return;
        const seg = document.createElement('div');
        Object.assign(seg.style, {
          position: 'absolute',
          top: '50%',
          height: '6px',
          transform: 'translateY(-50%)',
          background: 'rgba(255,205,80,.85)',
          borderRadius: '4px',
          left: `${__clamp01(s / duration) * 100}%`,
          width: `${__clamp01((e - s) / duration) * 100}%`,
        });
        rangeLayer.appendChild(seg);
      });
    }

    function update(time, dur) {
      const d = __isFiniteDur(dur) ? dur : (video?.duration || 0);
      const t = Math.max(0, Math.min(time || 0, d || 0));
      const pct = d > 0 ? (t / d) : 0;

      knob.style.left = `${pct * 100}%`;
      progressLayer.style.width = `${pct * 100}%`;
      timeLabel.textContent = `${__fmtTime(t)} / ${__fmtTime(d || 0)}`;
      knob.setAttribute('aria-valuenow', String(t.toFixed(3)));
      knob.setAttribute('aria-valuemax', String(d || 0));
    }

    function updateDuration(dur) {
      renderRanges(dur);
      update(video?.currentTime || 0, dur);
    }

    function getRangeAt(t) {
      return rangesRef.find(r => t >= (Number(r.start) || 0) && t <= (Number(r.end) || 0));
    }

    function setRanges(next) {
      rangesRef = Array.isArray(next) ? next : [];
      renderRanges(video?.duration || 0);
    }

    // 좌표 → 시간
    const clientXToTime = (clientX) => {
      const rect = track.getBoundingClientRect();
      const dur = video?.duration || 0;
      if (!__isFiniteDur(dur) || rect.width <= 0) return 0;
      const pct = __clamp01((clientX - rect.left) / rect.width);
      return pct * dur;
    };

    // 시크 시 오버레이 즉시 동기화
    async function onSeek(t) {
      const dur = video?.duration || 0;
      const time = Math.max(0, Math.min(t, dur));
      pause = false;
      video.currentTime = time;

      // 기존 overlay 즉시 반영 (기존 container.onclick 로직과 동일)
      const activeRange = overlayRanges?.find(r => time >= r.start && time <= r.end);
      if (activeRange && activeRange.overlaySrc) {
        overlayVideo.src = activeRange.overlaySrc;
        overlayVideo.load();
        overlayVideo.onloadeddata = () => {
          overlayVideo.currentTime = time - activeRange.start;
          overlayVideo.style.opacity = '1';
          overlayVideo.play().catch(e => console.warn('Overlay play error:', e));
        };
      } else {
        overlayVideo.pause();
        overlayVideo.src = '';
        overlayVideo.style.opacity = '0';
      }

      update(time, dur);
    }

    // 포인터 드래그/클릭
    let dragging = false;
    track.addEventListener('pointerdown', async (e) => {
      dragging = true;
      track.setPointerCapture?.(e.pointerId);
      const t = clientXToTime(e.clientX);
      await onSeek(t);
    });
    window.addEventListener('pointermove', async (e) => {
      if (!dragging) return;
      const t = clientXToTime(e.clientX);
      await onSeek(t);
    });
    window.addEventListener('pointerup', async (e) => {
      if (!dragging) return;
      dragging = false;
      track.releasePointerCapture?.(e.pointerId);
      const t = clientXToTime(e.clientX);
      await onSeek(t);
    });

    // 키보드
    knob.addEventListener('keydown', async (e) => {
      const step = (e.shiftKey ? 2 : 0.5);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dur = video?.duration || 0;
        const cur = video?.currentTime || 0;
        const next = e.key === 'ArrowLeft' ? Math.max(0, cur - step) : Math.min(dur, cur + step);
        await onSeek(next);
      }
    });

    // 초기 렌더
    renderRanges(video?.duration || 0);
    update(0, video?.duration || 0);

    return { update, updateDuration, track, timeLabel, knob, getRangeAt, setRanges };
  }

  // 전역 컨트롤러 보관
  let __timelineCtrl = null;

  // 기존 setupTimeline 재정의 (오버레이 유지 + 툴팁은 오버레이 구간에서만 노출)
  window.setupTimeline = function setupTimeline() {
    const container = document.querySelector('.timeline-container');
    if (!container || !outputVideo) return;

    __timelineCtrl = createTimelineEnhanced({
      host: container,
      video: outputVideo,
      ranges: overlayRanges,
    });

    // 오버레이 범위가 바뀔 수 있으니 한 번 더 동기화
    __timelineCtrl?.setRanges(overlayRanges);

    // 툴팁: duration 유효 & 오버레이 구간일 때만 표시
    const onMove = (e) => {
      if (!__timelineCtrl) return;
      const rect = __timelineCtrl.track.getBoundingClientRect();
      const dur = outputVideo?.duration || 0;
      if (!__isFiniteDur(dur) || rect.width <= 0) {
        hideTooltip?.();
        return;
      }
      const pct = __clamp01((e.clientX - rect.left) / rect.width);
      const t = pct * dur;
      const range = __timelineCtrl.getRangeAt(t);
      if (!range) {
        hideTooltip?.();
        return;
      }
      // 기존 showTooltip(e, range) 재사용 (사용자 정의 함수)
      showTooltip?.(e, range);
    };

    __timelineCtrl.track.addEventListener('mousemove', onMove);
    __timelineCtrl.track.addEventListener('mouseleave', () => hideTooltip?.());

    // 메타 로딩 후 오버레이/라벨/노브 업데이트
    outputVideo.addEventListener('loadedmetadata', () => {
      __timelineCtrl?.updateDuration(outputVideo.duration);
    }, { once: true });
  };

  // 기존 setupTimeUpdateHandler 재정의 (타임라인 업데이트 추가)
  window.setupTimeUpdateHandler = function setupTimeUpdateHandler() {
    if (handlerTimeUpdate) {
      outputVideo.removeEventListener('timeupdate', handlerTimeUpdate);
    }

    handlerTimeUpdate = () => {
      if (pause) return;
      const currentTime = outputVideo.currentTime;

      // === 기존 오버레이 동작 유지 ===
      const activeRange = overlayRanges.find(range =>
        currentTime >= range.start && currentTime <= range.end
      );

      if (activeRange && activeRange.overlaySrc) {
        const offset = currentTime - activeRange.start;

        if (!window.currentOverlay || window.currentOverlay?.overlaySrc !== activeRange.overlaySrc) {
          overlayVideo.src = activeRange.overlaySrc;
          overlayVideo.load();
          overlayVideo.onloadeddata = () => {
            overlayVideo.currentTime = offset;
            overlayVideo.style.opacity = '1';
            window.currentOverlay = activeRange;

            overlayVideo.play().catch(err => console.warn("Overlay autoplay 실패:", err));
          };
        } else {
          overlayVideo.currentTime = offset;
          overlayVideo.style.opacity = '1';
        }
      } else {
        overlayVideo.pause();
        overlayVideo.src = "";
        overlayVideo.style.opacity = "0";
        window.currentOverlay = null;
      }

      // === 타임라인 진행/노브/라벨 업데이트 추가 ===
      __timelineCtrl?.update(currentTime, outputVideo.duration);
    };

    outputVideo.addEventListener('timeupdate', handlerTimeUpdate);
  };
})();
