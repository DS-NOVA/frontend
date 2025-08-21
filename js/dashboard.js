// dashboard.js (툴팁 문제 해결 버전)

import { API_BASE, ensureAccess, authFetch } from './auth.js';

/* ---------------- LiveReload WebSocket 차단(개발용) ---------------- */
if (window.LiveReloadBlocked !== true) {
  try {
    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      get() {
        console.warn("WebSocket 차단 (LiveReload용)");
        return function () {};
      },
    });
  } catch (e) {
    console.warn("WebSocket 재정의 실패:", e);
  }
}
Object.defineProperty(window, 'WebSocket', {
  get() {
    console.warn("WebSocket 차단 (LiveReload용)");
    return function () {};
  },
});

/* ---------------- 스플래시 ---------------- */
const splashEl = document.getElementById('detect-splash');
let splashTimeout = null;

function showDetectSplash() {
  if (splashEl) splashEl.hidden = false;
  if (splashTimeout) clearTimeout(splashTimeout);
  splashTimeout = setTimeout(() => hideDetectSplash(), 30000);
}
function hideDetectSplash() {
  if (splashTimeout) {
    clearTimeout(splashTimeout);
    splashTimeout = null;
  }
  if (splashEl) splashEl.hidden = true;
}
document.addEventListener('DOMContentLoaded', hideDetectSplash);

/* ---------------- 엘리먼트 참조 ---------------- */
const uploadButton = document.getElementById('dashboard-upload');
const fileInput = document.getElementById('videoInput');

const inputVideo  = document.getElementById('inputVideo');
const outputVideo = document.getElementById('outputVideo');

const inputTimelineHost  = document.getElementById('inputTimelineHost');
const outputTimelineHost = document.getElementById('outputTimelineHost');

const tooltipEl = document.getElementById('timelineTooltip');
const tooltipTimeEl = document.getElementById('tooltipTime');

/* ---------------- 동시 재생 버튼 ---------------- */
const controlsContainer = document.querySelector('.controls-container');
let playBothBtn = null;
if (controlsContainer) {
  playBothBtn = document.createElement('button');
  playBothBtn.id = 'playBoth';
  playBothBtn.type = 'button';
  playBothBtn.textContent = '▶ ▶ 동시재생';
  playBothBtn.title = '두 영상 동시 재생/일시정지';
  controlsContainer.appendChild(playBothBtn);
}

/* ---------------- 상태 ---------------- */
let handlerTimeUpdate = null;
let convertedRanges = []; // [{start,end,title?,description?}]
let TestvideoData = {};
let originalName = '';

/* ---------------- 유틸 ---------------- */
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const isFiniteDur = (d) => Number.isFinite(d) && d > 0;

function waitLoadedMeta(video) {
  return new Promise((res) => {
    if (video.readyState >= 1 && isFiniteDur(video.duration)) return res();
    video.addEventListener('loadedmetadata', res, { once: true });
    video.load?.();
  });
}
async function ensureReadyAndSyncTime(targetTime = null) {
  await Promise.all([waitLoadedMeta(inputVideo), waitLoadedMeta(outputVideo)]);
  const t = targetTime ?? (outputVideo.currentTime || inputVideo.currentTime || 0);
  inputVideo.currentTime = t;
  outputVideo.currentTime = t;
}
function fmtTime(t) {
  if (!Number.isFinite(t)) return '00:00';
  const s = Math.floor(t % 60);
  const m = Math.floor((t / 60) % 60);
  const h = Math.floor(t / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function applyPlayLabel() {
  const playing = !outputVideo.paused && !outputVideo.ended;
  if (playBothBtn) {
    playBothBtn.textContent = playing ? '⏸ 동시일시정지' : '▶ ▶ 동시재생';
    playBothBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
  }
}
async function playBothStart() {
  await ensureReadyAndSyncTime();
  await Promise.allSettled([inputVideo.play(), outputVideo.play()]);
  applyPlayLabel();
}
function playBothPause() {
  inputVideo.pause();
  outputVideo.pause();
  applyPlayLabel();
}
async function toggleBothPlay() {
  const playing = !outputVideo.paused && !outputVideo.ended;
  if (playing) playBothPause();
  else await playBothStart();
}

/* ---------------- 개별 pause 버튼 제거 ---------------- */
function removeIndividualPauseButtons() {
  document.querySelectorAll('#pauseBtn').forEach(btn => btn.remove());
}

/* ---------------- 공통 타임라인 생성기 (수정된 버전) ---------------- */
function createTimeline({ host, video, showRanges, ranges = [], onSeek, useTooltip }) {
  if (!host) return null;

  // (방법 B) 기존 타임라인 루트만 제거하고 교체
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
  });

  // 트랙 + 라벨
  const track = document.createElement('div');
  const timeLabel = document.createElement('div');

  Object.assign(track.style, {
    position: 'relative',
    flex: '1 1 auto',
    height: '16px',
    cursor: 'pointer',
    // 얇은 회색 라인 바탕
    background: 'linear-gradient(#e5e7eb,#e5e7eb) center/100% 4px no-repeat',
    borderRadius: '6px',
    overflow: 'visible',
  });
  Object.assign(timeLabel.style, {
    flex: '0 0 auto',
    fontSize: '12px',
    color: '#111827'
  });
  timeLabel.textContent = '00:00 / 00:00';

  // 레이어들
  // (1) 진행막대(파란색) — 제일 아래
  const progressLayer = document.createElement('div');
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

  // (2) 변환 구간(노란 표시) — 중간
  const rangeLayer = document.createElement('div');
  Object.assign(rangeLayer.style, {
    position: 'absolute',
    inset: '0 0 0 0',
    pointerEvents: 'none',
    overflow: 'visible',
    zIndex: '1',
  });

  // (3) 노브(동그라미) — 최상단
  const knob = document.createElement('div');
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
    zIndex: '2'
  });
  knob.setAttribute('role', 'slider');
  knob.setAttribute('tabindex', '0');
  knob.setAttribute('aria-valuemin', '0');

  // 조립: 트랙 내부 레이어 순서 중요!
  track.appendChild(progressLayer);
  track.appendChild(rangeLayer);
  track.appendChild(knob);
  root.appendChild(track);
  root.appendChild(timeLabel);
  host.prepend(root); // 한 번만 붙이기

  // 내부 범위 참조
  let rangesRef = Array.isArray(ranges) ? ranges : [];

  // 범위(노란 오버레이) 렌더
  function renderRanges(duration) {
    rangeLayer.innerHTML = '';
    if (!showRanges || !isFiniteDur(duration)) return;
    rangesRef.forEach((r) => {
      const s0 = Number(r.start) || 0;
      const e0 = Number(r.end)   || 0;
      const s = Math.max(0, Math.min(s0, duration));
      const e = Math.max(0, Math.min(e0, duration));
      if (e <= s) return; // 0폭은 스킵
      const seg = document.createElement('div');
      Object.assign(seg.style, {
        position: 'absolute',
        top: '50%',
        height: '6px',
        transform: 'translateY(-50%)',
        background: 'rgba(255,205,80,.85)',
        borderRadius: '4px',
        left: `${clamp01(s / duration) * 100}%`,
        width: `${clamp01((e - s) / duration) * 100}%`,
      });
      rangeLayer.appendChild(seg);
    });
  }

  // 좌표 → 시간
  const clientXToTime = (clientX) => {
    const rect = track.getBoundingClientRect();
    const dur = video?.duration || 0;
    if (!isFiniteDur(dur) || rect.width <= 0) return 0;
    const pct = clamp01((clientX - rect.left) / rect.width);
    return pct * dur;
  };

  // 진행 상태 업데이트
  function update(time, dur) {
    const d = isFiniteDur(dur) ? dur : (video?.duration || 0);
    const t = Math.max(0, Math.min(time || 0, d || 0));
    const pct = d > 0 ? (t / d) : 0;

    knob.style.left = `${pct * 100}%`;
    progressLayer.style.width = `${pct * 100}%`;

    timeLabel.textContent = `${fmtTime(t)} / ${fmtTime(d || 0)}`;
    knob.setAttribute('aria-valuenow', String(t.toFixed(3)));
    knob.setAttribute('aria-valuemax', String(d || 0));
  }

  function updateDuration(dur) {
    renderRanges(dur);
    update(video?.currentTime || 0, dur);
  }

  // 툴팁/외부에서 쓰는 API
  function getRangeAt(t) {
    return rangesRef.find(r => t >= (Number(r.start) || 0) && t <= (Number(r.end) || 0));
  }
  function setRanges(next) {
    rangesRef = Array.isArray(next) ? next : [];
    renderRanges(video?.duration || 0);
  }

  // 입력(트랙) 포인터
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

  // 안전망: 트랙 내부 클릭만 처리
  host.addEventListener('click', async (e) => {
    if (!track.contains(e.target)) return;
    const rect = track.getBoundingClientRect();
    const dur = video?.duration || 0;
    if (!isFiniteDur(dur) || rect.width <= 0) return;
    const t = clamp01((e.clientX - rect.left) / rect.width) * dur;
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



/* ---------------- 인풋/아웃풋 타임라인 세팅 ---------------- */
let inputTL = null;
let outputTL = null;

function setupInputTimeline() {
  if (!inputTimelineHost) return;
  inputTL = createTimeline({
    host: inputTimelineHost,
    video: inputVideo,
    showRanges: false,
    ranges: [],
    useTooltip: false,
    onSeek: async (t) => {
      await ensureReadyAndSyncTime(t);
      await playBothStart();
    }
  });
  inputVideo.addEventListener('timeupdate', () => {
    inputTL.update(inputVideo.currentTime, inputVideo.duration);
  });
  inputVideo.addEventListener('loadedmetadata', () => {
    inputTL.updateDuration(inputVideo.duration);
  });
}

function setupOutputTimeline() {
  if (!outputTimelineHost) return;

  // 툴팁 기본 스타일 그대로…
  if (tooltipEl) {
    Object.assign(tooltipEl.style, {
      position: 'absolute',
      bottom: '120%',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '99999',
      pointerEvents: 'none',
      opacity: '0',
      visibility: 'hidden',
    });
  }

  outputTL = createTimeline({
    host: outputTimelineHost,
    video: outputVideo,
    showRanges: true,
    ranges: convertedRanges,           // ← 오버레이는 이걸로 렌더됨
    useTooltip: true,
    onSeek: async (t) => {
      await ensureReadyAndSyncTime(t);
      await playBothStart();
    }
  });

  // 혹시 변환 구간 배열을 나중에 갱신할 수도 있으니 한번 더 동기화
  outputTL.setRanges(convertedRanges);

  // 툴팁 로직
  const showTooltip = (e) => {
    if (!tooltipEl || !outputTL?.track) return;

    const rect = outputTL.track.getBoundingClientRect();
    const dur  = outputVideo?.duration || 0;

    // ✅ duration/폭 가드: 유효하지 않으면 숨김
    if (!isFiniteDur(dur) || rect.width <= 0) {
      hideTooltip();
      return;
    }

    const pct = clamp01((e.clientX - rect.left) / rect.width);
    const t   = pct * dur;

    // ✅ 전역이 아닌 인스턴스의 범위로 판정
    const range = outputTL.getRangeAt(t);
    if (!range) {
      hideTooltip();
      return;
    }

    const titleEl = tooltipEl.querySelector('.tooltip-title');
    const descEl  = tooltipEl.querySelector('.tooltip-desc');
    if (titleEl) titleEl.textContent = range.title || '변환 구간';
    if (descEl)  descEl.textContent  = range.description || '변환이 적용된 구간';
    if (tooltipTimeEl) {
      tooltipTimeEl.textContent = `${(range.start ?? 0).toFixed(2)}s - ${(range.end ?? 0).toFixed(2)}s`;
    }

    const leftPct = pct * 100;
    tooltipEl.style.left = `${leftPct}%`;
    tooltipEl.classList.add('show');
    tooltipEl.style.opacity = '1';
    tooltipEl.style.visibility = 'visible';
  };

  const hideTooltip = () => {
    if (!tooltipEl) return;
    tooltipEl.classList.remove('show');
    tooltipEl.style.opacity = '0';
    tooltipEl.style.visibility = 'hidden';
  };

  outputTL.track.addEventListener('mousemove', showTooltip);
  outputTL.track.addEventListener('mouseleave', hideTooltip);

  outputVideo.addEventListener('timeupdate', () => {
    outputTL.update(outputVideo.currentTime, outputVideo.duration);
  });
  outputVideo.addEventListener('loadedmetadata', () => {
    outputTL.updateDuration(outputVideo.duration); // ← 여기서 노란 오버레이가 다시 렌더
  });
}



/* ---------------- 변환(출력) timeupdate: 비디오 클래스 토글 ---------------- */
function setupOutputTimeUpdate() {
  if (handlerTimeUpdate) {
    outputVideo.removeEventListener('timeupdate', handlerTimeUpdate);
  }
  handlerTimeUpdate = () => {
    const t = outputVideo.currentTime;
    const active = convertedRanges.find(r => t >= (r.start || 0) && t <= (r.end || 0));
    if (active) outputVideo.classList.add('range-active');
    else outputVideo.classList.remove('range-active');
  };
  outputVideo.addEventListener('timeupdate', handlerTimeUpdate);
}

/* ---------------- 동시 재생 버튼 바인딩 ---------------- */
function bindPlayBothButton() {
  if (!playBothBtn) return;
  playBothBtn.addEventListener('click', toggleBothPlay);
  outputVideo.addEventListener('play', applyPlayLabel);
  outputVideo.addEventListener('pause', applyPlayLabel);
  applyPlayLabel();
}

/* ---------------- 응답 포맷 유연 파싱 ---------------- */
function normalizeConvertedRanges(result) {
  const candidates =
    result?.convertedSpans ??
    result?.convertedRanges ??
    result?.processedRanges ??
    result?.riskyRanges ??
    [];
  const arr = Array.isArray(candidates) ? candidates : [];
  return arr.map(({ start, end, title, description }) => ({
    start: Number(start) || 0,
    end: Number(end) || 0,
    title: title || undefined,
    description: description || undefined,
  }));
}

/* ---------------- 업로드 후 연결 ---------------- */
async function handleVideoAfterUpload(file) {
  const key = file.name;
  const meta = TestvideoData[key];
  if (!meta) {
    alert('등록되지 않은 영상입니다.');
    return;
  }

  const inputURL  = URL.createObjectURL(file);
  const outputURL = meta.outputSrc;

  inputVideo.src  = inputURL;
  outputVideo.src = outputURL;

  await Promise.all([waitLoadedMeta(inputVideo), waitLoadedMeta(outputVideo)]);

  convertedRanges = meta.convertedRanges || [];

  setupInputTimeline();
  setupOutputTimeline();
  setupOutputTimeUpdate();
  bindPlayBothButton();

  outputVideo.classList.remove('range-active');

  try {
    await ensureReadyAndSyncTime(0);
    await Promise.allSettled([inputVideo.play(), outputVideo.play()]);
  } catch (_) {
    // 자동재생이 막혀도 재생 버튼/타임라인으로 시작 가능
  } finally {
    applyPlayLabel();
  }
}

/* ---------------- 업로드 버튼 ---------------- */
uploadButton?.addEventListener('click', () => {
  fileInput.value = '';
  fileInput.click();
});

/* ---------------- PLAY(업로드/처리 트리거) ---------------- */
document.getElementById('dashboard-play')?.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const btn = e.currentTarget;
  btn.disabled = true;
  showDetectSplash();

  try {
    const file = fileInput.files?.[0];
    if (!file) {
      alert('파일을 선택해주세요');
      return;
    }

    await ensureAccess();

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

    const result = await response.json();

    const base = result.outputSrc || result.output || '';
    const finalSrc = base ? `${base}${base.includes('?') ? '&' : '?'}cb=${Date.now()}` : '';

    const ranges = normalizeConvertedRanges(result);
    const safeVideoId = isNaN(parseInt(result.video_id))
      ? result.video_id
      : parseInt(result.video_id);

    TestvideoData[file.name] = {
      outputSrc: finalSrc,
      fps: result.fps ?? null,
      convertedRanges: ranges,
      videoId: safeVideoId,
      graphData: Array.isArray(result.graphData) ? result.graphData : [],
      cvLabelOrder: Array.isArray(result.cvLabelOrder) ? result.cvLabelOrder : [],
    };

    try {
      let graphDataToUse =
        (Array.isArray(result.graphData) && result.graphData.length > 0)
          ? result.graphData
          : null;

      if (!graphDataToUse) {
        const testResp = await fetch('/data/test_data.json', { cache: 'no-store' });
        graphDataToUse = await testResp.json();
      }
      const fps = Number(result.fps) || 30;
      const cvLabelOrder = Array.isArray(result.cvLabelOrder) ? result.cvLabelOrder : [];
      RiskGraph(graphDataToUse, fps, cvLabelOrder);
    } catch (gErr) {
      console.error('Graph 렌더링 실패:', gErr);
    }

    await handleVideoAfterUpload(file);
    if (result?.message) alert(result.message);
    else alert('업로드 및 처리 완료!');
  } catch (err) {
    console.error(err);
    alert(`처리 중 오류가 발생했습니다.\n${err?.message || err}`);
  } finally {
    hideDetectSplash();
    btn.disabled = false;
  }
});

/* ---------------- SAVE ---------------- */
document.getElementById('dashboard-save')?.addEventListener('click', async () => {
  const btn = document.getElementById('dashboard-save');
  if (btn.dataset.busy === '1') return;
  btn.dataset.busy = '1';
  btn.disabled = true;

  const src = outputVideo.src;
  if (!src) {
    alert('변환된 영상이 없습니다.');
    btn.dataset.busy = '0';
    btn.disabled = false;
    return;
  }

  try {
    const resp = await fetch(src);
    const blob = await resp.blob();

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = blobUrl;
    a.download = `${originalName || 'video'}_converted.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);

    const rawId = parseInt(TestvideoData[originalName]?.videoId);
    const videoId = typeof rawId === 'string' ? parseInt(rawId) : rawId;

    let token = localStorage.getItem('access_token') || '';
    if (videoId && !isNaN(videoId) && token) {
      await saveHistory(videoId, token);
    }

    const history = JSON.parse(localStorage.getItem('video_history') || '[]');
    history.unshift({
      title: a.download,
      video_id: videoId,
      savedAt: timestamp,
    });
    localStorage.setItem('video_history', JSON.stringify(history));
  } catch (e) {
    console.error('영상 저장 실패:', e);
    alert('영상 저장 중 오류가 발생했습니다.');
  } finally {
    btn.dataset.busy = '0';
    btn.disabled = false;
  }
});

async function saveHistory(videoId, token) {
  try {
    await ensureAccess();
    const response = await authFetch(`${API_BASE}/nova/history/${encodeURIComponent(videoId)}`, {
      method: 'POST',
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('히스토리 저장 실패:', errorText);
    }
  } catch (err) {
    console.error('히스토리 저장 중 오류:', err);
  }
}

/* ---------------- 초기화 ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  removeIndividualPauseButtons();
  bindPlayBothButton();

  const userId = document.getElementById('user-id');
  if (userId) {
    userId.style.cursor = 'pointer';
    userId.addEventListener('click', () => {
      window.location.href = 'history.html';
    });
  }
});

fileInput?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) originalName = file.name;
});

/* ---------------- 위험도 그래프 ---------------- */
function RiskGraph(data, fps = 30, cvLabelOrder = []) {
  const graphContainer = document.querySelector("#graph");
  graphContainer.innerHTML = "";
  const seriesData = { "섬광": [], "패턴": [], "단색": [] };

  const labelsLen = Array.isArray(data?.[0]?.labels) ? data[0].labels.length : 0;
  if (labelsLen < 3) return;

  const nCv = labelsLen - 3;
  const idxFlash   = nCv + 0;
  const idxPattern = nCv + 1;
  const idxRed     = nCv + 2;
  const inRange = (i) => i >= 0 && i < labelsLen;

  const GROUPS = {
    "섬광": [0, 2, 3, idxFlash].filter(inRange),
    "패턴": [4, 5, idxPattern].filter(inRange),
    "단색": [1, 3, idxRed].filter(inRange)
  };
  const W = (i) => (i === 3 ? 0.5 : 1);
  const DEN = {
    "섬광": GROUPS["섬광"].reduce((a, i) => a + W(i), 0) || 1,
    "패턴": GROUPS["패턴"].reduce((a, i) => a + W(i), 0) || 1,
    "단색": GROUPS["단색"].reduce((a, i) => a + W(i), 0) || 1,
  };

  data.forEach((pt, i) => {
    const x = (typeof pt.frame === "number")
      ? pt.frame
      : Number.isFinite(pt.start) ? Math.round(pt.start * fps) : i;

    const L = Array.isArray(pt.labels) ? pt.labels : [];

    const covFlash   = GROUPS["섬광"].reduce((a, k) => a + W(k) * (Number(L[k]) || 0), 0) / DEN["섬광"];
    const covPattern = GROUPS["패턴"].reduce((a, k) => a + W(k) * (Number(L[k]) || 0), 0) / DEN["패턴"];
    const covRed     = GROUPS["단색"].reduce((a, k) => a + W(k) * (Number(L[k]) || 0), 0) / DEN["단색"];

    seriesData["섬광"].push({ x, y: covFlash   });
    seriesData["패턴"].push({ x, y: covPattern });
    seriesData["단색"].push({ x, y: covRed     });
  });

  const options = {
    chart: { type: 'area', height: 300, stacked: false, background: 'transparent', toolbar: { show: true } },
    stroke: { width: 2, lineCap: 'round', curve: 'smooth' },
    fill: { type: 'solid', opacity: 0.3 },
    grid: { padding: { top: 8, right: 12, bottom: 12, left: 12 } },
    legend: { position: 'top', horizontalAlign: 'left' },
    dataLabels: { enabled: false },
    series: [
      { name: "패턴", data: seriesData["패턴"] },
      { name: "단색", data: seriesData["단색"] },
      { name: "섬광", data: seriesData["섬광"] }
    ],
    xaxis: { type: 'numeric', title: { text: "프레임" }, labels: { formatter: (v) => `${Math.round(v)}` }, tickAmount: 10 },
    yaxis: { min: 0, max: 1, title: { text: "그룹 커버리지(%)" }, labels: { formatter: (val) => (Number(val) * 100).toFixed(0) } },
    tooltip: {
      x: { formatter: (frame) => `프레임 ${frame} (${(frame / fps).toFixed(3)}s)` },
      y: { formatter: (val) => `${(Number(val) * 100).toFixed(1)}%` }
    },
    colors: ['#FF78AA', '#5AED9C', '#FFEC5A']
  };
  new ApexCharts(graphContainer, options).render();
}

/* ---------------- (선택) 테스트 모드 ---------------- */
const TEST_MODE = true;
if (TEST_MODE) {
  inputVideo.src  = "/videos/26_lightning.mp4";
  outputVideo.src = "/videos/coffee.mp4";
  convertedRanges = [
    { start: 0.0, end: 2.5, title: "구간 A", description: "패턴 오버레이" },
    { start: 3.5, end: 5.9, title: "구간 B", description: "적색 억제" },
  ];
  Promise.all([waitLoadedMeta(inputVideo), waitLoadedMeta(outputVideo)]).then(async () => {
    removeIndividualPauseButtons();
    setupInputTimeline();
    setupOutputTimeline();
    setupOutputTimeUpdate();
    bindPlayBothButton();
    applyPlayLabel();
    await ensureReadyAndSyncTime(0);
    await Promise.allSettled([inputVideo.play(), outputVideo.play()]);
  });
}