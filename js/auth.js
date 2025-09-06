
window.ACCESS_TOKEN = window.ACCESS_TOKEN ?? null;
export const API_BASE = 'http://localhost:8000';
const CSRF_COOKIE_NAME = 'csrf_token';
const REFRESH_URL = `${API_BASE}/nova/auth/refresh`;
const ME_URL = `${API_BASE}/nova/auth/me`; //추후 경로 수정해야됨

function readCookie(name) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function b64urlDecode(str) {
  const pad = str.length % 4 ? 4 - (str.length % 4) : 0;
  return atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad));
}
function parseJwtExp(token) {
  try {
    const payload = JSON.parse(b64urlDecode(token.split('.')[1] || ''));
    return typeof payload.exp === 'number' ? payload.exp : 0;
  } catch { return 0; }
}
function isExpiring(token, bufferSec = 45) {
  const exp = parseJwtExp(token);
  const now = Math.floor(Date.now() / 1000);
  return !exp || (exp - now) <= bufferSec;
}

// ---- single-flight refresh (동시성 락) ----
let refreshPromise = null;
async function doRefreshOnce() {
  if (refreshPromise) return refreshPromise; // 이미 진행 중이면 그거 기다림

  refreshPromise = (async () => {
    const csrf = readCookie(CSRF_COOKIE_NAME);
    if (!csrf) return null; // 로그인 상태 아님
    const resp = await fetch(REFRESH_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrf }
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => ({}));
    return data.access_token || null;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function ensureAccess(bufferSec = 45) {
  // 토큰이 없거나 곧 만료되면 미리 갱신
  if (!window.ACCESS_TOKEN || isExpiring(window.ACCESS_TOKEN, bufferSec)) {
    const newToken = await doRefreshOnce();
    if (newToken) window.ACCESS_TOKEN = newToken;
  }
}

// ---- 401/403에만 재시도 판단 ----
async function shouldRefresh(response) {
  if (![401, 403].includes(response.status)) return false;

  const auth = response.headers.get('www-authenticate');
  if (auth && /error="?invalid_token"?/i.test(auth) && /expired/i.test(auth)) {
    return true;
  }
  try {
    const clone = response.clone();
    const data = await clone.json();
    if (data?.error === 'token_expired') return true;
    if (data?.error === 'token_revoked') {
      window.ACCESS_TOKEN = null;
      alert('세션이 만료되었습니다. 다시 로그인해주세요.');
      window.location.href = '/html/login.html';
      return false;
    }
    if (data?.error === 'token_invalid') return false;
  } catch {}
  return true; // 안전하게 한 번은 시도
}

// ---- authFetch: 사전 갱신 + 필요 시 한 번만 재시도 ----
export async function authFetch(url, options = {}) {
  await ensureAccess(); // 요청 전에 미리 갱신해서 401 왕복 줄이기

  const headers = new Headers(options.headers || {});
  if (window.ACCESS_TOKEN) headers.set('Authorization', `Bearer ${window.ACCESS_TOKEN}`);

  let resp = await fetch(url, { ...options, headers, credentials: 'include' });
  if (![401, 403].includes(resp.status)) return resp;

  // 여기까지 왔으면 만료 가능성 → 단일화된 refresh 시도
  if (!(await shouldRefresh(resp))) return resp;

  const newToken = await doRefreshOnce();
  if (!newToken) return resp;

  const retryHeaders = new Headers(options.headers || {});
  retryHeaders.set('Authorization', `Bearer ${newToken}`);
  return fetch(url, { ...options, headers: retryHeaders, credentials: 'include' });
}

// ---- 첫 로드용 ----
export async function initAuth() {
  if (window.ACCESS_TOKEN) return;
  const t = await doRefreshOnce();
  if (t) window.ACCESS_TOKEN = t;
}

export async function isLoggedIn() {
  await ensureAccess(20);
  if (!window.ACCESS_TOKEN) return false;
  try {
    const resp = await authFetch(ME_URL);
    return resp.ok;
  } catch {
    return false;
  }
}
// ---- lazy email resolver (no initAuth change) ----
let __emailCache = null;           // string | null | undefined(미해결)
let __emailInflight = null;        // Promise<string|null> | null

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function base64UrlDecodeSafe(s) {
  try {
    const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
    return atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad));
  } catch { return null; }
}

function getEmailFromJwtClaims() {
  const t = window.ACCESS_TOKEN;
  if (!t || t.split('.').length < 2) return null;
  const payload = base64UrlDecodeSafe(t.split('.')[1]);
  if (!payload) return null;
  try {
    const p = JSON.parse(payload);
    const candidates = [
      p.email,
      Array.isArray(p.emails) ? p.emails[0] : undefined,
      p.preferred_username,
      p.upn,
      p.login,
    ].filter(Boolean);
    for (const c of candidates) {
      if (c && EMAIL_RE.test(String(c))) return String(c);
    }
  } catch {}
  return null;
}

/**
 * 필요할 때만 이메일을 가져오는 비동기 함수.
 * 순서: CURRENT_USER -> JWT -> /me 호출(1회) -> null
 */
export async function getUserEmailLazy() {
  if (__emailCache !== null) return __emailCache;      // 이미 결정됨(문자열 or null)
  if (typeof window.CURRENT_USER?.email === 'string' && EMAIL_RE.test(window.CURRENT_USER.email)) {
    __emailCache = String(window.CURRENT_USER.email);
    return __emailCache;
  }
  const fromJwt = getEmailFromJwtClaims();
  if (fromJwt) {
    __emailCache = fromJwt;
    return __emailCache;
  }

  // 동시 호출 병합
  if (__emailInflight) return __emailInflight;

  __emailInflight = (async () => {
    try {
      // initAuth는 그대로 두되, 여기서 한 번만 /me 조회
      const resp = await authFetch(`${ME_URL}`, { method: 'GET' });
      if (resp.ok) {
        const me = await resp.json().catch(() => ({}));
        // 클라이언트 전역에도 한 번 저장(선택)
        window.CURRENT_USER = { ...(window.CURRENT_USER || {}), ...me };
        const e = me?.email;
        if (e && EMAIL_RE.test(String(e))) {
          __emailCache = String(e);
          return __emailCache;
        }
      }
    } catch {}
    __emailCache = null; // 실패 기록(불필요한 재시도 방지)
    return null;
  })();

  try {
    return await __emailInflight;
  } finally {
    __emailInflight = null;
  }
}
