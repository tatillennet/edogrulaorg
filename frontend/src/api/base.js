// src/api/base.js
import { API_ROOT } from "../lib/axios-boot";

/**
 * apiPath(p):
 *  - Mutlak URL ise (http/https) olduğu gibi döndürür.
 *  - Diğer durumlarda:
 *      * başına "/" ekler
 *      * öndeki "/api" varsa söker (çift /api engeli)
 */
export function apiPath(p = "/") {
  let s = String(p || "").trim();

  // Mutlak URL
  if (/^https?:\/\//i.test(s)) return s;

  // Baştaki "/" garanti
  s = s ? (s.startsWith("/") ? s : `/${s}`) : "/";

  // Öndeki /api'yi temizle
  if (s === "/api") s = "/";
  else if (s.startsWith("/api/")) s = s.slice(4);

  // Çift slash temizle
  s = s.replace(/([^:]\/)\/+/g, "$1");

  return s; // her zaman göreli path ("/admin/...", "/report/..." vs)
}

/**
 * apiUrl(p):
 *  - Mutlak URL ise aynen döner.
 *  - Göreli path ise API_ROOT ile birleştirir.
 */
export function apiUrl(p = "/") {
  const path = apiPath(p);
  if (/^https?:\/\//i.test(path)) return path;
  const root = API_ROOT.replace(/\/+$/, "");
  return `${root}${path}`;
}

// Geriye dönük: API_ROOT'u da dışa ver
export { API_ROOT };
