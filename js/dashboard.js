// ===== 백엔드 연동 + 기본 로직 (원본 유지) =====
import { API_BASE, ensureAccess, authFetch } from './auth.js';
import {toast} from './toast.js'

function getParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}

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

//스플래시 유틸 함수
function setDetectingUI(isOn) {
  const hosts = [
    document.getElementById('inputTimelineHost'),
    document.getElementById('outputTimelineHost')
  ];
  hosts.forEach((h) => {
    if (!h) return;
    if (isOn) {
      h.classList.add('ui-disabled');
      h.setAttribute('aria-disabled', 'true');
      try { h.setAttribute('inert', ''); } catch {}
    } else {
      h.classList.remove('ui-disabled');
      h.removeAttribute('aria-disabled');
      try { h.removeAttribute('inert'); } catch {}
    }
  });
  try { hideTooltip?.(); } catch {}
}
//히스토리 저장
function clearQueryVideoId() {
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('video_id')) {
      u.searchParams.delete('video_id');
      history.replaceState(null, '', `${u.pathname}${u.search}`);
    }
  } catch {}
}

// 스플래시
const splashEl = document.getElementById('detect-splash');
let splashTimeout = null;

function showDetectSplash() {
  console.log('스플래시 표시');
  if (splashEl) {
        splashEl.hidden = false;
        splashEl.style.position = 'fixed';
        splashEl.style.inset = '0';
        splashEl.style.zIndex = '20000';
        splashEl.setAttribute('aria-busy', 'true');
      }
      document.documentElement.classList.add('is-detecting');
      setDetectingUI(true);
}
function hideDetectSplash() {
  console.log('스플래시 숨김');
  if (splashTimeout) {
    clearTimeout(splashTimeout);
    splashTimeout = null;
  }
  if (splashEl) {
        splashEl.hidden = true;
        splashEl.removeAttribute('aria-busy');
      }
      document.documentElement.classList.remove('is-detecting');
      setDetectingUI(false);
}
document.addEventListener('DOMContentLoaded', hideDetectSplash);

// 엘리먼트
const uploadButton = document.getElementById('dashboard-upload');
const fileInput = document.getElementById('videoInput');
const inputVideo = document.getElementById('inputVideo');
const outputVideo = document.getElementById('outputVideo');
const overlayVideo = document.getElementById('overlayVideo');
//const pauseBtn = document.getElementById('pauseBtn');

let handlerTimeUpdate = null;
let pause = false;
let currentInputURL = null;
let currentOutputURL = null;
let overlayRanges = [];
let currentOverlay = null;
let TestvideoData = {};
let originalName = '';

// FPS 헬퍼
function frameToSeconds(frame, fps) {
  return frame / fps;
}

// 임시 저장 포맷
async function saveRawFrameData(rawFrameData) {
  console.log("saveRawFrameData 실행");
  const FrameToVideoData = {};
  for (const [fileName, { outputSrc, overlayRanges }] of Object.entries(rawFrameData)) {
    FrameToVideoData[fileName] = { outputSrc, overlayRanges };
  }
  return FrameToVideoData;
}

function isSameOrigin(url) {
  try { return new URL(url, location.href).origin === location.origin; }
  catch { return true; }
}

// 새 탭 오픈 없이 바로 다운로드 트레이로 떨어뜨리는 도우미
async function downloadBlob(url, filename) {
  const same = isSameOrigin(url);
  const resp = await fetch(url, {
    cache: 'no-store',
    credentials: same ? 'include' : 'omit',
    mode: same ? 'same-origin' : 'cors',
  });
  if (!resp.ok) throw new Error(`다운로드 응답 실패: ${resp.status}`);
  const blob = await resp.blob();
  const blobUrl = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename; // ▶ 다운로드 트레이로 직행
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch {} }, 4000);
}

// (옵션) 혹시 payload에 URL이 비어있을 때 대비해 후보 경로 만들어주는 헬퍼
function buildPdfCandidates(payload, videoSrc) {
  const out = [];
  const add = (u) => { if (u && !out.includes(u)) out.push(u); };
  const abs = (u) => { try { return new URL(u, API_BASE || location.origin).href; } catch { return u; } };

  // 1) 서버가 응답에 준 URL을 최우선
  add(abs(payload?.frameLabelsPdf || payload?.frame_labels_pdf));

  // 2) inputSrc 기준 추정: /static/uploads/{file_key}/frame_labels.pdf
  const inSrc = payload?.inputSrc || payload?.input_src;
  if (inSrc) {
    try {
      const u = new URL(inSrc, API_BASE || location.origin);
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.indexOf('uploads');
      const key = idx >= 0 ? parts[idx + 1] : null;
      if (key) add(`${u.origin}/static/uploads/${key}/frame_labels.pdf`);
    } catch {}
  }

  // 3) outputSrc(또는 현재 videoSrc) 기준 추정: /static/uploads/{video_id}/frame_labels.pdf
  const outSrc = payload?.outputSrc || payload?.output_src || videoSrc;
  if (outSrc) {
    try {
      const u = new URL(outSrc, API_BASE || location.origin);
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.indexOf('uploads');
      const vid = idx >= 0 ? parts[idx + 1] : null;
      if (vid) add(`${u.origin}/static/uploads/${vid}/frame_labels.pdf`);
    } catch {}
  }
  return out.filter(Boolean);
}


// 타임라인 툴팁 (원본 유지 + 위치 계산만 아래서 재정의)
const tooltip = document.getElementById('timelineTooltip');
const tooltipTime = document.getElementById('tooltipTime');

function showTooltip(e, range) {
  const tooltipTitle = tooltip.querySelector('.tooltip-title');
  const tooltipDesc = tooltip.querySelector('.tooltip-desc');

  tooltipTitle.textContent = range.title || '위험 구간';
  tooltipDesc.textContent = Array.isArray(range.labels) && range.labels.length
    ? range.labels.join(', ')
    : '';
  tooltipTime.textContent = `${range.start}s - ${range.end}s`;

  tooltip.classList.add('show');
  updateTooltipPosition(e); // ↓ 아래에서 host 기준으로 재정의
}
function hideTooltip() {
  tooltip.classList.remove('show');
}
function updateTooltipPosition(e) {
  // 기본 구현(안 쓰이게 오버라이드됨)
  const rect = document.querySelector('.timeline-container').getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const tooltipPercentage = (mouseX / rect.width) * 100;
  tooltip.style.left = `${tooltipPercentage}%`;
  tooltip.style.transform = 'translateX(-50%)';
}

// 재생/일시정지 (원본 유지)
/*function handlerPauseBtn() {
  if (pause) {
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
}*/

// 히스토리 복원 (백엔드 연동 원본 유지)
async function hydrateFromHistory(videoId) {
  await ensureAccess();
  const res = await authFetch(`${API_BASE}/nova/history/${encodeURIComponent(videoId)}`);
  if (!res.ok) {
    const t = await res.text().catch(()=> '');
    throw new Error(`히스토리 로드 실패: ${res.status} ${t}`);
  }
  const data = await res.json();
  const detail = data?.history?.[0] || {};
  const payload = detail.payload || {};

  // 비디오 소스
  const finalSrcBase = payload.outputSrcInterpolated || payload.outputSrc || '';
  const finalSrc = finalSrcBase
    ? `${finalSrcBase}${finalSrcBase.includes('?') ? '&' : '?'}cb=${Date.now()}`
    : '';

  const inputSrc = payload.inputSrc || payload.outputSrc; // 구버전 payload 호환
  if (inputSrc) {
    const ver = inputSrc.includes('?') ? '&' : '?';
    inputVideo.src = `${inputSrc}${ver}cb=${Date.now()}`;
    inputVideo.load?.();
  }
  
  outputVideo.src = finalSrc;
  outputVideo.load?.();
  outputVideo.dataset.videoId = String(videoId);
  outputVideo.dataset.originalName = detail.video_title || `video_${videoId}`;

  //파일이름 반영
  originalName = outputVideo.dataset.originalName || '';
  setUploadLabelFromName(originalName, { stripExt: false });


  // 그래프
  const fps = Number(payload.fps) || 30;
  const cvLabelOrder = Array.isArray(payload.cvLabelOrder) ? payload.cvLabelOrder : [];
  const graphData = Array.isArray(payload.graphData) ? payload.graphData : [];
  RiskGraph(graphData, fps, cvLabelOrder);

  // 슬라이더 복원
  const pReq = payload.requestedParams || {};
  const pApp = payload.appliedParams || {};
  if (document.getElementById('brightness')) {
    document.getElementById('brightness').value = String(
      pReq.brightness ?? pApp.v_min ?? 0.75
    );
  }
  if (document.getElementById('saturation')) {
    document.getElementById('saturation').value = String(
      pReq.saturation ?? pApp.s_min ?? 0.75
    );
  }
  const bEl = document.getElementById('brightness');
  const sEl = document.getElementById('saturation');
  const bVal = document.getElementById('brightnessVal');
  const sVal = document.getElementById('saturationVal');
  if (bEl && bVal) bVal.textContent = parseFloat(bEl.value).toFixed(2);
  if (sEl && sVal) sVal.textContent = parseFloat(sEl.value).toFixed(2);

  // 타임라인(위험 구간)
  overlayRanges = Array.isArray(payload.riskyRanges)
  ? payload.riskyRanges.map(({ start, end, labels }) => ({
      start: Number(start) || 0,
      end:   Number(end)   || 0,
      labels: Array.isArray(labels) ? labels : []
    }))
  : [];
  setupTimeline();          // ← 아래에서 인/아웃 타임라인 모두 세팅으로 오버라이드됨
  setupTimeUpdateHandler(); // ← 아래에서 진행바 갱신까지 포함되도록 오버라이드됨

  // 메타 저장
  TestvideoData[detail.video_title || `video_${videoId}`] = {
    inputSrc,
    outputSrc: finalSrc, fps, overlayRanges,
    videoId: Number(videoId), graphData, cvLabelOrder,
    interpPairs: Array.isArray(payload.interpolatedSpans) ? payload.interpolatedSpans : [],
    lastPayload: payload 
  };

  applyGuidelinesFromResult({
    cvUnionByLabel: payload.cvUnionByLabel,
    cvLabelOrder: payload.cvLabelOrder,
    guidelineSummary: payload.guidelineSummary, // 폴백용
  });

  // ===== 초기화: 자동재생 없이 0초로 정렬 =====
  try {
      await ensureReadyAndSyncTime(0);
      inputVideo.pause?.();
      outputVideo.pause?.();
      overlayVideo.pause?.();
      overlayVideo.src = "";
      overlayVideo.style.opacity = "0";
      timelineIn?.update?.(0, inputVideo.duration);
      timelineOut?.update?.(0, outputVideo.duration);
      applyPlayLabel?.();
    } catch {}
}

// 업로드 후 세팅 (원본 유지)
async function handleVideoAfterUpload(file) {
  console.log("handleVideoAfterUpload 호출됨");

  setUploadLabelFromName(file?.name || originalName || '');

  const videoKey = file.name;
  const currentVideo = TestvideoData[videoKey];
  if (!currentVideo) return alert("등록되지 않은 영상입니다.");

  //const inputURL = URL.createObjectURL(file);
  if (currentInputURL) { try { URL.revokeObjectURL(currentInputURL); } catch {} }
  currentInputURL = URL.createObjectURL(file);
  inputVideo.src = currentInputURL;
  const outputURL = currentVideo.outputSrc;

  //inputVideo.src = inputURL;
  outputVideo.src = outputURL;

  //currentInputURL = inputURL;
  currentOutputURL = outputURL;

  await new Promise(resolve => {
    outputVideo.onloadedmetadata = () => {
      console.log("outputVideo metadata loaded");
      resolve();
    };
    outputVideo.load();
  });

  // overlayRange 세팅
  const videoData = await saveRawFrameData(TestvideoData);
  overlayRanges = videoData[videoKey].overlayRanges;
  console.log(overlayRanges);

  // 리스너 등록
  setupTimeline();
  setupTimeUpdateHandler();

  overlayVideo.pause();
  overlayVideo.currentTime = 0;
  overlayVideo.style.opacity = "0";
  // 자동재생 없이 두 영상/재생바를 0초로 정렬
  await ensureReadyAndSyncTime(0);
  inputVideo.pause();
  outputVideo.pause();
  // 타임라인 UI도 0초로 표시
  try {
    timelineIn?.update?.(0, inputVideo.duration);
    timelineOut?.update?.(0, outputVideo.duration);
    applyPlayLabel?.();
  } catch {}

}

// (원본) 구 타임라인 - 아래서 오버라이드할 거라 유지
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

// 업로드 버튼
uploadButton.addEventListener('click', () => {
  fileInput.value = '';
  fileInput.click();
});

// 업로드 버튼 -> 파일명 업데이트트
function setUploadLabelFromName(name, { stripExt = false, max = 36 } = {}) {
  if (typeof name !== 'string' || !name) return;

  let display = stripExt ? name.replace(/\.[^./]+$/, '') : name;
  if (display.length > max) display = display.slice(0, max - 1) + '…';

  // 1순위: <span class="label"> 있으면 그걸 쓴다
  let labelEl = uploadButton.querySelector('.label');

  if (labelEl) {
    labelEl.textContent = display;
  } else {
    // 2순위: 텍스트 노드 교체 (img 등 다른 노드는 그대로)
    const textNode = Array.from(uploadButton.childNodes)
      .find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0);

    if (textNode) {
      textNode.textContent = ' ' + display; // img와 간격용 공백
    } else {
      // 텍스트 노드가 없다면 span.label을 하나 만들어 붙인다
      labelEl = document.createElement('span');
      labelEl.className = 'label';
      labelEl.textContent = display;
      uploadButton.appendChild(labelEl);
    }
  }

  uploadButton.title = name; 
  uploadButton.setAttribute('aria-label', `선택된 파일: ${name}`);
}

// 슬라이더
const brightnessSlider = document.getElementById("brightness");
const brightnessVal = document.getElementById("brightnessVal");
const saturationSlider = document.getElementById("saturation");
const saturationVal = document.getElementById("saturationVal");

brightnessSlider.addEventListener('input', (e) => {
  const val = e.target.value;
  e.target.style.background = `linear-gradient(to right, #5287EA ${val*100}%, #ddd ${val*100}%)`;
});
saturationSlider.addEventListener('input', (e) => {
  const val = e.target.value;
  e.target.style.background = `linear-gradient(to right, #5287EA ${val*100}%, #ddd ${val*100}%)`;
});
brightnessSlider.addEventListener("input", () => {
  brightnessVal.textContent = parseFloat(brightnessSlider.value).toFixed(2);
});
saturationSlider.addEventListener("input", () => {
  saturationVal.textContent = parseFloat(saturationSlider.value).toFixed(2);
});

// PLAY (백엔드 연동 원본 유지)
document.getElementById('dashboard-play').addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();

  const btn = e.currentTarget;
  btn.disabled = true;
  showDetectSplash();

  const file = document.getElementById('videoInput').files[0];
  if (!file) { alert('파일을 선택해주세요'); hideDetectSplash(); btn.disabled = false; return; }
  const brightness = Number.parseFloat(brightnessSlider.value);
  const saturation = Number.parseFloat(saturationSlider.value);
  const formData = new FormData();
  formData.append('video', file);
  formData.append('brightness', String(Number.isFinite(brightness) ? brightness : 0.75));
  formData.append('saturation', String(Number.isFinite(saturation) ? saturation : 0.75));

  try {
    await ensureAccess();

    const response = await authFetch(`${API_BASE}/nova/dashboard/video/upload/`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`업로드 실패 (${response.status}) ${text || ''}`);
    }

    const result = await response.json();
    console.log('📦 upload result:', result);

    const finalSrcBase = result.outputSrcInterpolated || result.outputSrc || '';
    const finalSrc = finalSrcBase
      ? `${finalSrcBase}${finalSrcBase.includes('?') ? '&' : '?'}cb=${Date.now()}`
      : '';

    const overlayRangesSec = Array.isArray(result.riskyRanges)
    ? result.riskyRanges.map(({ start, end, labels }) => ({
        start: Number(start) || 0,
        end:   Number(end)   || 0,
        labels: Array.isArray(labels) ? labels : []   // ← 라벨 유지
      }))
    : [];
    

    const interpPairs = Array.isArray(result.interpolatedSpans)
      ? result.interpolatedSpans.map(({ start, end }) => ({
          start: Number(start) || 0,
          end: Number(end) || 0,
        }))
      : [];

      const inputSrcBase = result.inputSrc || result.outputSrc || '';
      const inputSrc = inputSrcBase
        ? `${inputSrcBase}${inputSrcBase.includes('?') ? '&' : '?'}cb=${Date.now()}`
        : '';
            if (outputVideo && finalSrc) {
        outputVideo.src = finalSrc;
        outputVideo.load?.();
      }

    const rawId = String(result.video_id ?? '');
    const safeVideoId = /^\d+$/.test(rawId) ? Number(rawId) : rawId;

    outputVideo.dataset.videoId = String(safeVideoId);
    outputVideo.dataset.originalName = file.name;
    // 히스토리 진입 시에도 업로드 버튼 라벨/접근성 갱신
    originalName = outputVideo.dataset.originalName;
    setUploadLabelFromName(originalName, { stripExt: false });
    
    TestvideoData[file.name] = {
      inputSrc,
      outputSrc: finalSrc,
      fps: result.fps ?? null,
      overlayRanges: overlayRangesSec,
      videoId: safeVideoId,
      graphData: Array.isArray(result.graphData) ? result.graphData : [],
      interpPairs,
      cvLabelOrder: Array.isArray(result.cvLabelOrder) ? result.cvLabelOrder : [],
      requestedParams: result.requestedParams || { brightness, saturation },
      appliedParams: result.appliedParams || null,
      cvUnionByLabel: result.cvUnionByLabel || null,
      cvAnyMask: result.cvAnyMask || null,
      lastPayload: result
    };

    // 그래프
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

    function deriveGuidelineSummaryFromPredict(result) {
      const pr =
        result?.predict_result ??
        result?.lastPayload?.predict_result ??
        result?.payload?.predict_result ?? // 히스토리 복원 payload 대비
        null;
    
      const flags = pr?.result?.flags;
      if (!flags) return null;
    
      const sumArr = (arr) =>
        Array.isArray(arr) ? arr.reduce((a, b) => a + (Number(b) || 0), 0) : 0;
    
      const sFlash = sumArr(flags.flash);
      const sPattern = sumArr(flags.pattern);
      const sRed = sumArr(flags.redlight);
    
      return {
        flash:   { violated: sFlash   > 0, sum: sFlash,   message: "휘도차 20cd/m² 이상 면적이 큰 섬광" },
        pattern: { violated: sPattern > 0, sum: sPattern, message: "초당 3회 이상 적색 섬광" },
        redlight:{ violated: sRed     > 0, sum: sRed,     message: "밝고 어두운 줄무늬 5쌍 이상" }
      };
    }

    applyGuidelinesFromResult({
      cvUnionByLabel: result.cvUnionByLabel,
      cvLabelOrder:   result.cvLabelOrder,
      guidelineSummary: result.guidelineSummary,
    });

    // 후처리
    await handleVideoAfterUpload(file);
    toast('업로드 및 처리 완료!   ', { type: 'success', duration: 2200 });
  } catch (err) {
    console.error(err);
    alert(`처리 중 오류가 발생했습니다.\n${err?.message || err}`);
  } finally {
    hideDetectSplash();
    btn.disabled = false;
  }
});

// 원본 파일명 → ID 매핑 (원본 유지)
function mapFileNameToId(fileName) {
  const cleanedName = fileName
    .replace("_converted", "")
    .replace(".mp4", "")
    .trim();

  const map = { "4_firetruck_flash": 2 };
  return map[cleanedName];
}

window.addEventListener('beforeunload', () => {
  console.warn('🚨 페이지 unload 발생!');
});



// SAVE (백엔드 연동 원본 유지)
document.getElementById('dashboard-save').addEventListener('click', async () => {
  const btn = document.getElementById('dashboard-save');
  if (btn.dataset.busy === '1') return;
  btn.dataset.busy = '1';
  btn.disabled = true;

  const outputVideoEl = document.getElementById('outputVideo');
  const videoSrc = outputVideoEl?.src;

  try {
    if (!videoSrc) {
      toast('변환 영상, 결과지가 저장되었습니다!', { type: 'success', duration: 2200 });
      //alert("변환된 영상이 없습니다.");
      return;
    }

    const q = new URLSearchParams(location.search);
    const idFromQuery = q.get('video_id');
    const idFromDataAttr = outputVideoEl?.dataset?.videoId;
    const dataTitle = (outputVideoEl?.dataset?.originalName || '').trim();
   const urlBaseTitle = (() => {
     try {
       const u = new URL(videoSrc, location.origin);
       const base = u.pathname.split('/').pop() || '';
       const m = base.match(/^(.+?)(?:[_-]interp.*)?\.mp4$/i);
       return m ? m[1] : '';
     } catch { return ''; }
   })();
   const srcName = dataTitle || urlBaseTitle || (typeof originalName === 'string' ? originalName.trim() : '') || 'video';

   // payload는 videoId로 우선 탐색(제목 기반 충돌 방지)
   const videoIdForLookup = idFromQuery ?? idFromDataAttr;
   const payloadForSave =
     (Object.values(TestvideoData).find(v => String(v.videoId) === String(videoIdForLookup))?.lastPayload) ||
     (TestvideoData?.[srcName]?.lastPayload) || null;

    const rawId = idFromQuery ?? idFromDataAttr ?? idFromMap;

    if (!rawId || String(rawId).toLowerCase() === 'undefined' || String(rawId).toLowerCase() === 'null') {
      console.warn('video_id를 찾을 수 없음', { idFromQuery, idFromDataAttr, idFromMap, nameFallback });
      alert('영상 ID를 찾을 수 없습니다. 히스토리에서 다시 진입하거나 새로고침 해주세요.');
      return;
    }

    const videoIdForSave = /^\d+$/.test(String(rawId)) ? Number(rawId) : encodeURIComponent(String(rawId));

    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // 다운로드 트리거
    const response = await fetch(videoSrc);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${srcName}_converted.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    //URL.revokeObjectURL(blobUrl);
    setTimeout(() => {
         try { URL.revokeObjectURL(blobUrl); } catch {}
       }, 5000);


    // 결과 pdf 저장
    try {
      const candidates = buildPdfCandidates(payloadForSave, videoSrc);
      console.log('PDF candidates:', candidates);

      let saved = false;
      for (const url of candidates) {
        try {
          await downloadBlob(url, `${srcName}_frame_labels.pdf`);
          console.log('PDF saved from:', url);
          saved = true;
          break;
        } catch (e) {
          console.warn('PDF try failed:', url, e);
        }
      }
      if (!saved) {
        console.info('frame_labels.pdf를 찾지 못했습니다(서버에 파일이 없거나 경로가 다릅니다).');
      }
    } catch (pdfErr) {
      console.warn('PDF 다운로드 처리 중 오류:', pdfErr);
    }
 

    // 저장 호출 (payload 전달)
    const respSave = await authFetch(`${API_BASE}/nova/history/${videoIdForSave}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_title: srcName, payload: payloadForSave })
    });

    if (!respSave.ok) {
      const txt = await respSave.text().catch(() => '');
      console.warn('저장 실패:', respSave.status, txt);
      alert('저장에 실패했습니다.');
      return;
    }

    const saveResult = await respSave.json();
    console.log('저장 성공:', saveResult);

    const byId = Object.values(TestvideoData).find(v => String(v.videoId) === String(videoIdForSave));
   if (byId && saveResult.video_id) byId.videoId = saveResult.video_id;
   else if (srcName && TestvideoData[srcName] && saveResult.video_id) {
     TestvideoData[srcName].videoId = saveResult.video_id;
   }
    //alert('변환 영상, 결과지가 저장되었습니다!');
    toast('변환 영상, 결과지가 저장되었습니다!', { type: 'success', duration: 2200 });
  } catch (e) {
    console.error('저장 중 오류:', e);
    //alert('저장 중 오류가 발생했습니다.');
    toast('저장 중 오류가 발생했습니다.', { type: 'error' });
    console.log('toast:', typeof toast, 'window.toast:', typeof window.toast);

  } finally {
    btn.dataset.busy = '0';
    btn.disabled = false;
  }
});

// UI 초기화 (원본 유지)
document.addEventListener("DOMContentLoaded", async () => {
  /*
  if (pauseBtn) {
    pauseBtn.removeEventListener('click', handlerPauseBtn);
    pauseBtn.addEventListener('click', handlerPauseBtn);
  }
*/
  const userId = document.getElementById("user-id");
  if (userId) {
    userId.style.cursor = "pointer";
    userId.addEventListener("click", () => {
      window.location.href = "history.html";
    });
  }

  const fromId = getParam('video_id');
  if (fromId) {
    try {
      await hydrateFromHistory(fromId);
    } catch (e) {
      console.error(e);
      alert('히스토리에서 영상 로드에 실패했습니다.');
    }
  }

  const bEl = document.getElementById('brightness');
  const sEl = document.getElementById('saturation');
  const bVal = document.getElementById('brightnessVal');
  const sVal = document.getElementById('saturationVal');

  const paint = (el) => {
    if (!el) return;
    const v = parseFloat(el.value) || 0;
  };

  if (bEl) { paint(bEl); bEl.addEventListener('input', () => { paint(bEl); if (bVal) bVal.textContent = parseFloat(bEl.value).toFixed(2); }); }
  if (sEl) { paint(sEl); sEl.addEventListener('input', () => { paint(sEl); if (sVal) sVal.textContent = parseFloat(sEl.value).toFixed(2); }); }
});

// 업로드 파일명 저장 (원본 유지)
document.getElementById('videoInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    originalName = file.name;
    console.log("originalName 세팅됨:", originalName);

    setUploadLabelFromName(originalName, { stripExt: false });
  }
});

// 그래프 (확률 기반 + cv 비율율)
function RiskGraph(data, fps = 30, cvLabelOrder = []) {
  const graphContainer = document.querySelector("#graph");
  graphContainer.innerHTML = "";
  if (!Array.isArray(data) || data.length === 0) return;

  const hasProbs = !!data[0]?.probs;

  // X축(프레임) 계산
  const pickX = (pt, i) =>
    (typeof pt.frame === "number")
      ? pt.frame
      : Number.isFinite(pt.start) ? Math.round(pt.start * fps) : i;

  // 확률
  const mkSeries = (key, name) => ({
    name,
    data: data.map((pt, i) => ({
      x: pickX(pt, i),
      y: hasProbs ? Number(pt.probs?.[key] ?? 0) : fallbackFromLabels(pt, key)
    }))
  });

  const probseries = [
    mkSeries("flash",   "섬광"),
    mkSeries("pattern", "패턴"),
    mkSeries("redlight","적색")
  ];

  
  // CV 6개 라벨 중 1의 비율(0~1)
  const cvRatioSeries = {
    name: "가이드라인",  
    data: data.map((pt, i) => {
      const L = Array.isArray(pt.labels) ? pt.labels : [];
      const labelsLen = L.length;
      const nCv = Math.max(0, labelsLen - 3); // 앞쪽이 CV
      if (nCv <= 0) return { x: pickX(pt, i), y: 0 };
      // 앞의 nCv 칸에서 1의 개수
      let ones = 0;
      for (let k = 0; k < nCv; k++) {
        if (Number(L[k]) === 1) ones++;
      }
      const ratio = ones / nCv;
      return { x: pickX(pt, i), y: ratio };
    })
  };

  const series = [...probseries, cvRatioSeries];

  const options = {
    chart: { type: 'area', height: 350, background: 'transparent', toolbar: { show: true } }, 
    stroke: { width: 3, lineCap: 'round' },
    fill: { type: 'solid', opacity: [0.6, 0.6, 0.6, 0.3] }, 
    legend: { position: 'top', horizontalAlign: 'left' },
    dataLabels: { enabled: false },
    series,
    xaxis: {
      type: 'numeric',
      title: { text: "프레임" },
      labels: { formatter: (v) => `${Math.round(v)}` },
      tickAmount: 10
    },
    yaxis: {
      min: 0, max: 1,
      title: { text: "광과민성 위험 확률" }, 
      labels: { formatter: (val) => (Number(val) * 100).toFixed(0) }
    },
    tooltip: {
      x: { formatter: (frame) => `프레임 ${frame} (${(frame / fps).toFixed(3)}s)` },
      y: { formatter: (val) => `${(Number(val) * 100).toFixed(1)}%` }
    },
    colors: ['#FFEC5A', '#5AED9C', '#FF78AA', '#FFFFFF'], 
    annotations: {
      yaxis: [{ y: 0.5, borderColor: 'red', borderWidth: 2.5 }]
    }
  };  

  new ApexCharts(graphContainer, options).render();
}


// ====== 여기부터 UI/디자인 확장 (백엔드 호출 불변) ======

// 1) 툴팁 위치 계산: 출력 타임라인 호스트 기준으로 수정
updateTooltipPosition = function (e) {
  const host = document.getElementById('outputTimelineHost');
  if (!host || !tooltip) return;

  const rect = host.getBoundingClientRect();
  if (rect.width <= 0) return;

  const mouseX = e.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, mouseX / rect.width));
  tooltip.style.left = `${pct * 100}%`;
  tooltip.style.transform = 'translateX(-50%)';
};

// 2) 동시 재생 컨트롤 (버튼+유틸)
const controlsContainer = document.querySelector('.controls-container');
let playBothBtn = null;

const _clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0));
const _isFiniteDur = (d) => Number.isFinite(d) && d > 0;

function waitLoadedMeta(video) {
  return new Promise((res) => {
    if (!video || !video.src) return res(); // src 없으면 즉시 통과(히스토리 모드 고려)
    if (video.readyState >= 1 && _isFiniteDur(video.duration)) return res();
    video.addEventListener('loadedmetadata', res, { once: true });
    video.load?.();
  });
}

async function ensureReadyAndSyncTime(targetTime = null) {
  await Promise.all([waitLoadedMeta(inputVideo), waitLoadedMeta(outputVideo)]);
  const t = targetTime ?? (outputVideo.currentTime || inputVideo.currentTime || 0);
  if (Number.isFinite(t)) {
    if (inputVideo?.src) inputVideo.currentTime = t;
    if (outputVideo?.src) outputVideo.currentTime = t;
  }
}

function applyPlayLabel() {
  const playing = outputVideo && !outputVideo.paused && !outputVideo.ended;
  if (playBothBtn) {
    playBothBtn.textContent = playing ? '⏸ 동시일시정지' : '▶ ▶ 동시재생';
    playBothBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
  }
}

async function playBothStart() {
  await ensureReadyAndSyncTime();
  await Promise.allSettled([
    inputVideo?.src ? inputVideo.play() : Promise.resolve(),
    outputVideo?.src ? outputVideo.play() : Promise.resolve()
  ]);
  applyPlayLabel();
}

function playBothPause() {
  if (inputVideo?.src) inputVideo.pause();
  if (outputVideo?.src) outputVideo.pause();
  applyPlayLabel();
}

async function toggleBothPlay() {
  const playing = outputVideo && !outputVideo.paused && !outputVideo.ended;
  if (playing) playBothPause();
  else await playBothStart();
}

// 버튼 삽입
document.addEventListener('DOMContentLoaded', () => {
  if (controlsContainer && !document.getElementById('playBoth')) {
    playBothBtn = document.createElement('button');
    playBothBtn.id = 'playBoth';
    playBothBtn.type = 'button';
    playBothBtn.textContent = '▶ ▶ 동시재생';
    playBothBtn.title = '두 영상 동시 재생/일시정지';
    controlsContainer.appendChild(playBothBtn);

    playBothBtn.addEventListener('click', toggleBothPlay);
    outputVideo.addEventListener('play', applyPlayLabel);
    outputVideo.addEventListener('pause', applyPlayLabel);
    applyPlayLabel();
  }
});

// 3) 타임라인(인풋: 기본 / 아웃풋: 오버레이+툴팁)
let timelineIn = null;
let timelineOut = null;

function fmtTime2(t) {
  if (!Number.isFinite(t)) return '00:00';
  const s = Math.floor(t % 60), m = Math.floor((t / 60) % 60), h = Math.floor(t / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// 인풋용: 진행바+노브+시간
function createTimelineBasic({ host, video, onSeek }) {
  if (!host || !video) return null;

  let root = host.querySelector('.__timeline-root--in');
  if (root) root.remove();

  root = document.createElement('div');
  root.className = '__timeline-root--in';
  Object.assign(root.style, {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '12px',
    padding: '2px 0',
    userSelect: 'none',
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
  Object.assign(timeLabel.style, { flex: '0 0 auto', fontSize: '12px', color: '#111827', whiteSpace: 'nowrap' });
  timeLabel.textContent = '00:00 / 00:00';

  const progress = document.createElement('div');
  Object.assign(progress.style, {
    position: 'absolute', top: '50%', left: '0', height: '6px',
    transform: 'translateY(-50%)', borderRadius: '4px',
    width: '0%', zIndex: '0', pointerEvents: 'none',
  });

  const knob = document.createElement('div');
  Object.assign(knob.style, {
    position: 'absolute', top: '50%', left: '0%', width: '14px', height: '14px',
    transform: 'translate(-50%, -50%)', background: '#fff', border: '2px solid #111827',
    borderRadius: '999px', boxShadow: '0 1px 3px rgba(0,0,0,.2)', pointerEvents: 'auto', zIndex: '2',
  });
  knob.setAttribute('role', 'slider');
  knob.setAttribute('tabindex', '0');
  knob.setAttribute('aria-valuemin', '0');

  track.appendChild(progress);
  track.appendChild(knob);
  root.appendChild(track);
  root.appendChild(timeLabel);
  host.innerHTML = '';
  host.appendChild(root);

  const toTime = (clientX) => {
    const rect = track.getBoundingClientRect();
    const dur = video?.duration || 0;
    if (!_isFiniteDur(dur) || rect.width <= 0) return 0;
    const pct = _clamp01((clientX - rect.left) / rect.width);
    return pct * dur;
  };

  function update(time, dur) {
    const d = _isFiniteDur(dur) ? dur : (video?.duration || 0);
    const t = Math.max(0, Math.min(time || 0, d || 0));
    const pct = d > 0 ? (t / d) : 0;
    knob.style.left = `${pct * 100}%`;
    progress.style.width = `${pct * 100}%`;
    timeLabel.textContent = `${fmtTime2(t)} / ${fmtTime2(d || 0)}`;
    knob.setAttribute('aria-valuenow', String(t.toFixed(3)));
    knob.setAttribute('aria-valuemax', String(d || 0));
  }
  function updateDuration(dur) { update(video?.currentTime || 0, dur); }

  let dragging = false;
  track.addEventListener('pointerdown', async (e) => { dragging = true; track.setPointerCapture?.(e.pointerId); await onSeek(toTime(e.clientX)); });
  window.addEventListener('pointermove', async (e) => { if (dragging) await onSeek(toTime(e.clientX)); });
  window.addEventListener('pointerup',   async (e) => { if (!dragging) return; dragging = false; track.releasePointerCapture?.(e.pointerId); await onSeek(toTime(e.clientX)); });

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

  update(0, video?.duration || 0);
  return { update, updateDuration, track, timeLabel, knob };
}

// 아웃풋용: 오버레이+툴팁 포함
function createTimelineEnhanced({ host, video, ranges }) {
  if (!host || !video) return null;

  let root = host.querySelector('.__timeline-root--out');
  if (root) root.remove();

  root = document.createElement('div');
  root.className = '__timeline-root--out';
  Object.assign(root.style, {
    position: 'relative', display: 'flex', alignItems: 'center', gap: '8px',
    marginTop: '12px', padding: '2px 0', userSelect: 'none', width: '100%',
  });

  const track = document.createElement('div');
  Object.assign(track.style, {
    position: 'relative', flex: '1 1 auto', height: '16px', cursor: 'pointer',
    background: 'linear-gradient(#e5e7eb,#e5e7eb) center/100% 4px no-repeat',
    borderRadius: '6px', overflow: 'visible',
  });

  const timeLabel = document.createElement('div');
  Object.assign(timeLabel.style, { flex: '0 0 auto', fontSize: '12px', color: '#111827', whiteSpace: 'nowrap' });
  timeLabel.textContent = '00:00 / 00:00';

  const progress = document.createElement('div');
  Object.assign(progress.style, {
    position: 'absolute', top: '50%', left: '0', height: '6px',
    transform: 'translateY(-50%)', borderRadius: '4px',
    width: '0%', zIndex: '0', pointerEvents: 'none',
  });

  const rangeLayer = document.createElement('div');
  Object.assign(rangeLayer.style, {
    position: 'absolute', inset: '0 0 0 0', pointerEvents: 'none', overflow: 'visible', zIndex: '1',
  });

  const knob = document.createElement('div');
  Object.assign(knob.style, {
    position: 'absolute', top: '50%', left: '0%', width: '14px', height: '14px',
    transform: 'translate(-50%, -50%)', background: '#fff', border: '2px solid #111827',
    borderRadius: '999px', boxShadow: '0 1px 3px rgba(0,0,0,.2)', pointerEvents: 'auto', zIndex: '2',
  });
  knob.setAttribute('role', 'slider');
  knob.setAttribute('tabindex', '0');
  knob.setAttribute('aria-valuemin', '0');

  track.appendChild(progress);
  track.appendChild(rangeLayer);
  track.appendChild(knob);
  root.appendChild(track);
  root.appendChild(timeLabel);
  host.innerHTML = '';
  host.appendChild(root);

  let rangesRef = Array.isArray(ranges) ? ranges : [];

  function renderRanges(duration) {
    rangeLayer.innerHTML = '';
    if (!_isFiniteDur(duration)) return;
    rangesRef.forEach((r) => {
      const s0 = Number(r.start) || 0, e0 = Number(r.end) || 0;
      const s = Math.max(0, Math.min(s0, duration));
      const e = Math.max(0, Math.min(e0, duration));
      if (e <= s) return;
      const seg = document.createElement('div');
      Object.assign(seg.style, {
        position: 'absolute', top: '50%', height: '6px', transform: 'translateY(-50%)',
        background: 'rgba(255,205,80,.85)', borderRadius: '4px',
        left: `${_clamp01(s / duration) * 100}%`,
        width: `${_clamp01((e - s) / duration) * 100}%`,
      });
      rangeLayer.appendChild(seg);
    });
  }

  function update(time, dur) {
    const d = _isFiniteDur(dur) ? dur : (video?.duration || 0);
    const t = Math.max(0, Math.min(time || 0, d || 0));
    const pct = d > 0 ? (t / d) : 0;
    knob.style.left = `${pct * 100}%`;
    progress.style.width = `${pct * 100}%`;
    timeLabel.textContent = `${fmtTime2(t)} / ${fmtTime2(d || 0)}`;
    knob.setAttribute('aria-valuenow', String(t.toFixed(3)));
    knob.setAttribute('aria-valuemax', String(d || 0));
  }
  function updateDuration(dur) { renderRanges(dur); update(video?.currentTime || 0, dur); }
  function getRangeAt(t)       { return rangesRef.find(r => t >= (Number(r.start)||0) && t <= (Number(r.end)||0)); }
  function setRanges(next)     { rangesRef = Array.isArray(next) ? next : []; renderRanges(video?.duration || 0); }

  const toTime = (clientX) => {
    const rect = track.getBoundingClientRect();
    const dur = video?.duration || 0;
    if (!_isFiniteDur(dur) || rect.width <= 0) return 0;
    const pct = _clamp01((clientX - rect.left) / rect.width);
    return pct * dur;
  };

  async function onSeek(time) {
    const dur = video?.duration || 0;
    const t = Math.max(0, Math.min(time, dur));
    // 두 영상 동기 시크 + 재생
    await ensureReadyAndSyncTime(t);
    await playBothStart();

    // 오버레이 즉시 반영 (overlaySrc 없으면 자연히 투명)
    const activeRange = (Array.isArray(overlayRanges) ? overlayRanges : []).find(r => t >= r.start && t <= r.end);
    if (activeRange && activeRange.overlaySrc) {
      overlayVideo.src = activeRange.overlaySrc;
      overlayVideo.load();
      overlayVideo.onloadeddata = () => {
        overlayVideo.currentTime = t - activeRange.start;
        overlayVideo.style.opacity = '1';
        overlayVideo.play().catch(e => console.warn('Overlay play error:', e));
      };
    } else {
      overlayVideo.pause();
      overlayVideo.src = '';
      overlayVideo.style.opacity = '0';
    }
    update(t, dur);
  }

  let dragging = false;
  track.addEventListener('pointerdown', async (e) => { dragging = true; track.setPointerCapture?.(e.pointerId); await onSeek(toTime(e.clientX)); });
  window.addEventListener('pointermove', async (e) => { if (dragging) await onSeek(toTime(e.clientX)); });
  window.addEventListener('pointerup',   async (e) => { if (!dragging) return; dragging = false; track.releasePointerCapture?.(e.pointerId); await onSeek(toTime(e.clientX)); });
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

  renderRanges(video?.duration || 0);
  update(0, video?.duration || 0);

  return { update, updateDuration, track, timeLabel, knob, getRangeAt, setRanges };
}

// 양쪽 타임라인 세팅
function setupInputTimeline() {
  const host = document.getElementById('inputTimelineHost');
  if (!host || !inputVideo) return;
  timelineIn = createTimelineBasic({
    host,
    video: inputVideo,
    onSeek: async (t) => { await ensureReadyAndSyncTime(t); await playBothStart(); }
  });
  inputVideo.addEventListener('timeupdate', () => timelineIn?.update(inputVideo.currentTime, inputVideo.duration));
  inputVideo.addEventListener('loadedmetadata', () => timelineIn?.updateDuration(inputVideo.duration), { once: true });
}

function setupOutputTimeline() {
  const host = document.getElementById('outputTimelineHost');
  if (!host || !outputVideo) return;
  timelineOut = createTimelineEnhanced({ host, video: outputVideo, ranges: overlayRanges });
  timelineOut?.setRanges(overlayRanges);

  // 툴팁: 오버레이 구간에서만
  const onMove = (e) => {
    if (!timelineOut) return;
    const rect = timelineOut.track.getBoundingClientRect();
    const dur = outputVideo?.duration || 0;
    if (!_isFiniteDur(dur) || rect.width <= 0) { hideTooltip?.(); return; }
    const pct = _clamp01((e.clientX - rect.left) / rect.width);
    const t = pct * dur;
    const range = timelineOut.getRangeAt(t);
    if (!range) { hideTooltip?.(); return; }
    showTooltip?.(e, range);
  };
  timelineOut.track.addEventListener('mousemove', onMove);
  timelineOut.track.addEventListener('mouseleave', () => hideTooltip?.());

  outputVideo.addEventListener('timeupdate', () => timelineOut?.update(outputVideo.currentTime, outputVideo.duration));
  outputVideo.addEventListener('loadedmetadata', () => timelineOut?.updateDuration(outputVideo.duration), { once: true });
}

// 기존 호출을 유지하기 위한 래퍼: setupTimeline() -> 두 타임라인 모두 세팅
const __prevSetupTimeline = (typeof setupTimeline === 'function') ? setupTimeline : null;
setupTimeline = function () {
  // 인풋/아웃풋 둘 다 세팅
  setupInputTimeline();
  setupOutputTimeline();
  // 필요하면 이전 구현을 호출하고 싶을 때:
  // __prevSetupTimeline?.();
};

// 4) 진행 갱신까지 포함하도록 timeupdate 핸들러 오버라이드
const __prevSetupTimeUpdateHandler = (typeof setupTimeUpdateHandler === 'function') ? setupTimeUpdateHandler : null;
setupTimeUpdateHandler = function () {
  if (handlerTimeUpdate) {
    outputVideo.removeEventListener("timeupdate", handlerTimeUpdate);
  }

  handlerTimeUpdate = () => {
    if (pause) return;
    const currentTime = outputVideo.currentTime;

    // 오버레이 동작 (기존 그대로)
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

    // 아웃풋 타임라인 진행 갱신
    if (typeof timelineOut?.update === 'function') {
      timelineOut.update(currentTime, outputVideo.duration);
    }
  };

  outputVideo.addEventListener("timeupdate", handlerTimeUpdate);

  // 필요시 이전 구현 호출 가능
  // __prevSetupTimeUpdateHandler?.();
};

/* ==== UI Enhancement add-on (append-only, backend untouched) ==== */
(() => {
  // 0) 필수 CSS 주입 + host position 보정
  (function ensureTimelineCSS() {
    const ID = 'nova-timeline-style';
    if (!document.getElementById(ID)) {
      const style = document.createElement('style');
      style.id = ID;
      style.textContent = `
        /* 공통 컨테이너는 relative */
        #outputTimelineHost, #inputTimelineHost { position: relative; }

        /* 툴팁 기본 */
        .timeline-tooltip {
          position: absolute;
          bottom: 100%;
          transform: translateX(-50%) translateY(-8px);
          opacity: 0;
          pointer-events: none;
          transition: opacity .15s ease;
          z-index: 10010; /* 트랙보다 높게 */
        }
        .timeline-tooltip.show { opacity: 1; }

        /* 툴팁 내용(안 겹치게 살짝 스타일) */
        .timeline-tooltip .tooltip-content {
          background: rgba(17,24,39,.95);
          color: #fff;
          font-size: 12px;
          line-height: 1.4;
          padding: 8px 10px;
          border-radius: 8px;
          box-shadow: 0 6px 20px rgba(0,0,0,.25);
          white-space: nowrap;
        }

        /* 인풋/아웃풋 트랙의 기본 높이 맞춤 */
        .__timeline-root { z-index: 10000; }

        /* 스플래시 최상위 + 보이기/숨김 안정화 */
       #detect-splash[hidden] { display: none !important; }
       #detect-splash { position: fixed !important; inset: 0; z-index: 20000; pointer-events: auto; }

       /* 스플래시 중엔 타임라인/컨트롤 비활성화 */
       html.is-detecting { cursor: progress; }
       html.is-detecting #inputTimelineHost,
       html.is-detecting #outputTimelineHost,
       html.is-detecting .ui-disabled {
         pointer-events: none !important;
       }
      `;
      document.head.appendChild(style);
    }
    // host 보정
    const outHost = document.getElementById('outputTimelineHost');
    const inHost  = document.getElementById('inputTimelineHost');
    if (outHost && getComputedStyle(outHost).position === 'static') outHost.style.position = 'relative';
    if (inHost  && getComputedStyle(inHost).position  === 'static') inHost.style.position  = 'relative';
  })();

  // 1) 기존 updateTooltipPosition을 "재할당" (재선언 아님)
  if (typeof updateTooltipPosition === 'function') {
    const _prev = updateTooltipPosition;
    updateTooltipPosition = function (e) {
      const host = document.getElementById('outputTimelineHost') || document.querySelector('.timeline-container');
      if (!host || !tooltip) return;
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0) return;
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      tooltip.style.left = `${x * 100}%`;
      tooltip.style.transform = 'translateX(-50%) translateY(-8px)';
    };
  }

  // 2) 공용 타임라인 팩토리 (오버레이/노브/진행바)
  function createTimeline({ host, video, ranges = [], withOverlay = false, barColor = '#94a3b8' }) {
    if (!host || !video) return null;

    // 기존 루트 제거
    const prev = host.querySelector('.__timeline-root');
    if (prev) prev.remove();

    const root = document.createElement('div');
    root.className = '__timeline-root';
    Object.assign(root.style, {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginTop: '12px',
      padding: '2px 0',
      userSelect: 'none',
      pointerEvents: 'auto',
      width: '100%',
      overflow: 'visible',
      zIndex: '10000',
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
    Object.assign(timeLabel.style, { flex: '0 0 auto', fontSize: '12px', color: '#111827', whiteSpace: 'nowrap' });
    timeLabel.textContent = '00:00 / 00:00';

    const progress = document.createElement('div');
    Object.assign(progress.style, {
      position: 'absolute',
      top: '50%',
      left: '0',
      height: '6px',
      transform: 'translateY(-50%)',
      background: barColor,
      borderRadius: '4px',
      width: '0%',
      zIndex: '0',
      pointerEvents: 'none',
    });

    const overlayLayer = document.createElement('div');
    Object.assign(overlayLayer.style, {
      position: 'absolute',
      inset: '0 0 0 0',
      pointerEvents: 'none',
      overflow: 'visible',
      zIndex: '1',
    });

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
      zIndex: '2',
    });
    knob.setAttribute('role', 'slider');
    knob.setAttribute('tabindex', '0');
    knob.setAttribute('aria-valuemin', '0');

    track.appendChild(progress);
    if (withOverlay) track.appendChild(overlayLayer);
    track.appendChild(knob);
    root.appendChild(track);
    root.appendChild(timeLabel);
    host.prepend(root);

    let rangesRef = Array.isArray(ranges) ? ranges : [];

    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const isDur = (d) => Number.isFinite(d) && d > 0;
    const pad2 = (n) => String(n).padStart(2, '0');
    const fmt = (t) => {
      if (!Number.isFinite(t)) return '00:00';
      const s = Math.floor(t % 60), m = Math.floor((t / 60) % 60), h = Math.floor(t / 3600);
      return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
    };

    const renderRanges = (dur) => {
      overlayLayer.innerHTML = '';
      if (!withOverlay || !isDur(dur)) return;
      rangesRef.forEach((r) => {
        const s0 = Number(r.start) || 0, e0 = Number(r.end) || 0;
        const s = Math.max(0, Math.min(s0, dur));
        const e = Math.max(0, Math.min(e0, dur));
        if (e <= s) return;
        const seg = document.createElement('div');
        Object.assign(seg.style, {
          position: 'absolute',
          top: '50%',
          height: '6px',
          transform: 'translateY(-50%)',
          background: 'rgba(255,205,80,.85)',
          borderRadius: '4px',
          left: `${clamp01(s / dur) * 100}%`,
          width: `${clamp01((e - s) / dur) * 100}%`,
        });
        overlayLayer.appendChild(seg);
      });
    };

    const update = (t, d) => {
      const dur = isDur(d) ? d : (video?.duration || 0);
      const cur = Math.max(0, Math.min(t || 0, dur || 0));
      const pct = dur > 0 ? (cur / dur) : 0;
      knob.style.left = `${pct * 100}%`;
      progress.style.width = `${pct * 100}%`;
      timeLabel.textContent = `${fmt(cur)} / ${fmt(dur || 0)}`;
      knob.setAttribute('aria-valuenow', String(cur.toFixed(3)));
      knob.setAttribute('aria-valuemax', String(dur || 0));
    };

    const updateDuration = (dur) => { renderRanges(dur); update(video?.currentTime || 0, dur); };
    const setRanges = (next) => { rangesRef = Array.isArray(next) ? next : []; renderRanges(video?.duration || 0); };
    const getRangeAt = (t) => rangesRef.find(r => t >= (Number(r.start) || 0) && t <= (Number(r.end) || 0));

    const clientXToTime = (clientX) => {
      const rect = track.getBoundingClientRect();
      const dur = video?.duration || 0;
      if (!isDur(dur) || rect.width <= 0) return 0;
      const pct = clamp01((clientX - rect.left) / rect.width);
      return pct * dur;
    };

    const seek = async (time) => {
      const dur = video?.duration || 0;
      const t = Math.max(0, Math.min(time, dur));
      // 클릭 직전 재생 상태를 기억
      const wasPlaying =
        (!!outputVideo && !outputVideo.paused && !outputVideo.ended) ||
        (!!inputVideo  && !inputVideo.paused  && !inputVideo.ended);

      // 두 영상 모두 같은 위치로 이동 (메타 로딩 보장)
      await ensureReadyAndSyncTime(t);

      // 오버레이 즉시 싱크 (상태 유지)
      const activeRange = (Array.isArray(overlayRanges) ? overlayRanges : [])
        .find(r => t >= (Number(r.start)||0) && t <= (Number(r.end)||0));
      if (activeRange && activeRange.overlaySrc) {
        overlayVideo.src = activeRange.overlaySrc;
        overlayVideo.load();
        overlayVideo.onloadeddata = () => {
          overlayVideo.currentTime = t - activeRange.start;
          overlayVideo.style.opacity = '1';
          if (wasPlaying) {
            overlayVideo.play().catch(e => console.warn('Overlay play error:', e));
          } else {
            overlayVideo.pause();
          }
        };
      } else {
        overlayVideo.pause();
        overlayVideo.src = '';
        overlayVideo.style.opacity = '0';
      }

      // 재생 상태 유지
      if (wasPlaying) {
        await playBothStart();
      } else {
        inputVideo.pause();
        outputVideo.pause();
      }

      // 두 타임라인 UI 모두 업데이트
      try {
        timelineIn?.update?.(t, inputVideo?.duration || 0);
        timelineOut?.update?.(t, outputVideo?.duration || 0);
      } catch {}
      update(t, video?.duration || 0);
    };

    // 드래그/클릭
    let dragging = false;
    track.addEventListener('pointerdown', async (e) => {
      dragging = true;
      track.setPointerCapture?.(e.pointerId);
      await seek(clientXToTime(e.clientX));
    });
    window.addEventListener('pointermove', async (e) => {
      if (!dragging) return;
      await seek(clientXToTime(e.clientX));
    });
    window.addEventListener('pointerup', async (e) => {
      if (!dragging) return;
      dragging = false;
      track.releasePointerCapture?.(e.pointerId);
      await seek(clientXToTime(e.clientX));
    });

    // 키보드
    knob.addEventListener('keydown', async (e) => {
      const step = (e.shiftKey ? 2 : 0.5);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dur = video?.duration || 0;
        const cur = video?.currentTime || 0;
        const next = e.key === 'ArrowLeft' ? Math.max(0, cur - step) : Math.min(dur, cur + step);
        await seek(next);
      }
    });

    // 초기가시화
    renderRanges(video?.duration || 0);
    update(0, video?.duration || 0);

    return { track, update, updateDuration, setRanges, getRangeAt };
  }

  // 3) 타임라인 인스턴스
  let timelineIn  = null;
  let timelineOut = null;

  function setupInputTimeline() {
    const host = document.getElementById('inputTimelineHost');
    if (!host || !inputVideo) return;
    timelineIn = createTimeline({ host, video: inputVideo, withOverlay: false, barColor: '#94a3b8' });
    inputVideo.addEventListener('loadedmetadata', () => {
      timelineIn?.updateDuration(inputVideo.duration);
    }, { once: true });
    // 인풋 timeupdate는 별도로 구동
    inputVideo.addEventListener('timeupdate', () => {
      timelineIn?.update(inputVideo.currentTime, inputVideo.duration);
    });
  }

  function setupOutputTimeline() {
    const host = document.getElementById('outputTimelineHost') || document.querySelector('.timeline-container');
    if (!host || !outputVideo) return;
    timelineOut = createTimeline({
      host, video: outputVideo,
      ranges: Array.isArray(overlayRanges) ? overlayRanges : [],
      withOverlay: true, barColor: '#94a3b8'
    });
    timelineOut?.setRanges(overlayRanges);
    outputVideo.addEventListener('loadedmetadata', () => {
      timelineOut?.updateDuration(outputVideo.duration);
    }, { once: true });

    // 툴팁: 오버레이 구간에서만 표시
    const move = (e) => {
      if (!timelineOut || !tooltip) return;
      const rect = timelineOut.track.getBoundingClientRect();
      const dur = outputVideo?.duration || 0;
      if (!(Number.isFinite(dur) && dur > 0) || rect.width <= 0) { hideTooltip?.(); return; }
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const t = pct * dur;
      const range = timelineOut.getRangeAt(t);
      if (!range) { hideTooltip?.(); return; }
      showTooltip?.(e, range);
    };
    timelineOut.track.addEventListener('mousemove', move);
    timelineOut.track.addEventListener('mouseleave', () => hideTooltip?.());
  }

  // 4) 기존 setupTimeline을 "재할당" (재선언 아님)
  const __prevSetupTimeline = (typeof setupTimeline === 'function') ? setupTimeline : null;
  setupTimeline = function () {
    setupInputTimeline();
    setupOutputTimeline();
    // __prevSetupTimeline?.(); // 필요시 호출
  };

  // 5) 기존 setupTimeUpdateHandler도 재할당해 아웃풋/인풋 진행바를 함께 갱신
  const __prevSetupTimeUpdateHandler = (typeof setupTimeUpdateHandler === 'function') ? setupTimeUpdateHandler : null;
  setupTimeUpdateHandler = function () {
    if (handlerTimeUpdate) {
      outputVideo.removeEventListener("timeupdate", handlerTimeUpdate);
    }

    handlerTimeUpdate = () => {
      if (pause) return;
      const currentTime = outputVideo.currentTime;

      // ===== 기존 오버레이 동작 유지 =====
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

      // ===== 진행바 업데이트 =====
      timelineOut?.update(currentTime, outputVideo.duration);
      // 인풋은 자체 timeupdate에서 돈다(중복 방지)
    };

    outputVideo.addEventListener("timeupdate", handlerTimeUpdate);
    // __prevSetupTimeUpdateHandler?.(); // 필요시 호출
  };

  // 6) 동시 재생 버튼이 HTML에 없으면 동적으로 생성 + 핸들러 연결
  /*
  (function ensureSyncButton() {
    let btn = document.getElementById('pauseBtn');
    if (!btn) {
      const holder = document.querySelector('.button-item');
      if (holder) {
        btn = document.createElement('button');
        btn.id = 'pauseBtn';
        btn.textContent = 'PAUSE';
        holder.prepend(btn);
      }
    }
    if (btn) {
      btn.removeEventListener('click', handlerPauseBtn);
      btn.addEventListener('click', handlerPauseBtn);
    }
  })();*/

  // 7) 이미 로딩된 경우 즉시 한 번 세팅 (안전)
  if (outputVideo?.readyState >= 1) {
    setupTimeline();
    setupTimeUpdateHandler();
  }
})();

function applyGuidelinesFromResult(result) {
  const KEYS = ['flash', 'pattern', 'redlight'];

  // 1) guidelineSummary가 있으면 무조건 이것을 우선 사용
  const g = result?.guidelineSummary;
  const hasG = g && (g.flash || g.pattern || g.redlight);

  let status;
  if (hasG) {
    status = {
      flash:    !!g.flash?.violated,
      pattern:  !!g.pattern?.violated,
      redlight: !!g.redlight?.violated,
    };
  } else {
    // 2) 없으면 CV union으로 보조 판단 (이름 매핑 실패하면 안전하게 false)
    const order = Array.isArray(result.cvLabelOrder) ? result.cvLabelOrder : [];
    const union = Array.isArray(result.cvUnionByLabel) ? result.cvUnionByLabel : [];
    const idxByName = Object.fromEntries(order.map((nm, i) => [nm, i]));
    const isOn = (name) => (name in idxByName) && union[idxByName[name]] === 1;

    const flashLike   = ['flash', 'luminance_flash', 'brightness_jump'];
    const patternLike = ['pattern', 'stripe', 'grating'];
    const redLike     = ['redlight', 'solid_red', 'red_dominance'];

    const anyOrNull = (names) => {
      const present = names.filter(n => n in idxByName);
      if (!present.length) return false;       // 매핑 없으면 false (보수적으로)
      return present.some(isOn);
    };

    status = {
      flash:    anyOrNull(flashLike),
      pattern:  anyOrNull(patternLike),
      redlight: anyOrNull(redLike),
    };
  }

  // 3) UI 반영 (fail=빨강, pass=초록)
  for (const key of KEYS) {
    const li = document.querySelector(`.guidelines-list .guidelines-item[data-guideline="${key}"]`);
    if (!li) continue;

    li.classList.remove('pass', 'fail');
    li.classList.add(status[key] ? 'fail' : 'pass'); // true(위반)면 fail

    const icon = li.querySelector('.icon-img');
    if (icon) {
      const ICONS = {
        passed: new URL("../img/check.png", location.href).toString(),
        failed: new URL("../img/delete.png", location.href).toString(),
      };
      icon.hidden = false;
      icon.src = status[key] ? ICONS.failed : ICONS.passed;
      icon.alt = status[key] ? "fail" : "pass";
      li.classList.add('has-icon');
    }
  }
}
