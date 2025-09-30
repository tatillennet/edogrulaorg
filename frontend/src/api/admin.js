// frontend/src/api/admin.js
import axios from "axios";

/* ------------------------------------------------------------------
   Admin API — güvenli path + sağlam fallbacks
   - baseURL kullanmıyoruz (çifte /api önlemek için)
   - Auth: localStorage("adminToken") → Authorization: Bearer
   - CSV export (Blob) + normalize list
   - Retry sadece network/time-outlarda
   - TAM LİSTE İÇİN: listBusinesses({ all:true }) veya limit/status geç
------------------------------------------------------------------- */

// ---------------------------- Path helper ----------------------------
const fixPath = (p = "/") => {
  let s = String(p || "");
  if (/^https?:\/\//i.test(s)) return s;               // mutlak URL ise bırak
  s = s.startsWith("/") ? s : `/${s}`;
  if (/^\/api(\/|$)/i.test(s)) s = s.replace(/^\/api/i, ""); // "/api/..." -> "/..."
  return s;                                             // sonuç: "/admin/..." gibi
};

// -------------------------- Axios instance ---------------------------
export const api = axios.create({
  withCredentials: true,
  timeout: 15000,
});

// İstek interceptor: token ekle + Accept + path düzelt
api.interceptors.request.use((config) => {
  const tok = getAdminToken();
  if (tok) config.headers = { ...(config.headers || {}), Authorization: `Bearer ${tok}` };
  if (!config.headers?.Accept) {
    config.headers = { ...(config.headers || {}), Accept: "application/json" };
  }
  if (typeof config.url === "string") config.url = fixPath(config.url);
  // baseURL boş kalsın (reverse proxy/aynı origin varsayımı)
  config.baseURL = "";
  return config;
});

/* -------------------------- Token utils -------------------------- */
export function getAdminToken() {
  try { return localStorage.getItem("adminToken") || ""; } catch { return ""; }
}
export function setAdminToken(token) {
  try { token ? localStorage.setItem("adminToken", token) : localStorage.removeItem("adminToken"); } catch {}
}
export function clearAdminToken() { setAdminToken(""); }

/* --------------------------- Helpers ----------------------------- */
const cleanParams = (obj = {}) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
};

const saveBlobAs = (blob, name = `export-${Date.now()}.csv`) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

const filenameFromCD = (cd = "") => {
  const m = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(cd || "");
  return decodeURIComponent(m?.[1] || m?.[2] || "").trim() || null;
};

const isCSV = (ct = "") => /text\/csv|application\/(vnd\.ms-excel|csv)/i.test(ct || "");

const normalizeList = (data, fallback = []) => {
  const items =
    data?.items ??
    data?.businesses ??
    data?.requests ??
    data?.data?.items ??
    (Array.isArray(data) ? data : fallback);

  const total =
    data?.total ??
    data?.count ??
    data?.data?.total ??
    (Array.isArray(items) ? items.length : 0);

  const page = data?.page ?? 1;
  const limit = data?.limit ?? data?.perPage ?? (Array.isArray(items) ? items.length : 20);
  const pages = data?.pages ?? Math.max(1, Math.ceil((total || 0) / (limit || 1)));

  return {
    success: !!(data?.success ?? true),
    items: Array.isArray(items) ? items : [],
    total,
    page,
    pages,
    limit,
  };
};

const request = async (cfg, { retry = 0 } = {}) => {
  let lastErr;
  for (let i = 0; i <= retry; i++) {
    try {
      const url = typeof cfg.url === "string" ? fixPath(cfg.url) : cfg.url; // emniyet
      return await api.request({ ...cfg, url, baseURL: "" });
    } catch (e) {
      lastErr = e;
      // HTTP response aldıysak retry yok; yalnız ağ/time-out vs. için tekrar dene
      if (e?.response || i === retry) break;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
};

// .env üzerinden varsayılan limit/status (opsiyonel)
const ENV_DEFAULT_LIMIT = Number(import.meta?.env?.VITE_ADMIN_LIST_LIMIT ?? 1000) || 1000;
const ENV_DEFAULT_STATUS = String(import.meta?.env?.VITE_ADMIN_LIST_STATUS ?? "all").toLowerCase();

/* ============================ Businesses ============================ */
/**
 * List businesses (normalized response)
 * - Tümünü çekmek için: { all:true } veya { mode: 'all' }
 * @param {{
 *   q?:string, page?:number, limit?:number, sort?:string,
 *   fields?:string, from?:string, to?:string, status?:"all"|"approved"|"pending"|"rejected",
 *   verified?:boolean, hidden?:boolean,
 *   format?:"csv", signal?:AbortSignal, retry?:number,
 *   all?:boolean, mode?:"page"|"all", maxPages?:number
 * }} opts
 */
export async function listBusinesses(opts = {}) {
  const {
    q = "",
    page = 1,
    limit = ENV_DEFAULT_LIMIT,            // yüksek default: 1000 (618’i kapsar)
    sort = "-createdAt",
    fields = "",
    from,
    to,
    status = ENV_DEFAULT_STATUS,          // varsayılan: 'all' → filtre yok
    verified,
    hidden,
    format,
    signal,
    retry = 1,

    // all-fetch seçenekleri
    all = false,
    mode,
    maxPages = 200,
  } = opts;

  const params = cleanParams({
    q, page, limit, sort, fields, from, to,
    ...(status ? { status } : {}),
    ...(verified !== undefined ? { verified } : {}),
    ...(hidden !== undefined ? { hidden } : {}),
    ...(format ? { format } : {}),
  });

  /* ---------- CSV export ---------- */
  if (format === "csv") {
    const res = await request(
      { url: "/admin/businesses", method: "GET", params, responseType: "blob", signal },
      { retry }
    );
    const ct = res.headers?.["content-type"] || "";
    if (!isCSV(ct)) {
      try {
        const txt = await res.data.text();
        const json = JSON.parse(txt);
        throw new Error(json?.message || "CSV beklenirken beklenmedik yanıt");
      } catch {
        throw new Error("CSV indirilemedi.");
      }
    }
    const name = filenameFromCD(res.headers?.["content-disposition"]) || "businesses.csv";
    saveBlobAs(res.data, name);
    return { success: true, downloaded: true, filename: name };
  }

  /* ---------- JSON (tek sayfa veya tüm sayfalar) ---------- */
  const fetchModeAll = all || mode === "all";
  if (!fetchModeAll) {
    const res = await request({ url: "/admin/businesses", method: "GET", params, signal }, { retry });
    return normalizeList(res.data, []);
  }

  // → Tüm sayfaları topla
  let curPage = Number(params.page) || 1;
  const perPage = Number(params.limit) || 200;
  const acc = [];
  let total = 0, pages = 1, firstLimit;

  for (let i = 0; i < maxPages; i++) {
    const res = await request(
      { url: "/admin/businesses", method: "GET", params: { ...params, page: curPage }, signal },
      { retry }
    );
    const norm = normalizeList(res.data, []);
    if (i === 0) {
      total = norm.total || 0;
      pages = norm.pages || 1;
      firstLimit = norm.limit || perPage;
    }
    if (Array.isArray(norm.items) && norm.items.length) {
      acc.push(...norm.items);
    }
    // bitecek koşullar
    if (!norm.items?.length || curPage >= pages || acc.length >= total) break;
    // son sayfadaysa kır
    if (norm.items.length < (norm.limit || firstLimit || perPage)) break;
    curPage += 1;
  }

  return {
    success: true,
    items: acc,
    total: total || acc.length,
    page: 1,
    pages,
    limit: firstLimit || perPage,
  };
}

/* ============================== Requests ============================ */
/**
 * List verification requests (normalized)
 */
export async function listRequests(opts = {}) {
  const {
    status = "pending",
    q = "",
    page = 1,
    limit = 20,
    sort = "-createdAt",
    fields = "",
    from,
    to,
    format,
    signal,
    retry = 1,
  } = opts;

  const params = cleanParams({
    q, page, limit, sort, fields, from, to,
    ...(status && status !== "all" ? { status } : {}),
    ...(format ? { format } : {}),
  });

  if (format === "csv") {
    const res = await request(
      { url: "/admin/requests", method: "GET", params, responseType: "blob", signal },
      { retry }
    );
    const ct = res.headers?.["content-type"] || "";
    if (!isCSV(ct)) throw new Error("CSV indirilemedi.");
    const name = filenameFromCD(res.headers?.["content-disposition"]) || "requests.csv";
    saveBlobAs(res.data, name);
    return { success: true, downloaded: true, filename: name };
  }

  const res = await request({ url: "/admin/requests", method: "GET", params, signal }, { retry });
  return normalizeList(res.data, []);
}

/* ------- Request status mutations (with graceful fallbacks) -------- */
export async function approveRequest(id, { signal } = {}) {
  try {
    await request({
      url: `/admin/requests/${encodeURIComponent(id)}/status`,
      method: "PATCH",
      data: { status: "approved" },
      signal,
    });
    return;
  } catch (e) {
    if (e?.response?.status !== 404 && e?.response?.status !== 405) throw e;
  }
  try {
    await request({ url: `/admin/requests/${encodeURIComponent(id)}/approve`, method: "POST", signal });
    return;
  } catch (e) {
    if (e?.response?.status !== 404 && e?.response?.status !== 405) throw e;
  }
  await request({ url: `/apply/${encodeURIComponent(id)}/approve`, method: "POST", signal });
}

export async function rejectRequest(id, rejectReason = "", { signal } = {}) {
  try {
    await request({
      url: `/admin/requests/${encodeURIComponent(id)}/status`,
      method: "PATCH",
      data: { status: "rejected", rejectReason },
      signal,
    });
    return;
  } catch (e) {
    if (e?.response?.status !== 404 && e?.response?.status !== 405) throw e;
  }
  try {
    await request({
      url: `/admin/requests/${encodeURIComponent(id)}/reject`,
      method: "POST",
      data: { rejectReason },
      signal,
    });
    return;
  } catch (e) {
    if (e?.response?.status !== 404 && e?.response?.status !== 405) throw e;
  }
  await request({
    url: `/apply/${encodeURIComponent(id)}/reject`,
    method: "POST",
    data: { rejectReason },
    signal,
  });
}

/**
 * Bulk status
 */
export async function bulkSetRequestStatus(ids = [], status = "approved", rejectReason = "", { signal } = {}) {
  const { data } = await request({
    url: `/admin/requests/bulk-status`,
    method: "PATCH",
    data: { ids, status, rejectReason },
    signal,
  });
  return data; // { success, matched, modified }
}

/* ------------------------- Convenience exports -------------------- */
export async function listBusinessesAll(opts = {}) {
  return listBusinesses({ ...opts, all: true });
}

/* ------------------------- Default export -------------------------- */
export default {
  api,
  getAdminToken,
  setAdminToken,
  clearAdminToken,
  listBusinesses,
  listBusinessesAll,
  listRequests,
  approveRequest,
  rejectRequest,
  bulkSetRequestStatus,
};
