// src/api/base.js
const RAW = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
export const API_ROOT = RAW ? (RAW.endsWith("/api") ? RAW : `${RAW}/api`) : "/api";

// Güvenli path birleştirici → her zaman DOĞRU URL üretir
export function apiPath(p = "/") {
  const s = String(p || "");

  // 1) Mutlak URL ise aynen kullan
  if (/^https?:\/\//i.test(s)) return s;

  // 2) Başa "/" ekle
  let path = s.startsWith("/") ? s : `/${s}`;

  // 3) RAW yoksa same-origin kullan (/api ile)
  if (!RAW) return `${API_ROOT}${path}`;

  // 4) RAW varsa tam mutlak yap (http://host:port/api + path, ama ikinci /api eklemeden)
  if (/^\/api(\/|$)/i.test(path)) {
    // path zaten /api/... → API_ROOT zaten .../api → yalnız host kısmını kullan
    const origin = API_ROOT.replace(/\/api$/i, "");
    return `${origin}${path}`;
  }
  return `${API_ROOT}${path}`; // /admin/... , /report/... vb.
}
