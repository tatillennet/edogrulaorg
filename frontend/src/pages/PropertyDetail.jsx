// src/pages/PropertyDetail.jsx
import React from "react";
import { mediaUrl } from "@/utils/mediaUrl"; // alias yoksa "../utils/mediaUrl"

/* ---- Küçük, güvenli <Img/> sarmalayıcı ---- */
function Img({ src, alt = "", ctx, ...props }) {
  const [url, setUrl] = React.useState(mediaUrl(src, ctx));
  React.useEffect(() => setUrl(mediaUrl(src, ctx)), [src, ctx]);
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setUrl("/placeholder-image.webp")}
      style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
      {...props}
    />
  );
}

/* ---- İç gövde: slider + thumbs ---- */
export default function PropertyDetail({ property }) {
  if (!property) return null;

  const applyId =
    property?.applyId || property?.apply?._id || property?.apply?.id || property?.sourceId || property?._id;

  // Görselleri temizle + normalize et
  const gallery = React.useMemo(() => {
    const raw = property?.images || property?.photos || [];
    return raw
      .filter(Boolean)
      .map((p) => mediaUrl(p, { applyId }));
  }, [property, applyId]);

  const cover = mediaUrl(property?.cover || gallery?.[0], { applyId });
  const images = gallery?.length ? gallery : [cover].filter(Boolean);

  // Slider index state
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => setIdx(0), [images]);

  // Komşu görselleri önden yükle (daha akıcı)
  React.useEffect(() => {
    if (!images.length) return;
    const preload = (i) => {
      const img = new Image();
      img.src = images[i];
    };
    preload((idx + 1) % images.length);
    preload((idx - 1 + images.length) % images.length);
  }, [idx, images]);

  const go = React.useCallback(
    (delta) => {
      if (!images.length) return;
      setIdx((cur) => (cur + delta + images.length) % images.length);
    },
    [images.length]
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

  // Touch swipe
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

  const current = images[idx] || "/placeholder-image.webp";

  return (
    <>
      {/* Büyük kapak/slider */}
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
        <a
          href={current}
          target="_blank"
          rel="noopener"
          style={{ display: "block", width: "100%", height: "100%" }}
        >
          <Img src={current} alt={property?.title} ctx={{ applyId }} />
        </a>

        {/* Sol ok */}
        <button
          type="button"
          aria-label="Önceki"
          onClick={(e) => { e.stopPropagation(); go(-1); }}
          style={navBtnStyle("left")}
        >
          ‹
        </button>

        {/* Sağ ok */}
        <button
          type="button"
          aria-label="Sonraki"
          onClick={(e) => { e.stopPropagation(); go(1); }}
          style={navBtnStyle("right")}
        >
          ›
        </button>
      </div>

      {/* Thumbnail’lar */}
      {images.length > 1 && (
        <div style={{ display: "flex", gap: 10, padding: "12px 8px" }}>
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
            >
              <Img src={p} alt={`foto ${i + 1}`} ctx={{ applyId }} />
            </button>
          ))}
        </div>
      )}

      {/* Başlık & özet alanı (örnek) */}
      <div style={{ marginTop: 8 }}>
        <h2 style={{ margin: "8px 0 4px", fontSize: 22, fontWeight: 700 }}>
          {property?.title || property?.name || "İşletme"}
        </h2>
        {/* Diğer detaylar burada… */}
      </div>
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
    zIndex: 5,             // overlay sorunlarını bitirir
    pointerEvents: "auto", // üzerine tıklanabilir
    display: "grid",
    placeItems: "center",
    fontSize: 18,
    lineHeight: 1,
  };
}
