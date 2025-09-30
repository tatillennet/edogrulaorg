// frontend/src/components/ProofImages.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * ProofImages
 * - Sunucu klasör yapısı: /uploads/apply/:requestId/:filename
 * - files: ["01.jpg", ...] ya da {path, filename, mime, blur} nesneleri
 *
 * Props:
 *  - requestId: string (gerekli; absolute URL/path kullanımında allowWithoutRequestId=true yapabilirsiniz)
 *  - files: (string[] | {path:string, filename?:string, mime?:string, blur?:boolean}[])
 *  - base: string => default "/uploads/apply"
 *  - max: number => 0 veya undefined ise sınırsız; >0 ise +N daha döşemesi gösterir
 *  - allowWithoutRequestId: boolean => absolute URL/absolute path girdilerine izin verir
 *  - enableLightbox: boolean => varsayılan true
 *  - className: ek sınıflar (Tailwind kullanan projeler için)
 */
export default function ProofImages({
  requestId,
  files = ["01.jpg", "02.jpg", "03.jpg", "04.jpg", "05.jpg"],
  base = "/uploads/apply",
  max = 0,
  allowWithoutRequestId = false,
  enableLightbox = true,
  className = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3",
}) {
  // Güvenlik: requestId yoksa yalnızca absolute src’lere izin ver
  const canRender =
    Boolean(requestId) ||
    (allowWithoutRequestId &&
      (Array.isArray(files) &&
        files.some((f) => {
          const p = typeof f === "string" ? f : f?.path || f?.filename || "";
          return isAbsoluteUrl(p) || p.startsWith("/");
        })));

  if (!canRender) return null;

  const normalized = useMemo(() => {
    const rid = encodeURIComponent(String(requestId || ""));
    const cleanBase = String(base || "/uploads/apply").replace(/\/+$/, "");
    const list = (files || []).map((f, idx) => {
      const path = typeof f === "string" ? f : f?.path || f?.filename || "";
      const name = typeof f === "string" ? f : f?.filename || basename(path) || `file-${idx + 1}`;
      const mime = typeof f === "string" ? guessMime(name) : f?.mime || guessMime(name);
      const blur = typeof f === "object" && !!f?.blur;

      // Absolut URL ise olduğu gibi kullan, "/..." ile başlıyorsa root'a göre kullan,
      // aksi halde /uploads/apply/:rid/:name kuralını uygula.
      let url = path;
      if (isAbsoluteUrl(path)) {
        url = path;
      } else if (path.startsWith("/")) {
        url = path;
      } else {
        // Diz çift slash olmaz
        url = `${cleanBase}/${rid}/${name}`.replace(/\/{2,}/g, "/");
      }

      return {
        key: `${idx}-${name}`,
        url,
        name,
        mime,
        isPdf: /pdf$/i.test(mime) || /\.pdf$/i.test(name),
        blur,
      };
    });

    // Tekilleştir (url bazlı)
    const seen = new Set();
    return list.filter((x) => {
      if (!x.url) return false;
      if (seen.has(x.url)) return false;
      seen.add(x.url);
      return true;
    });
  }, [files, base, requestId]);

  const show = max && max > 0 ? normalized.slice(0, max) : normalized;
  const restCount = Math.max(0, normalized.length - show.length);

  // Lightbox
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openViewer = (idx) => {
    if (!enableLightbox) return;
    if (show[idx]?.isPdf) {
      // PDF’lerde lightbox yerine yeni sekme
      window.open(show[idx].url, "_blank", "noopener,noreferrer");
      return;
    }
    setViewerIndex(idx);
    setViewerOpen(true);
  };

  return (
    <>
      <div className={className}>
        {show.map((it, i) => (
          <Tile
            key={it.key}
            item={it}
            onOpen={() => openViewer(i)}
          />
        ))}

        {restCount > 0 && (
          <button
            type="button"
            onClick={() => openViewer(show.length - 1)}
            title={`${restCount} daha`}
            className="relative w-full h-28 rounded border border-slate-200 bg-white hover:bg-slate-50 transition"
          >
            <div className="absolute inset-0 grid place-items-center text-slate-700 font-bold text-sm">
              +{restCount} daha
            </div>
          </button>
        )}
      </div>

      {enableLightbox && viewerOpen && (
        <Lightbox
          items={show.filter((x) => !x.isPdf)} // pdf’leri viewer’a almayalım
          index={Math.min(viewerIndex, Math.max(0, show.filter((x) => !x.isPdf).length - 1))}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}

/* ======================= Tile (Card) ======================= */
function Tile({ item, onOpen }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (item.isPdf) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative w-full h-28 rounded border border-slate-200 bg-white grid place-items-center hover:bg-slate-50 transition"
        title={item.name}
        aria-label={`${item.name} (PDF) – yeni sekmede aç`}
      >
        <div className="text-3xl">📄</div>
        <span className="sr-only">{item.name}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative w-full h-28 rounded overflow-hidden border border-slate-200 bg-slate-50"
      title={item.name}
      aria-label={`${item.name} görselini büyüt`}
    >
      {!loaded && !failed && <Shimmer />}
      {!failed ? (
        <img
          src={item.url}
          alt={item.name}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setFailed(true);
          }}
          className="w-full h-full object-cover"
          style={{ filter: item.blur ? "blur(6px)" : "none", transition: "filter .2s" }}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-white text-slate-500 text-xs px-2">
          <span>Görsel yüklenemedi</span>
        </div>
      )}

      {/* Hover overlay: Aç & İndir */}
      <div className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 transition bg-black/10" />
      <div className="absolute right-1.5 bottom-1.5 flex gap-1">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 py-1 rounded bg-white/95 border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-white"
          onClick={(e) => e.stopPropagation()}
        >
          Aç
        </a>
        <a
          href={item.url}
          download={item.name}
          className="px-2 py-1 rounded bg-white/95 border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-white"
          onClick={(e) => e.stopPropagation()}
        >
          İndir
        </a>
      </div>
    </button>
  );
}

/* ======================= Lightbox ======================= */
function Lightbox({ items, index = 0, onClose }) {
  const [i, setI] = useState(index);
  const wrapRef = useRef(null);
  const lastFocus = useRef(null);

  useEffect(() => {
    lastFocus.current = document.activeElement;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowRight") setI((n) => (n + 1) % items.length);
      else if (e.key === "ArrowLeft") setI((n) => (n - 1 + items.length) % items.length);
      else if (e.key === "Tab") trapFocus(e, wrapRef.current);
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.documentElement.style.overflow = prev;
      lastFocus.current && lastFocus.current.focus?.();
    };
  }, [items.length, onClose]);

  if (!items.length) return null;
  const cur = items[i];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] bg-black/70 grid place-items-center p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={wrapRef}
        className="relative w-full max-w-5xl max-h-[90vh] bg-white rounded-lg overflow-hidden shadow-2xl"
      >
        {/* header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white/90">
          <div className="text-sm font-semibold truncate">{cur?.name}</div>
          <div className="flex items-center gap-1.5">
            <button
              className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-50"
              onClick={() => setI((n) => (n - 1 + items.length) % items.length)}
              aria-label="Önceki (sol ok)"
            >
              ‹
            </button>
            <button
              className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-50"
              onClick={() => setI((n) => (n + 1) % items.length)}
              aria-label="Sonraki (sağ ok)"
            >
              ›
            </button>
            <a
              href={cur.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-50"
            >
              Aç
            </a>
            <a
              href={cur.url}
              download={cur.name}
              className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-50"
            >
              İndir
            </a>
            <button
              className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-800 text-xs font-semibold hover:bg-slate-50"
              onClick={onClose}
              aria-label="Kapat (Esc)"
              data-autofocus
            >
              ✕
            </button>
          </div>
        </div>

        {/* image */}
        <div className="relative w-full h-[70vh] bg-black flex items-center justify-center">
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <img
            src={cur.url}
            alt=""
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

/* ======================= Bits & utils ======================= */
function Shimmer() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "linear-gradient(90deg, rgba(0,0,0,.04), rgba(0,0,0,.08), rgba(0,0,0,.04))",
        backgroundSize: "200% 100%",
        animation: "pf-sh 1.1s infinite linear",
      }}
    >
      <style>
        {`@keyframes pf-sh {0%{background-position:0 0}100%{background-position:200% 0}}`}
      </style>
    </div>
  );
}

function isAbsoluteUrl(u = "") {
  return /^https?:\/\//i.test(u);
}
function basename(p = "") {
  try {
    const s = String(p);
    const i = s.lastIndexOf("/");
    return i >= 0 ? s.slice(i + 1) : s;
  } catch {
    return p;
  }
}
function guessMime(name = "") {
  const n = name.toLowerCase();
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}
/** Focus trap inside a container */
function trapFocus(e, root) {
  const Q =
    'a[href], button, textarea, input, select, summary, [tabindex]:not([tabindex="-1"])';
  const nodes = Array.from(root.querySelectorAll(Q)).filter(
    (el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden")
  );
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const isShift = e.shiftKey;

  if (isShift && document.activeElement === first) {
    last.focus();
    e.preventDefault();
  } else if (!isShift && document.activeElement === last) {
    first.focus();
    e.preventDefault();
  }
}
