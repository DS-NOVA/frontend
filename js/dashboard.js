// dashboard.js

import { API_BASE, ensureAccess, authFetch } from './auth.js';
// dashboard.js 최상단 또는 dashboard.html <script>에 추가
if (window.LiveReloadBlocked !== true) {
  const originalReload = window.location.reload;
  window.location.reload = function () {
    console.warn('LiveReload 금지');
    return;
  };
  window.LiveReloadBlocked = true;
  
const uploadButton = document.getElementById("dashboard-upload");
const fileInput = document.getElementById("videoInput");
const inputVideo = document.getElementById("inputVideo");
const outputVideo = document.getElementById("outputVideo");
const overlayVideo = document.getElementById("overlayVideo");
const pauseBtn = document.getElementById("pauseBtn");
const tooltip = document.getElementById("timelineTooltip");
const tooltipTime = document.getElementById("tooltipTime");

let overlayRanges = [];
let currentOverlay = null;
let currentInputURL = null;
let originalName = "";
let pause = false;

// Tooltip
function showTooltip(e, range) {
  const tooltipTitle = tooltip.querySelector(".tooltip-title");
  const tooltipDesc = tooltip.querySelector(".tooltip-desc");

  tooltipTitle.textContent = range.title || "오버레이 효과";
  tooltipDesc.textContent = range.description || "효과 설명";
  tooltipTime.textContent = `${range.start}s ~ ${range.end}s`;

  tooltip.classList.add("show");
  updateTooltipPosition(e);

}

function hideTooltip() {
  tooltip.classList.remove("show");
}


function updateTooltipPosition(e) {
  const rect = document.querySelector(".timeline-container").getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  tooltip.style.left = `${(mouseX / rect.width) * 100}%`;
  tooltip.style.transform = "translateX(-50%)";
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


function handlerPauseBtn() {
  if (pause) {
    outputVideo.play();
    pause = false;
  } else {
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

function setupTimeline() {
  const container = document.querySelector(".timeline-container");
  container.innerHTML = "";
  const duration = outputVideo.duration;

  overlayRanges.forEach((range, index) => {
    const bar = document.createElement("div");
    bar.classList.add("timeline-bar");
    bar.dataset.index = index;
    bar.dataset.selected = "true"; // 기본 선택 상태
    bar.style.left = `${(range.start / duration) * 100}%`;
    bar.style.width = `${((range.end - range.start) / duration) * 100}%`;

    bar.addEventListener("mouseenter", (e) => showTooltip(e, range));
    bar.addEventListener("mouseleave", hideTooltip);
    bar.addEventListener("mousemove", updateTooltipPosition);
    bar.addEventListener("click", () => {
      const selected = bar.dataset.selected === "true";
      bar.dataset.selected = (!selected).toString();
      bar.style.opacity = selected ? 0.3 : 1.0;
    });

    container.appendChild(bar);
  });
}

function setupPlayback() {
  outputVideo.addEventListener("timeupdate", () => {
    if (pause) return;
    const currentTime = outputVideo.currentTime;

    const activeRange = overlayRanges.find(r => currentTime >= r.start && currentTime <= r.end);

    if (activeRange) {
      overlayVideo.src = activeRange.overlaySrc;
      overlayVideo.style.opacity = "1";
      overlayVideo.currentTime = currentTime - activeRange.start;
      overlayVideo.play();
      currentOverlay = activeRange;
    } else {
      overlayVideo.pause();
      overlayVideo.src = "";
      overlayVideo.style.opacity = "0";
      currentOverlay = null;
    }
  });
}

uploadButton.addEventListener("click", () => {
  fileInput.click();
});

document.getElementById("dashboard-play").addEventListener("click", async () => {
  const file = fileInput.files[0];
  if (!file) return alert("영상을 선택해주세요.");

  originalName = file.name;
  const formData = new FormData();
  formData.append("video", file);

  try {
    // const res = await fetch("http://127.0.0.1:8000/nova/dashboard/video/upload/", {
    //   method: "POST",
    //   body: formData
    // });
    const res = await fetch("../data/test_data.json"); // test 데이터 연결 (추후 수정 필요)

    const result = await res.json();
    // overlayRanges = result.overlays;
    overlayRanges = result // test 데이터 연결 (그래프 test 위해서 - 추후 수정 필요)

    inputVideo.src = URL.createObjectURL(file);
    currentInputURL = result.originalSrc || inputVideo.src;
    outputVideo.src = result.outputSrc;
    overlayVideo.src = "";

    await ensureAccess();
    const response = await authFetch(`${API_BASE}/nova/dashboard/video/upload/`, {
      method: 'POST',
      body: formData,
    });


    inputVideo.play();
    //outputVideo.play();


    setupTimeline();
    setupPlayback();
    renderRiskChart(); // 그래프 렌더링

    // outputVideo.onloadedmetadata = () => {
    //   setupTimeline();
    //   setupPlayback();
    //   renderRiskChart(); // 그래프 렌더링
    // };
  } catch (e) {
    console.error("로딩 실패:", e);
  }
});

document.getElementById("dashboard-save").addEventListener("click", async () => {
  const bars = document.querySelectorAll(".timeline-bar");
  const selected = [];

  bars.forEach(bar => {
    if (bar.dataset.selected === "true") {
      const idx = parseInt(bar.dataset.index);
      selected.push(overlayRanges[idx]);
    }
  });

  if (selected.length === 0) return alert("선택된 구간이 없습니다.");
  if (!currentInputURL) return alert("원본 영상 정보가 없습니다.");

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
    const res = await fetch("http://127.0.0.1:8000/nova/dashboard/video/merge/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        original: currentInputURL,
        overlays: selected
      })
    });

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = blobUrl;
    a.download = `${originalName}_merged_${timestamp}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);


    const history = JSON.parse(localStorage.getItem("video_history") || "[]");
    history.unshift({ title: a.download, savedAt: timestamp });
    localStorage.setItem("video_history", JSON.stringify(history));

    alert("저장 완료!");
  } catch (err) {
    console.error("저장 실패:", err);
    alert("저장 중 오류 발생");

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
  pauseBtn.addEventListener("click", handlerPauseBtn);
  const userId = document.getElementById("user-id");
  if (userId) {
    userId.style.cursor = "pointer";
    userId.addEventListener("click", () => {
      window.location.href = "history.html";
    });
  }
});

// 그래프
function renderRiskChart() {
  const baseDate = new Date().toISOString().split("T")[0];

  const seriesData = {
    "섬광": [],
    "패턴": [],
    "단색": []
  };

  overlayRanges.forEach((range) => {
    const time = new Date(`${baseDate}T00:00:00Z`);
    time.setSeconds(time.getSeconds() + range.start);
    const isoTime = time.toISOString();

    const labels = range.labels || [];
    const groups = {
      "섬광": [0, 2, 3, 6],
      "패턴": [4, 5, 7],
      "단색": [1, 3, 8]
    };

    let counts = { "섬광": 0, "패턴": 0, "단색": 0 };
    labels.forEach((val, idx) => {
      if (groups["섬광"].includes(idx)) counts["섬광"] += val * (idx === 3 ? 0.5 : 1);
      if (groups["단색"].includes(idx)) counts["단색"] += val * (idx === 3 ? 0.5 : 1);
      if (groups["패턴"].includes(idx)) counts["패턴"] += val;
    });

    const total = counts["섬광"] + counts["패턴"] + counts["단색"] || 1;
    seriesData["섬광"].push({ x: isoTime, y: counts["섬광"] / total });
    seriesData["패턴"].push({ x: isoTime, y: counts["패턴"] / total });
    seriesData["단색"].push({ x: isoTime, y: counts["단색"] / total });
  });

  const options = {
    chart: {
      type: 'area',
      height: 300,
      stacked: false,
      background: 'transparent',
      toolbar: { show: true },
    },

    grid: {
    padding: { top: 8, right: 12, bottom: 12, left: 12 }
    },

    legend: {
      position: 'top', horizontalAlign: 'left'
    },

    dataLabels: {
      enabled: true,
      formatter: (val) => (val * 100).toFixed(2), // 예: 33.33
    },

    series: [
      { name: "섬광", data: seriesData["섬광"] },
      { name: "패턴", data: seriesData["패턴"] },
      { name: "단색", data: seriesData["단색"] }
    ],
    xaxis: {
      type: 'datetime',
      title: { text: "영상 시간" }
    },
    yaxis: {
      min: 0,
      max: 1,
      title: { text: "위험 비율" },
      labels: {
        formatter: (val) => Number(val).toFixed(3)
  }
    },
    tooltip: {
      x: { format: "HH:mm:ss" },
      y: {
        formatter: (val) => `${(Number(val) * 100).toFixed(1)}%`
      }
    },
    colors: ['#FF78AA', '#5AED9C', '#FFEC5A']
  };

  const chart = new ApexCharts(document.querySelector("#graph"), options);
  chart.render();
}

// 사용자가 업로드한 원본 파일 이름으로 저장
document.getElementById('videoInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    originalName = file.name;
    console.log("originalName 세팅됨:", originalName);
  }
});

