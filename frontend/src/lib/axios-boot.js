// src/lib/axios-boot.js
import axios from "axios";

/**
 * VITE_API_URL değerini normalize eder.
 * Kabul: ":5000", "localhost:5000", "http://...", "https://...", ".../api"
 * Çıktı: origin (sondaki /api ve /'lar kırpılır)
 */
function normalizeOrigin(raw) {
  const RAW = String(raw || "").trim();
  let t;
  if (!RAW) t = "http://localhost:5000";
  else if (/^https?:\/\//i.test(RAW)) t = RAW;
  else if (/^:\d+$/.test(RAW)) t = `http://localhost:${RAW.slice(1)}`;
  else t = `http://${RAW}`;
  return t.replace(/\/+$/, "").replace(/\/api$/i, "");
}

// Öncelik: VITE_API_URL (yeni) → VITE_API_ROOT (eski)
const ORIGIN = normalizeOrigin(import.meta.env.VITE_API_URL || import.meta.env.VITE_API_ROOT);
export const API_ROOT = `${ORIGIN}/api`;

// ---- Token helpers ----
const TOKEN_KEY = "token";
const sanitizeToken = (v) =>
  String(v || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/[\r\n\t]/g, "");

export function setAuthToken(token) {
  try {
    const clean = sanitizeToken(token);
    if (clean) window.localStorage?.setItem(TOKEN_KEY, clean);
    else window.localStorage?.removeItem(TOKEN_KEY);
  } catch {}
}

export function clearAuthToken() {
  try { window.localStorage?.removeItem(TOKEN_KEY); } catch {}
}

export function getAuthToken() {
  try {
    const t = window.localStorage?.getItem(TOKEN_KEY);
    return t ? sanitizeToken(t) : "";
  } catch { return ""; }
}

// İsteğe bağlı: 401 olduğunda tetiklenecek callback (örn. logout yönlendirmesi)
let onUnauthorized = null;
export function setOnUnauthorized(fn) {
  onUnauthorized = typeof fn === "function" ? fn : null;
}

/* ---------------- Anti-adblock fallback ----------------
   - /report*     → /rpt*
   - /blacklist*  → /blk*
   - /admin/*     → /_adm/*
   (Artık /api/report, /api/blacklist, /api/admin/* gibi iç segmentleri de yakalar)
--------------------------------------------------------*/
function remapForAdblock(pathLike) {
  const u = String(pathLike || "");
  try {
    if (/^https?:\/\//i.test(u)) {
      const url = new URL(u);
      url.pathname = remapForAdblock(url.pathname);
      // origin + path (+ query + hash) korunur
      return url.origin + url.pathname + url.search + url.hash;
    }
  } catch {}
  let p = u;

  // İçeride herhangi bir yerde /report(…)
  p = p.replace(/\/report(\/|$)/i, "/rpt$1");
  // İçeride herhangi bir yerde /blacklist(…)
  p = p.replace(/\/blacklist(\/|$)/i, "/blk$1");
  // İçeride herhangi bir yerde /admin/ → /_adm/
  p = p.replace(/\/admin\//i, "/_adm/");

  return p;
}

const RETRY_FLAG = "__antiBlockRetried";
const METHODS_WITH_BODY = new Set(["post", "put", "patch", "delete"]);

// Cancel tespiti (Axios v1 & tarayıcı Abort)
const isCancel = (e) =>
  e?.code === "ERR_CANCELED" ||
  e?.name === "CanceledError" ||
  typeof axios.isCancel === "function" && axios.isCancel(e);

/* ---------------- Axios instance ---------------- */
const API = axios.create({
  baseURL: API_ROOT,
  withCredentials: true,
  timeout: 15000,
  headers: {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  },
});

if (import.meta.env.DEV) {
  console.log("[axios-boot] API_ROOT =", API_ROOT);
}

/* ------------ İstek interceptor ------------ */
API.interceptors.request.use((config) => {
  config = config || {};
  config.headers = config.headers || {};

  // Sadece body’li metodlarda ve FormData/Blob/URLSearchParams/ArrayBuffer DEĞİLSE Content-Type ver
  const method = String(config.method || "get").toLowerCase();
  const hasBodyMethod = METHODS_WITH_BODY.has(method);
  const data = config.data;
  const isFormLike =
    data &&
    ((typeof FormData !== "undefined" && data instanceof FormData) ||
     (typeof URLSearchParams !== "undefined" && data instanceof URLSearchParams) ||
     (typeof Blob !== "undefined" && data instanceof Blob) ||
     (typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer));

  if (hasBodyMethod && data != null && !isFormLike && !config.headers["Content-Type"]) {
    config.headers["Content-Type"] = "application/json";
  }

  // localStorage token varsa Authorization ekle
  const tok = getAuthToken();
  if (tok) config.headers.Authorization = `Bearer ${tok}`;

  return config;
});

/* ------------ Yanıt interceptor ------------ */
API.interceptors.response.use(
  (res) => res,
  async (err) => {
    // Abort/ipal edilen istekler: sessizce yut (UI error state tetiklenmesin)
    if (isCancel(err)) {
      return new Promise(() => {}); // unresolved: zinciri bozmadan akışı durdurur
    }

    const status = err?.response?.status;

    // 401 → token temizle + callback
    if (status === 401) {
      clearAuthToken();
      if (onUnauthorized) { try { onUnauthorized(err); } catch {} }
      return Promise.reject(err);
    }

    // Adblock / ağ hatası: response yok, status undefined/0
    const looksBlocked =
      !err?.response &&
      (err?.code === "ERR_BLOCKED_BY_CLIENT" ||
        err?.message?.toLowerCase?.().includes("blocked") ||
        err?.message?.toLowerCase?.().includes("network error") ||
        typeof status === "undefined");

    // Sadece bir kez ve uygun path'lerde retry yap
    const cfg = err?.config || {};
    const urlStr = String(cfg.url || "");

    // Hem relatif hem tam URL'lerde segment eşleşsin
    const isEligiblePath =
      urlStr &&
      /(\/|^)(admin|report|blacklist)(\/|$)/i.test(urlStr);

    if (looksBlocked && isEligiblePath && !cfg[RETRY_FLAG]) {
      cfg[RETRY_FLAG] = true;
      const remapped = remapForAdblock(urlStr);
      if (remapped !== urlStr) {
        if (import.meta.env.DEV) {
          console.debug("[axios-boot] Adblock remap:", urlStr, "→", remapped);
        }
        const newCfg = { ...cfg, url: remapped };
        try { return await API.request(newCfg); }
        catch (e2) { return Promise.reject(e2); }
      }
    }

    return Promise.reject(err);
  }
);

export default API;
export const api = API;
export { ORIGIN as API_ORIGIN };
