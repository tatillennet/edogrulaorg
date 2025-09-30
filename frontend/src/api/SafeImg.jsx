// frontend/src/components/SafeImg.jsx
import React from "react";

/**
 * Güvenli, performanslı <img/> sarmalayıcı.
 *
 * Özellikler:
 * - URL temizleme: çift // gider, javascript: engeli, base ile birleştirme
 * - Hata olduğunda tek seferlik fallback’a geçiş (loop yok)
 * - Lazy-loading + async decoding
 * - Blur-up (düşük çözünürlüklü önizleme) + iskelet shimmer
 * - CSS aspect-ratio ile kutu oranını koruma
 * - object-fit kontrolü, yuvarlak köşe, sınıf/stil geçişi
 *
 * Props:
 *  - src: string (zorunlu değil ama yoksa fallback gösterilir)
 *  - alt: string = ""
 *  - fallback: string = "/placeholder-image.webp"
 *  - base: string (opsiyonel, relatif path’leri bununla birleştirir)
 *  - allowExternal: boolean = true (http/https/data/blob izin ver)
 *  - blurSrc: string (opsiyonel; bulanık arkaplan olarak kullanılır)
 *  - aspectRatio: string | number (örn "16/9" ya da 1.5)
 *  - fit: "cover" | "contain" | "fill" | "none" | "scale-down" = "cover"
 *  - rounded: number | boolean = 12 (true → 12px, false/0 → yok)
 *  - className, style: wrapper’a uygulanır
 *  - imgClassName, imgStyle: direkt <img>’e uygulanır
 *  - loading, decoding: varsayılan "lazy" & "async"
 *  - onLoad, onError: img eventleri
 *  - ...rest: <img>’e iletilir (srcSet, sizes, width, height, ref dahil)
 */
const SafeImg = React.forwardRef(function SafeImg(
  {
    src,
    alt = "",
    fallback = "/placeholder-image.webp",
    base = "",
    allowExternal = true,
    blurSrc,
    aspectRatio,
    fit = "cover",
    rounded = 12,
    className,
    style,
    imgClassName,
    imgStyle,
    loading = "lazy",
    decoding = "async",
    onLoad,
    onError,
    ...rest
  },
  ref
) {
  const safeSrc = React.useMemo(
    () => normalizeSrc(src, { base, allowExternal }),
    [src, base, allowExternal]
  );
  const safeFallback = React.useMemo(
    () => normalizeSrc(fallback, { base, allowExternal: true }),
    [fallback, base]
  );

  const [shownSrc, setShownSrc] = React.useState(safeSrc || safeFallback);
  const [didError, setDidError] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  // src değiştiğinde state’i sıfırla
  React.useEffect(() => {
    setShownSrc(safeSrc || safeFallback);
    setDidError(false);
    setLoaded(false);
  }, [safeSrc, safeFallback]);

  const handleLoad = (e) => {
    setLoaded(true);
    onLoad?.(e);
  };

  const handleError = (e) => {
    if (!didError && shownSrc !== safeFallback) {
      setDidError(true);
      setShownSrc(safeFallback);
    }
    onError?.(e);
  };

  // wrapper stil/atribütleri
  const radius =
    typeof rounded === "boolean" ? (rounded ? 12 : 0) : Number(rounded) || 0;

  const wrapperStyle = {
    position: "relative",
    overflow: "hidden",
    borderRadius: radius,
    ...style,
    // aspect-ratio desteklenirse kullan
    ...(aspectRatio
      ? {
          aspectRatio:
            typeof aspectRatio === "number" ? String(aspectRatio) : aspectRatio,
          width: wrapperHasWidth(style) ? style.width : "100%",
        }
      : {}),
  };

  const imageStyle = {
    width: "100%",
    height: "100%",
    objectFit: fit,
    display: "block",
    transition: "opacity .25s ease",
    opacity: loaded ? 1 : 0,
    ...imgStyle,
  };

  return (
    <div className={className} style={wrapperStyle}>
      {/* Blur-up arkaplan */}
      {blurSrc && !loaded && (
        <img
          src={normalizeSrc(blurSrc, { base, allowExternal: true })}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: fit,
            filter: "blur(14px)",
            transform: "scale(1.06)",
            opacity: 0.6,
          }}
          draggable={false}
        />
      )}

      {/* Shimmer iskelet (yalnızca yüklenene kadar) */}
      {!loaded && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(0,0,0,.05), rgba(0,0,0,.08), rgba(0,0,0,.05))",
            backgroundSize: "200% 100%",
            animation: "safeimg-sh 1.1s linear infinite",
          }}
        />
      )}

      {/* Gerçek görsel */}
      <img
        ref={ref}
        src={shownSrc}
        alt={alt}
        loading={loading}
        decoding={decoding}
        onLoad={handleLoad}
        onError={handleError}
        className={imgClassName}
        style={imageStyle}
        {...rest}
      />

      {/* Keyframes yalnızca bu bileşen kullanırken de çalışsın diye inline ekledik */}
      <style>{`
        @keyframes safeimg-sh { 
          0% { background-position: 0 0 } 
          100% { background-position: 200% 0 } 
        }
      `}</style>
    </div>
  );
});

export default SafeImg;

/* -------------------- yardımcılar -------------------- */

function normalizeSrc(input, { base = "", allowExternal = true } = {}) {
  let s = (input ?? "").toString().trim();
  if (!s) return "";

  // Güvenlik: javascript: vb. engelle
  if (/^javascript:/i.test(s)) return "";

  // Data/blob/http(s) ve protokollü kaynaklara izin (opsiyonel)
  if (
    allowExternal &&
    /^(data:|blob:|https?:\/\/)/i.test(s)
  ) {
    return s;
  }

  // Baştaki fazla slash'ları tek slasha indir
  s = s.replace(/^\/+/, "/");

  // Eğer relatif gibi görünüyorsa başına slash ekle
  if (!s.startsWith("/")) s = "/" + s;

  // Base ile birleştir
  const b = (base || "").toString().trim();
  if (!b) return s;

  // base (örn: https://cdn.domain.com veya /subdir)
  const cleanedBase = b.replace(/\/+$/, ""); // sondaki /'ları at
  return `${cleanedBase}${s}`;
}

function wrapperHasWidth(st) {
  if (!st) return false;
  const w = st.width ?? st.maxWidth ?? st.minWidth;
  return !!w;
}
