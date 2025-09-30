// src/lib/axios-boot.js
import axios from "axios";

/**
 * VITE_API_URL değerini normalize eder.
 * Kabul eder: ":5000", "localhost:5000", "http://...", "https://...", ".../api"
 * Çıktı daima origin olur (sondaki /api ve /'lar kırpılır).
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
const ORIGIN =
  normalizeOrigin(import.meta.env.VITE_API_URL || import.meta.env.VITE_API_ROOT);

export const API_ROOT = `${ORIGIN}/api`;

const API = axios.create({
  baseURL: API_ROOT,
  withCredentials: true,   // httpOnly cookie'ler için
  timeout: 15000,
  headers: {
    Accept: "application/json",
  },
});

// İstek interceptor: localStorage token varsa Authorization ekle
API.interceptors.request.use((config) => {
  try {
    const tok = window.localStorage?.getItem("token");
    if (tok) config.headers.Authorization = `Bearer ${tok}`;
  } catch {}
  return config;
});

// (opsiyonel) Yanıt interceptor – burada sadece hatayı aynen fırlatıyoruz
API.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(err)
);

export default API;
export { ORIGIN as API_ORIGIN, API_ROOT };
