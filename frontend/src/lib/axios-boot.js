// src/lib/axios-boot.js
import axios from "axios";

/**
 * VITE_API_URL / VITE_API_ROOT değerini normalize eder.
 * Kabul: ":5000", "localhost:5000", "http://...", "https://...", ".../api"
 * Çıktı: origin (sondaki /api ve /'lar kırpılır)
 */
function normalizeOrigin(raw) {
  const RAW = String(raw || "").trim();
  let t;

  if (!RAW) {
    t = "http://localhost:5000";
  } else if (/^https?:\/\//i.test(RAW)) {
    t = RAW;
  } else if (/^:\d+$/.test(RAW)) {
    t = `http://localhost:${RAW.slice(1)}`;
  } else {
    t = `http://${RAW}`;
  }

  return t.replace(/\/+$/, "").replace(/\/api$/i, "");
}

const ORIGIN = normalizeOrigin(
  import.meta.env.VITE_API_URL || import.meta.env.VITE_API_ROOT
);

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
    if (clean) {
      window.localStorage?.setItem(TOKEN_KEY, clean);
    } else {
      window.localStorage?.removeItem(TOKEN_KEY);
    }
  } catch {}
}

export function clearAuthToken() {
  try {
    window.localStorage?.removeItem(TOKEN_KEY);
  } catch {}
}

export function getAuthToken() {
  try {
    const t = window.localStorage?.getItem(TOKEN_KEY);
    return t ? sanitizeToken(t) : "";
  } catch {
    return "";
  }
}

let onUnauthorized = null;
export function setOnUnauthorized(fn) {
  onUnauthorized = typeof fn === "function" ? fn : null;
}

/* ---------------- Anti-adblock fallback ---------------- */
function remapForAdblock(pathLike) {
  const u = String(pathLike || "");

  try {
    if (/^https?:\/\//i.test(u)) {
      const url = new URL(u);
      url.pathname = remapForAdblock(url.pathname);
      return url.origin + url.pathname + url.search + url.hash;
    }
  } catch {}

  let p = u;
  p = p.replace(/\/report(\/|$)/gi, "/rpt$1");
  p = p.replace(/\/blacklist(\/|$)/gi, "/blk$1");
  p = p.replace(/\/admin\//gi, "/_adm/");

  return p;
}

const RETRY_FLAG = "__antiBlockRetried";
const METHODS_WITH_BODY = new Set(["post", "put", "patch", "delete"]);

const isCancel = (e) =>
  e?.code === "ERR_CANCELED" ||
  e?.name === "CanceledError" ||
  (typeof axios.isCancel === "function" && axios.isCancel(e));

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

/* ------------ Request ------------ */
API.interceptors.request.use((config) => {
  const cfg = config || {};
  cfg.headers = cfg.headers || {};

  const method = String(cfg.method || "get").toLowerCase();
  const hasBodyMethod = METHODS_WITH_BODY.has(method);
  const data = cfg.data;

  const isFormLike =
    data &&
    ((typeof FormData !== "undefined" && data instanceof FormData) ||
      (typeof URLSearchParams !== "undefined" &&
        data instanceof URLSearchParams) ||
      (typeof Blob !== "undefined" && data instanceof Blob) ||
      (typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer));

  if (
    hasBodyMethod &&
    data != null &&
    !isFormLike &&
    !cfg.headers["Content-Type"]
  ) {
    cfg.headers["Content-Type"] = "application/json";
  }

  const tok = getAuthToken();
  if (tok) {
    cfg.headers.Authorization = `Bearer ${tok}`;
  }

  return cfg;
});

/* ------------ Response ------------ */
API.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (isCancel(err)) {
      return new Promise(() => {});
    }

    const status = err?.response?.status;

    if (status === 401) {
      clearAuthToken();
      if (onUnauthorized) {
        try {
          onUnauthorized(err);
        } catch {}
      }
      return Promise.reject(err);
    }

    const looksBlocked =
      !err?.response &&
      (err?.code === "ERR_BLOCKED_BY_CLIENT" ||
        err?.message?.toLowerCase?.().includes("blocked") ||
        err?.message?.toLowerCase?.().includes("network error") ||
        typeof status === "undefined");

    const cfg = err?.config || {};
    const urlStr = String(cfg.url || "");
    const isEligiblePath =
      urlStr && /(\/|^)(admin|report|blacklist)(\/|$)/i.test(urlStr);

    if (looksBlocked && isEligiblePath && !cfg[RETRY_FLAG]) {
      cfg[RETRY_FLAG] = true;
      const remapped = remapForAdblock(urlStr);

      if (remapped !== urlStr) {
        if (import.meta.env.DEV) {
          console.debug("[axios-boot] Adblock remap:", urlStr, "→", remapped);
        }
        const newCfg = { ...cfg, url: remapped };
        try {
          return await API.request(newCfg);
        } catch (e2) {
          return Promise.reject(e2);
        }
      }
    }

    return Promise.reject(err);
  }
);

export default API;
export const api = API;
export { ORIGIN as API_ORIGIN };
