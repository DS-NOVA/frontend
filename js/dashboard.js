// dashboard.js

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
    const res = await fetch("../data/test_data.json"); // test 데이터 연결

    const result = await res.json();
    // overlayRanges = result.overlays;
    overlayRanges = result // test 데이터 연결

    inputVideo.src = URL.createObjectURL(file);
    currentInputURL = result.originalSrc || inputVideo.src;
    outputVideo.src = result.outputSrc;
    overlayVideo.src = "";

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
      stacked: true
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
      title: { text: "위험 비율" }
    },
    tooltip: {
      x: { format: "HH:mm:ss" }
    },
    colors: ['#FF5F5F', '#F9C74F', '#90BE6D']
  };

  const chart = new ApexCharts(document.querySelector("#graph"), options);
  chart.render();
}
