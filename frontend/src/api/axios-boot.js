// frontend/src/api/axios-boot.js
import axios from "axios";

/**
 * Lightweight axios bootstrap (stable)
 * - baseURL is API root (ends with /api)
 * - Adds Authorization: Bearer <token> from localStorage (authToken or token)
 * - Removes legacy 'x-auth-token' header to avoid CORS preflight rejections
 * - Normalizes URLs to prevent /api/api double prefix
 * - Supports `_quiet: true` on requests to suppress error logs (useful for fallbacks)
 */

const RAW = (import.meta.env?.VITE_API_ROOT || import.meta.env?.VITE_API_URL || "http://localhost:5000/api").trim();
export const API_ROOT = RAW.replace(/\/+$/, "");
console.log("[axios-boot] API_ROOT =", API_ROOT);

export const api = axios.create({
  baseURL: API_ROOT,
  timeout: 20000,
  withCredentials: true,
});

// Request interceptor
api.interceptors.request.use((config) => {
  const token =
    (typeof localStorage !== "undefined" && (localStorage.getItem("authToken") || localStorage.getItem("token"))) ||
    "";

  config.headers = config.headers || {};
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    // DO NOT set custom headers like x-auth-token (causes CORS headaches)
  }

  // If URL is relative, make sure not to duplicate /api
  if (typeof config.url === "string" && !/^https?:\/\//i.test(config.url)) {
    let url = config.url;
    if (/\/api$/i.test(API_ROOT) && url.startsWith("/api/")) {
      url = url.replace(/^\/api\//i, "/");
    }
    // remove accidental double slashes (except protocol)
    url = url.replace(/([^:]\/)\/+/, "$1");
    config.url = url;
  }

  const m = (config.method || "get").toUpperCase();
  const full = /^https?:\/\//i.test(config.url || "")
    ? config.url
    : API_ROOT + (config.url?.startsWith("/") ? "" : "/") + (config.url || "");
  console.debug(`[Axios] → ${m} ${full}`);

  return config;
});

// Response & error interceptor
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const cfg = error?.config || {};
    if (cfg._quiet || cfg.meta?.silentOnError) {
      // For fallback attempts: do not spam console
      return Promise.reject(error);
    }

    try {
      const r = error?.response;
      const m = (cfg.method || "get").toUpperCase();
      const u = /^https?:\/\//i.test(cfg.url || "")
        ? cfg.url
        : API_ROOT + (cfg.url?.startsWith("/") ? "" : "/") + (cfg.url || "");
      // Collapsed log keeps console readable
      console.groupCollapsed(`[Axios][ERR] ${m} ${u}`);
      console.log("status:", r?.status, r?.statusText);
      console.log("data:", r?.data);
      console.log("headers:", r?.headers);
      console.log("request headers:", cfg.headers);
      console.groupEnd();
    } catch {
      // no-op
    }
    return Promise.reject(error);
  }
);

export default api;
