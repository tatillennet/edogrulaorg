// src/components/LightboxGallery.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * LightboxGallery — üretim seviyesi, erişilebilir, hızlı galeri
 *
 * Props:
 *  - imagesAbs: string[]             (zorunlu değil ama boşsa placeholdere düşer)
 *  - title: string                   (alt/caption için kullanılır)
 *  - heroHeight: CSS length          (örn: "clamp(220px, 44vw, 420px)")
 *  - startIndex: number              (varsayılan 0)
 *  - maxThumbs: number               (varsayılan 12)
 *  - loop: boolean                   (sona gelince başa sar; varsayılan true)
 *  - showCounter: boolean            (lightbox'ta 1 / N göstergesi; varsayılan true)
 *  - enableDownload: boolean         (lightbox'ta indir/aç butonları; varsayılan true)
 *  - onIndexChange: (i)=>void
 *  - onOpenChange: (open)=>void
 */
export default function LightboxGallery({
  imagesAbs = [],
  title = "",
  heroHeight = "clamp(220px, 44vw, 420px)",
  startIndex = 0,
  maxThumbs = 12,
  loop = true,
  showCounter = true,
  enableDownload = true,
  onIndexChange,
  onOpenChange,
}) {
  const safeImages = useMemo(
    () => (Array.isArray(imagesAbs) ? imagesAbs.filter(Boolean) : []),
    [imagesAbs]
  );
  const has = safeImages.length > 0;

  const [idx, setIdx] = useState(() =>
    Math.min(Math.max(0, startIndex | 0), Math.max(0, safeImages.length - 1))
  );
  const [open, setOpen] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const heroTouch = useRef({ x: 0, y: 0 });

  const total = safeImages.length;
  const img = has ? safeImages[idx] : null;

  const setIndex = useCallback(
    (i) => {
      const next = loop
        ? (i + total) % total
        : Math.min(Math.max(0, i), total - 1);
      setIdx(next);
      onIndexChange?.(next);
    },
    [loop, total, onIndexChange]
  );

  const go = useCallback(
    (d) => {
      if (!total) return;
      setIndex(idx + d);
    },
    [idx, setIndex, total]
  );

  // Komşu görselleri önden yükle
  useEffect(() => {
    if (!total) return;
    const preload = (i) => {
      const im = new Image();
      im.src = safeImages[((i % total) + total) % total];
    };
    preload(idx + 1);
    preload(idx - 1);
  }, [idx, total, safeImages]);

  // Klavye (lightbox açıkken)
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "Escape") setOpen(false);
      else if (e.key === "Tab") trapFocus(e, lbWrapRef.current);
    };
    document.addEventListener("keydown", onKey, true);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.documentElement.style.overflow = prevOverflow;
    };
  }, [open, go]);

  // Açık/kapalı bildirim
  useEffect(() => {
    onOpenChange?.(open);
    // focusu geri ver
    if (!open && lastFocusRef.current) lastFocusRef.current.focus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Hero swipe
  const onHeroTouchStart = (e) => {
    heroTouch.current.x = e.touches[0].clientX;
    heroTouch.current.y = e.touches[0].clientY;
  };
  const onHeroTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - heroTouch.current.x;
    const dy = e.changedTouches[0].clientY - heroTouch.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) go(dx < 0 ? 1 : -1);
  };

  // Lightbox swipe
  const lbWrapRef = useRef(null);
  const lbTouch = useRef({ x: 0, y: 0 });
  const onLbTouchStart = (e) => {
    lbTouch.current.x = e.touches[0].clientX;
    lbTouch.current.y = e.touches[0].clientY;
  };
  const onLbTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - lbTouch.current.x;
    const dy = e.changedTouches[0].clientY - lbTouch.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) go(dx < 0 ? 1 : -1);
  };

  // Lightbox odak kapanı için son odak
  const lastFocusRef = useRef(null);
  const openLightbox = () => {
    lastFocusRef.current = document.activeElement;
    setOpen(true);
  };

  return (
    <>
      <style>{css}</style>

      {/* HERO */}
      <div
        className="lg-hero"
        style={{ height: heroHeight }}
        onTouchStart={onHeroTouchStart}
        onTouchEnd={onHeroTouchEnd}
      >
        {img ? (
          <>
            {!heroLoaded && <Shimmer />}
            <img
              src={img}
              alt={title || "galeri görseli"}
              className="lg-hero-img"
              loading="eager"
              onLoad={() => setHeroLoaded(true)}
              onError={() => setHeroLoaded(true)}
            />
          </>
        ) : (
          <div className="lg-hero-fallback" />
        )}

        {has && (
          <>
            <button
              className="lg-nav lg-left"
              aria-label="Önceki görsel"
              onClick={() => go(-1)}
              type="button"
            >
              ‹
            </button>
            <button
              className="lg-nav lg-right"
              aria-label="Sonraki görsel"
              onClick={() => go(1)}
              type="button"
            >
              ›
            </button>

            {/* Büyük tıklama alanı: lightbox aç */}
            <button
              className="lg-open"
              aria-label="Tam ekran görüntüle"
              title="Büyüt"
              onClick={openLightbox}
              type="button"
            />
          </>
        )}
      </div>

      {/* THUMB BAR */}
      {has && (
        <div className="lg-thumbs" role="listbox" aria-label="Galeri küçük resimler">
          {safeImages.slice(0, maxThumbs).map((src, i) => (
            <button
              key={src + i}
              role="option"
              aria-selected={i === idx}
              className={`lg-thumb ${i === idx ? "is-active" : ""}`}
              onClick={() => setIndex(i)}
              title={`${i + 1}. görsel`}
              type="button"
            >
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {/* LIGHTBOX */}
      {open && (
        <div
          className="lg-lightbox"
          onClick={() => setOpen(false)}
          onTouchStart={onLbTouchStart}
          onTouchEnd={onLbTouchEnd}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="lg-frame"
            ref={lbWrapRef}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="lg-bar">
              <div className="lg-leftside">
                {showCounter && total > 0 && (
                  <span className="lg-counter">
                    {idx + 1} / {total}
                  </span>
                )}
                {title && <span className="lg-title" title={title}>{title}</span>}
              </div>
              <div className="lg-actions">
                {enableDownload && img && (
                  <>
                    <a
                      href={img}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="lg-btn"
                    >
                      Aç
                    </a>
                    <a href={img} download className="lg-btn">
                      İndir
                    </a>
                  </>
                )}
                <button
                  className="lg-btn"
                  aria-label="Kapat"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  ✕
                </button>
              </div>
            </header>

            <button
              className="lg-nav lg-left lg-onlight"
              onClick={() => go(-1)}
              aria-label="Önceki görsel"
              type="button"
            >
              ‹
            </button>
            <button
              className="lg-nav lg-right lg-onlight"
              onClick={() => go(1)}
              aria-label="Sonraki görsel"
              type="button"
            >
              ›
            </button>

            <div className="lg-stage">
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <img src={img} className="lg-lightbox-img" draggable={false} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* --------- küçük yardımcılar --------- */
function Shimmer() {
  return (
    <div
      className="lg-shimmer"
      aria-hidden="true"
      style={{
        background:
          "linear-gradient(90deg, rgba(0,0,0,.06), rgba(0,0,0,.12), rgba(0,0,0,.06))",
        backgroundSize: "200% 100%",
        animation: "lg-sh 1.15s infinite linear",
      }}
    />
  );
}
function trapFocus(e, root) {
  if (!root) return;
  if (e.key !== "Tab") return;
  const focusables = root.querySelectorAll(
    'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
  );
  const items = Array.from(focusables).filter(
    (el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden")
  );
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const isShift = e.shiftKey;
  if (isShift && document.activeElement === first) {
    last.focus();
    e.preventDefault();
  } else if (!isShift && document.activeElement === last) {
    first.focus();
    e.preventDefault();
  }
}

/* --------- stiller --------- */
const css = `
/* container */
.lg-hero{
  position: relative;
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  background: #efe6d9;
  box-shadow: inset 0 2px 10px rgba(0,0,0,.04);
}
.lg-hero-img{
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  display: block; object-fit: cover;
}
.lg-hero-fallback{ width:100%; height:100%;
  background: linear-gradient(0deg,#eee,#fafafa);
}
.lg-shimmer{
  position:absolute; inset:0; border-radius:inherit;
}
@keyframes lg-sh { 0%{background-position:0 0} 100%{background-position:200% 0} }

/* nav buttons */
.lg-nav{
  position: absolute; top: 50%; transform: translateY(-50%);
  border: 1px solid var(--border);
  background: rgba(255,255,255,.92);
  border-radius: 10px;
  padding: 4px 10px;
  font-size: 22px; line-height: 1;
  cursor: pointer; user-select: none;
}
.lg-left{ left: 8px; }
.lg-right{ right: 8px; }
.lg-open{
  position: absolute; inset: 0;
  background: transparent; border: 0; cursor: zoom-in;
}

/* thumbs */
.lg-thumbs{
  display: flex; gap: 8px; margin-top: 10px;
  overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin;
}
.lg-thumb{
  flex: 0 0 auto;
  width: 88px; height: 62px;
  border-radius: 8px; overflow: hidden;
  background: var(--card); border: 1px solid var(--border);
  padding: 0; cursor: pointer;
}
.lg-thumb.is-active{ outline: 2px solid #111827; outline-offset: -2px; }
.lg-thumb img{ width: 100%; height: 100%; object-fit: cover; display: block; }

/* lightbox */
.lg-lightbox{
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,.88);
  display: grid; place-items: center; padding: 16px;
}
.lg-frame{
  position: relative; width: min(98vw, 1100px);
  max-height: 92vh; display: grid;
  grid-template-rows: auto 1fr; gap: 8px;
}
.lg-bar{
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 6px; border-radius: 10px;
  background: rgba(15, 23, 42, .5); color: #fff;
  backdrop-filter: blur(6px);
}
.lg-leftside{ display:flex; align-items:center; gap:8px; min-width:0 }
.lg-title{ opacity:.95; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:48vw }
.lg-counter{ font-weight:800; padding:2px 6px; background:rgba(255,255,255,.12); border-radius:999px }

.lg-actions{ display:flex; gap:6px; }
.lg-btn{
  border:1px solid rgba(255,255,255,.35);
  background: rgba(255,255,255,.15);
  color:#fff; font-weight:700; padding:6px 10px; border-radius:10px; cursor:pointer;
}
.lg-btn:hover{ background: rgba(255,255,255,.25) }

.lg-onlight{
  background: rgba(255,255,255,.18);
  border-color: rgba(255,255,255,.3);
  color: #fff;
}

.lg-stage{
  position: relative; border-radius: 12px; overflow:hidden;
  background: #000; display:grid; place-items:center;
  height: min(88vh, 70vw);
}
.lg-lightbox-img{
  max-width: 100%; max-height: 100%;
  object-fit: contain; user-select:none;
}

/* responsive */
@media (max-width: 540px){
  .lg-thumb{ width: 72px; height: 50px; }
  .lg-title{ display:none }
}
`;
