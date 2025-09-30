// src/pages/PropertyDetail.jsx
import React from "react";
import { mediaUrl } from "@/utils/mediaUrl"; // alias yoksa "../utils/mediaUrl"

/* =========================================================================
   Görsel Yardımcıları
   ====================================================================== */

/** /api/img proxy kullanılabilir mi? (backend: server.js -> app.get("/api/img")) */
function canUseImgProxy(u) {
  try {
    const url = String(u || "");
    if (!url) return false;
    // Proxy sadece /uploads/... kaynakları için tasarlanmıştı.
    if (url.startsWith("/uploads/")) return true;
    // https://site.com/uploads/... -> pathname kontrolü
    const parsed = new URL(url, window.location.origin);
    return /^\/uploads\//i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** /api/img URL üretimi (fmt:auto, fit=cover, dpr destekli) */
function imgProxy(src, { w = 1200, dpr = 1, q = 82, fit = "cover", fmt = "auto" } = {}) {
  if (!canUseImgProxy(src)) return src;
  const base = "/api/img";
  const params = new URLSearchParams({
    src: src.startsWith("/uploads/") ? src : new URL(src, window.location.origin).pathname,
    w: String(w),
    dpr: String(dpr),
    q: String(q),
    fmt,
    fit,
  });
  return `${base}?${params.toString()}`;
}

/** Basit eşitleyici (tekrar eden görselleri sil) */
function uniq(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = String(x || "");
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

/** Placeholder */
const FALLBACK = "/placeholder-image.webp";

/* =========================================================================
   Güvenli Img bileşeni (lazy + proxy + srcSet + skeleton)
   ====================================================================== */
function Img({ src, alt = "", ctx, width = 1200, height, fit = "cover", className, style, ...props }) {
  const resolved = mediaUrl(src, ctx);
  const [url, setUrl] = React.useState(resolved || FALLBACK);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    const u = mediaUrl(src, ctx) || FALLBACK;
    setUrl(u);
    setLoaded(false);
  }, [src, ctx]);

  // srcSet (1x/2x/3x) – sadece proxy uygunsa
  const srcSet = React.useMemo(() => {
    if (!canUseImgProxy(url)) return undefined;
    const widths = [width, Math.round(width * 1.5), width * 2].map((w) => Math.max(480, Math.min(w, 2400)));
    const unique = uniq(widths);
    return unique.map((w) => `${imgProxy(url, { w, dpr: 1, fit })} ${w}w`).join(", ");
  }, [url, width, fit]);

  const sizes = "(max-width: 768px) 96vw, (max-width: 1200px) 70vw, 1200px";
  const effectiveSrc = canUseImgProxy(url) ? imgProxy(url, { w: width, dpr: window.devicePixelRatio || 1, fit }) : url;

  const onError = React.useCallback(() => {
    if (url !== FALLBACK) setUrl(FALLBACK);
  }, [url]);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        background: "#f3f4f6",
        overflow: "hidden",
        borderRadius: 12,
        ...style,
      }}
    >
      {/* Skeleton */}
      {!loaded && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(0,0,0,.04), rgba(0,0,0,.06), rgba(0,0,0,.04))",
            backgroundSize: "200% 100%",
            animation: "sweep 1.2s infinite",
          }}
        />
      )}
      <img
        src={effectiveSrc}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={onError}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: fit,
          transition: "opacity .2s ease",
          opacity: loaded ? 1 : 0,
        }}
        {...props}
      />
      <style>{`
        @keyframes sweep { 0%{background-position:0 0} 100%{background-position:-200% 0} }
      `}</style>
    </div>
  );
}

/* =========================================================================
   Lightbox (klavye okları, ESC, swipe, sayaç)
   ====================================================================== */
function Lightbox({ images = [], index = 0, onClose, onStep }) {
  const [i, setI] = React.useState(index);
  const total = images.length;
  const hasImages = total > 0;
  const current = hasImages ? images[i] : FALLBACK;

  const step = React.useCallback(
    (delta) => {
      if (!hasImages) return;
      const next = (i + delta + total) % total;
      setI(next);
      onStep?.(next);
    },
    [i, total, hasImages, onStep]
  );

  // ESC & Oklar
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  // Swipe
  const touch = React.useRef({ x: 0, y: 0 });
  const onTouchStart = (e) => {
    touch.current.x = e.touches[0].clientX;
    touch.current.y = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) step(dx < 0 ? 1 : -1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Büyütülmüş görsel"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.75)",
        backdropFilter: "blur(2px)",
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 12,
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Kapat"
        style={lbCloseBtn}
      >
        ✕
      </button>

      {/* Sayaç */}
      {hasImages && (
        <div style={lbCounter}>
          {i + 1} / {total}
        </div>
      )}

      {/* İçerik */}
      <div style={{ position: "relative", width: "min(96vw, 1200px)", height: "min(86vh, 800px)" }}>
        <Img
          src={current}
          alt={`galeri görseli ${i + 1}`}
          fit="contain"
          width={1200}
          style={{ width: "100%", height: "100%", borderRadius: 8, background: "#111" }}
        />

        {/* Sol/sağ */}
        <button type="button" aria-label="Önceki" onClick={() => step(-1)} style={lbNav("left")}>‹</button>
        <button type="button" aria-label="Sonraki" onClick={() => step(1)} style={lbNav("right")}>›</button>
      </div>
    </div>
  );
}

const lbCloseBtn = {
  position: "fixed",
  top: 14,
  right: 16,
  width: 40,
  height: 40,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.2)",
  background: "rgba(0,0,0,.35)",
  color: "#fff",
  cursor: "pointer",
  zIndex: 1001,
  display: "grid",
  placeItems: "center",
  fontWeight: 900,
};

const lbCounter = {
  position: "fixed",
  top: 18,
  left: "50%",
  transform: "translateX(-50%)",
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,.18)",
  background: "rgba(0,0,0,.35)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 13,
};

function lbNav(side) {
  return {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    [side]: 8,
    width: 44,
    height: 44,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,.25)",
    background: "rgba(0,0,0,.35)",
    color: "#fff",
    cursor: "pointer",
    zIndex: 5,
    display: "grid",
    placeItems: "center",
    fontSize: 24,
    lineHeight: 1,
  };
}

/* =========================================================================
   Ana Bileşen
   ====================================================================== */
export default function PropertyDetail({ property }) {
  if (!property) return null;

  // Uygulama/başvuru kimliği (görsel yolu bağlamı)
  const applyId =
    property?.applyId ||
    property?.apply?._id ||
    property?.apply?.id ||
    property?.sourceId ||
    property?._id;

  // Galeri normalize
  const gallery = React.useMemo(() => {
    const raw =
      property?.images ||
      property?.photos ||
      property?.gallery ||
      [];

    const mapped = (raw || [])
      .filter(Boolean)
      .map((p) => mediaUrl(p, { applyId }));

    // cover’ı başa al, tekrarları temizle
    const coverFirst = [
      mediaUrl(property?.cover || raw?.[0], { applyId }),
      ...mapped,
    ].filter(Boolean);

    return uniq(coverFirst);
  }, [property, applyId]);

  const images = gallery.length ? gallery : [FALLBACK];
  const [idx, setIdx] = React.useState(0);
  const total = images.length;

  React.useEffect(() => setIdx(0), [images]);

  // Komşuları ön-yükle
  React.useEffect(() => {
    if (!total) return;
    const preload = (i) => {
      const img = new Image();
      img.src = canUseImgProxy(images[i])
        ? imgProxy(images[i], { w: 960, dpr: 1 })
        : images[i];
    };
    preload((idx + 1) % total);
    preload((idx - 1 + total) % total);
  }, [idx, images, total]);

  const go = React.useCallback(
    (delta) => setIdx((cur) => (cur + delta + total) % total),
    [total]
  );

  // Klavye okları
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // Swipe
  const touch = React.useRef({ x: 0, y: 0 });
  const onTouchStart = (e) => {
    touch.current.x = e.touches[0].clientX;
    touch.current.y = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) go(dx < 0 ? 1 : -1);
  };

  // Lightbox
  const [openLB, setOpenLB] = React.useState(false);

  const current = images[idx] || FALLBACK;
  const title = property?.title || property?.name || "İşletme";

  return (
    <>
      {/* Hero / Slider */}
      <div
        className="hero"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          position: "relative",
          borderRadius: 16,
          overflow: "hidden",
          background: "#efe9e2",
          height: 420,
        }}
      >
        <button
          type="button"
          onClick={() => setOpenLB(true)}
          aria-label="Görseli büyüt"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 6,
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            background: "rgba(255,255,255,.96)",
            padding: "6px 10px",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Büyüt 🔍
        </button>

        <a
          href={current}
          target="_blank"
          rel="noopener"
          style={{ display: "block", width: "100%", height: "100%" }}
          aria-label="Görseli yeni sekmede aç"
        >
          <Img src={current} alt={title} ctx={{ applyId }} width={1200} />
        </a>

        {/* Sol ok */}
        <button
          type="button"
          aria-label="Önceki"
          onClick={(e) => { e.stopPropagation(); go(-1); }}
          style={navBtnStyle("left")}
          disabled={total <= 1}
        >
          ‹
        </button>

        {/* Sağ ok */}
        <button
          type="button"
          aria-label="Sonraki"
          onClick={(e) => { e.stopPropagation(); go(1); }}
          style={navBtnStyle("right")}
          disabled={total <= 1}
        >
          ›
        </button>

        {/* Sayaç rozeti */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 10,
            right: 12,
            zIndex: 6,
            background: "rgba(255,255,255,.96)",
            border: "1px solid #e5e7eb",
            borderRadius: 999,
            padding: "4px 10px",
            fontWeight: 800,
            color: "#111827",
          }}
        >
          {idx + 1}/{total}
        </div>
      </div>

      {/* Thumbnail’lar */}
      {images.length > 1 && (
        <div style={{ display: "flex", gap: 10, padding: "12px 8px", flexWrap: "wrap" }}>
          {images.map((p, i) => (
            <button
              key={`${p}-${i}`}
              type="button"
              onClick={() => setIdx(i)}
              style={{
                width: 90,
                height: 64,
                borderRadius: 10,
                overflow: "hidden",
                border: i === idx ? "2px solid #1f2937" : "1px solid #e5e7eb",
                padding: 0,
                cursor: "pointer",
                background: "#fff",
              }}
              aria-current={i === idx ? "true" : "false"}
              aria-label={`Görsel ${i + 1}`}
            >
              <Img src={p} alt={`foto ${i + 1}`} ctx={{ applyId }} width={320} />
            </button>
          ))}
        </div>
      )}

      {/* Başlık & özet */}
      <div style={{ marginTop: 8 }}>
        <h2 style={{ margin: "8px 0 4px", fontSize: 22, fontWeight: 700 }}>
          {title}
        </h2>
        {/* Buraya ek meta/özellikler gelebilir */}
      </div>

      {openLB && (
        <Lightbox
          images={images}
          index={idx}
          onClose={() => setOpenLB(false)}
          onStep={(n) => setIdx(n)}
        />
      )}
    </>
  );
}

/* ---- Ortak ok butonu stili ---- */
function navBtnStyle(side) {
  return {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    [side]: 12,
    width: 36,
    height: 36,
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "rgba(255,255,255,0.96)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
    cursor: "pointer",
    zIndex: 5,
    pointerEvents: "auto",
    display: "grid",
    placeItems: "center",
    fontSize: 18,
    lineHeight: 1,
  };
}
