// src/lib/asset.js

// API kökünü ve origin'i tespit et (Vite .env)
const RAW_API_ROOT = import.meta.env.VITE_API_ROOT || "";       // ör: http://localhost:5000/api
const RAW_API_URL  = import.meta.env.VITE_API_URL  || "";       // ör: http://localhost:5000

// Backend origin (http://host:port)
const ORIGIN = (
  RAW_API_ROOT
    ? RAW_API_ROOT.replace(/\/api\/?$/, "")
    : (RAW_API_URL || "http://localhost:5000")
).replace(/\/+$/, "");

/** Statik dosya için mutlak URL döndürür. */
export function asset(path = "") {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;       // zaten mutlaksa dokunma
  return path.startsWith("/") ? `${ORIGIN}${path}` : `${ORIGIN}/${path}`;
}

/** Görselleri backend resizer üzerinden almak istersen (cache + dpr) */
export function img(src, {
  w = 1200,
  dpr = Math.min(3, window.devicePixelRatio || 1),
  q = 82,
  fit = "cover",
  fmt = "auto",
} = {}) {
  const clean = /^https?:\/\//i.test(src) ? src.replace(/^https?:\/\/[^/]+/i, "") : src;
  const params = new URLSearchParams({
    src: clean,
    w: String(w),
    dpr: String(dpr),
    q: String(q),
    fit,
    fmt,
  });
  return `${ORIGIN}/api/img?${params}`;
}

// İsteyenler için export
export const ASSET_ORIGIN = ORIGIN;
