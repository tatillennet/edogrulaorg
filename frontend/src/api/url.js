// frontend/src/api/url.js

/**
 * Küçük ama güçlü path/url yardımcıları.
 * - pathFromRoot(...parts, opts?)  → "/uploads/apply/<id>/01.jpg"
 * - joinPath(base, ...parts)       → "uploads/apply/<id>/01.jpg" (başında slash YOK)
 * - withQuery(path, query)         → "/p?q=1&tags=a&tags=b"
 * - withHash(path, hash)           → "/p?q=1#bölüm"
 * - normalizeDotSegments(path)     → "/a/b/../c" => "/a/c"
 * - stripSearchHash(path)          → "/a?x#y" => "/a"
 * - ensureLeadingSlash(path)       → "a/b" => "/a/b"
 */

const isPlainObject = (v) =>
  Object.prototype.toString.call(v) === "[object Object]";

/**
 * KÖKTEN path üretir, segmentleri güvenle birleştirir, tek bir `/` ile başlatır.
 *
 * @param  {...any} parts  string|number|string[]|undefined karışık parçalar
 * @param {object} [opts]
 * @param {boolean} [opts.trailingSlash=false]  Sonda `/` bıraksın mı?
 * @param {boolean} [opts.normalizeDots=true]   "." ve ".." segmentlerini toparla
 * @param {boolean} [opts.encode=true]          Segmentleri encode et
 * @param {string}  [opts.base=""]              Başına bir base ekle (örn: import.meta.env.BASE_URL)
 * @returns {string}
 */
export function pathFromRoot(...parts) {
  let opts = {};
  if (parts.length && isPlainObject(parts[parts.length - 1])) {
    const cand = parts[parts.length - 1];
    if (
      "trailingSlash" in cand ||
      "normalizeDots" in cand ||
      "encode" in cand ||
      "base" in cand
    ) {
      opts = parts.pop();
    }
  }

  const base = (opts.base ?? "").toString();
  const normalizeDots = opts.normalizeDots !== false; // default: true
  const trailingSlash = !!opts.trailingSlash;
  const encode = opts.encode !== false; // default: true

  const segs = [];
  flatten(parts).forEach((p) => {
    if (p == null) return;
    // string'e çevir, kırp
    let s = String(p).trim();
    if (!s) return;
    // iç slasha göre bölelim ki çift slash oluşmasın
    s.split("/").forEach((piece) => {
      const t = piece.replace(/^\/+|\/+$/g, "");
      if (!t) return;
      segs.push(encode ? encodeURIComponent(t) : t);
    });
  });

  let path = "/" + segs.join("/");

  if (normalizeDots) path = normalizeDotSegments(path);

  // base ekle (çift slashları kırp)
  if (base) {
    const b = ("/" + base).replace(/\/{2,}/g, "/").replace(/\/+$/, "");
    path = (b === "/" ? "" : b) + path;
    path = path.replace(/\/{2,}/g, "/");
  }

  // trailing slash politikası
  if (trailingSlash) {
    if (!path.endsWith("/")) path += "/";
  } else {
    if (path !== "/" && path.endsWith("/")) path = path.slice(0, -1);
  }

  return path;
}

/**
 * Başında slash OLMAYAN relative path birleştirici.
 * İçeride pathFromRoot'u kullanır, sonra lider slash'ı söker.
 */
export function joinPath(base, ...parts) {
  const abs = pathFromRoot("", base, ...parts, {
    encode: true,
    normalizeDots: true,
  });
  return abs === "/" ? "" : abs.replace(/^\/+/, "");
}

/** Path'e query ekler (string, URLSearchParams veya nesne). */
export function withQuery(path, query) {
  if (!query || (typeof query === "string" && !query.trim())) return path;

  let qs = "";
  if (typeof query === "string") {
    qs = query.replace(/^\?/, "");
  } else if (query instanceof URLSearchParams) {
    qs = query.toString();
  } else if (isPlainObject(query)) {
    const sp = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v == null) return;
      if (Array.isArray(v)) v.forEach((vv) => vv != null && sp.append(k, String(vv)));
      else sp.append(k, String(v));
    });
    qs = sp.toString();
  }
  if (!qs) return path;
  return path + (path.includes("?") ? "&" : "?") + qs;
}

/** Path'e hash (#) ekler/değiştirir. */
export function withHash(path, hash) {
  if (!hash && hash !== 0) return path;
  const h = String(hash);
  return path.replace(/#.*$/, "") + (h ? (h.startsWith("#") ? h : "#" + h) : "");
}

/** "/a/b/../c/." → "/a/c" (yalnız path; protokol/host değil) */
export function normalizeDotSegments(path) {
  const parts = String(path).split("/").filter((p) => p.length > 0);
  const out = [];
  for (const p of parts) {
    if (p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return "/" + out.join("/");
}

/** Query ve hash’i kaldırır. */
export function stripSearchHash(path) {
  return String(path).replace(/[?#].*$/, "");
}

/** Başında tek ve sadece tek slash bırakır. */
export function ensureLeadingSlash(path) {
  return "/" + String(path || "").replace(/^\/+/, "");
}

/* iç yardımcı */
function flatten(arr) {
  const out = [];
  arr.forEach((it) => {
    if (Array.isArray(it)) out.push(...flatten(it));
    else out.push(it);
  });
  return out;
}

/* -------------------------
 * Örnekler:
 * pathFromRoot('uploads','apply', id, '01.jpg')      -> '/uploads/apply/<id>/01.jpg'
 * pathFromRoot('/uploads/apply/', id, '/01.jpg')     -> '/uploads/apply/<id>/01.jpg'
 * pathFromRoot('uploads','my folder','a b.png')      -> '/uploads/my%20folder/a%20b.png'
 * pathFromRoot('a','b',{trailingSlash:true})         -> '/a/b/'
 * withQuery('/x', { q:'test', tags:['a','b'] })      -> '/x?q=test&tags=a&tags=b'
 * withHash('/x?y=1','section')                       -> '/x?y=1#section'
 * joinPath('uploads','apply',id,'01.jpg')            -> 'uploads/apply/<id>/01.jpg'
 * ------------------------- */
