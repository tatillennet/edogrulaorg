// src/api/base.js
const RAW = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");

// API_ROOT: daima .../api ile biter. RAW yoksa same-origin "/api"
export const API_ROOT = RAW ? (RAW.endsWith("/api") ? RAW : `${RAW}/api`) : "/api";

/**
 * apiPath(p):
 *  - Mutlak URL ise (http/https) olduğu gibi geri döndürür.
 *  - Onun dışında daima GÖRELİ bir path döndürür ("/admin/...", "/report/..."),
 *    kesinlikle "/api" ile başlamaz (çift /api'yi engeller).
 */
export function apiPath(p = "/") {
  let s = String(p || "").trim();

  // 1) Mutlak URL ise aynen kullan
  if (/^https?:\/\//i.test(s)) return s;

  // 2) Baştaki "/" garanti et
  s = s ? (s.startsWith("/") ? s : `/${s}`) : "/";

  // 3) "/api" önekini sök (çift /api'yi engelle)
  if (s === "/api") s = "/";
  else if (s.startsWith("/api/")) s = s.slice(4); // "/api".length === 4

  // 4) Çift slash normalize (http:// şeması yok, güvenli)
  s = s.replace(/([^:]\/)\/+/g, "$1");

  // Artık s göreli bir path: "/", "/admin/...", "/report/..." vb.
  return s;
}

/**
 * apiUrl(p):
 *  - Mutlak URL ise aynen döner.
 *  - Göreli path ise API_ROOT ile birleştirir → tam URL üretir.
 */
export function apiUrl(p = "/") {
  const path = apiPath(p);
  if (/^https?:\/\//i.test(path)) return path; // zaten mutlak
  const root = API_ROOT.replace(/\/+$/, "");
  return `${root}${path}`;
}
