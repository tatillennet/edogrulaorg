// frontend/src/pages/BusinessProfile.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import LightboxGallery from "@/components/LightboxGallery.jsx";

/* ------------ küçük yardımcı: media query dinleyicisi ------------ */
function useMedia(query) {
  const get = () =>
    typeof window !== "undefined" && window.matchMedia(query).matches;
  const [matches, setMatches] = React.useState(get);
  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const on = (e) => setMatches(e.matches);
    try { mq.addEventListener("change", on); } catch { mq.addListener(on); }
    return () => {
      try { mq.removeEventListener("change", on); } catch { mq.removeListener(on); }
    };
  }, [query]);
  return matches;
}

/* --- Google Reviews ayarları (tam yorumlar) --- */
const GOOGLE_REVIEWS_LIMIT = 50; // mümkün olan en fazla yorumu iste

/** Profil sayfası (Pro) */
export default function BusinessProfile() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const loc = useLocation();
  const isMobile = useMedia("(max-width: 960px)");

  /* ---------------- HTTP instance ---------------- */
  const RAW = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
  // VITE_API_URL '/api' ile bitiyorsa köke indir (çift /api hatasını önler)
  const API_ROOT = useMemo(() => RAW.replace(/\/api(?:\/v\d+)?$/i, ""), [RAW]);

  const http = useMemo(() => {
    const inst = axios.create({
      baseURL: API_ROOT || "",
      withCredentials: true,
      timeout: 15000,
    });
    inst.interceptors.request.use((cfg) => {
      const t =
        localStorage.getItem("adminToken") ||
        localStorage.getItem("token") ||
        "";
      if (t) cfg.headers.Authorization = `Bearer ${t}`;
      return cfg;
    });
    return inst;
  }, [API_ROOT]);

  /* ---------------- state ---------------- */
  const [b, setB] = useState(loc.state?.business || null);
  const [loading, setLoading] = useState(!b);
  const [err, setErr] = useState("");
  const ctrlRef = useRef(null);

  /* ---------------- fetch business (with cache) ---------------- */
  useEffect(() => {
    let mounted = true;
    const CACHE_KEY = `bizcache:${slug}`;
    if (!b) {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setB(parsed);
          setLoading(false);
        } catch {}
      }
    }
    if (b) return;

    (async () => {
      try {
        setLoading(true);
        setErr("");
        ctrlRef.current?.abort?.();
        ctrlRef.current = new AbortController();

        const candidates = [
          `/api/businesses/by-slug/${encodeURIComponent(slug)}`,
          `/api/businesses/${encodeURIComponent(slug)}`,
          `/api/businesses/handle/${encodeURIComponent(slug)}`,
          `/api/businesses/search?q=${encodeURIComponent(slug)}`,
        ];
        for (const path of candidates) {
          try {
            const { data } = await http.get(path, {
              signal: ctrlRef.current.signal,
            });
            const biz =
              data?.business ||
              data?.result ||
              data?.data?.business ||
              data?.businesses?.[0] ||
              (data?._id ? data : null);
            if (biz) {
              if (!mounted) return;
              setB(biz);
              sessionStorage.setItem(CACHE_KEY, JSON.stringify(biz));
              setLoading(false);
              return;
            }
            if (data?.status === "not_found") break;
          } catch {}
        }
        if (mounted) {
          setErr("İşletme bulunamadı.");
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setErr("Bir hata oluştu.");
          setLoading(false);
        }
      }
    })();

    return () => {
      ctrlRef.current?.abort?.();
      mounted = false;
    };
  }, [slug, http, b]);

  /* ---------------- türev alanlar ---------------- */
  const name = b?.name || slugToTitle(slug);
  const city = b?.city || b?.location?.city;
  const district = b?.district || b?.location?.district;
  const phones = useMemo(
    () => (Array.isArray(b?.phones) ? b.phones : b?.phone ? [b.phone] : []),
    [b]
  );
  const instagram =
    b?.instagram || b?.instagramUsername || b?.handle || null;
  const instagramUrl =
    b?.instagramUrl ||
    (instagram ? `https://instagram.com/${trimAt(instagram)}` : null);
  const website = b?.website || b?.site || null;
  const address =
    b?.address || b?.fullAddress || b?.location?.address || null;
  const coords = {
    lat: b?.location?.lat ?? b?.lat,
    lng: b?.location?.lng ?? b?.lng,
  };

  // Görseller (absolute, güçlü normalizasyon)
  const imagesAbs = useMemo(() => {
    const out = new Set();
    const origin =
      typeof window !== "undefined"
        ? window.location.origin.replace(/\/+$/, "")
        : "";
    const base = API_ROOT || origin;

    const resolve = (s) => {
      if (!s) return;
      let v = String(s).trim();
      if (!v) return;

      if (/^\/\//.test(v)) {
        out.add(
          (typeof window !== "undefined"
            ? window.location.protocol
            : "https:") + v
        );
        return;
      }
      if (/^https?:\/\//i.test(v)) {
        out.add(v);
        return;
      }
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) return parsed.forEach(resolve);
      } catch {}

      if (/[,\n;]\s*/.test(v)) {
        v.split(/[,\n;]\s*/).map((x) => x.trim()).filter(Boolean).forEach(resolve);
        return;
      }

      if (v.startsWith("/")) {
        out.add(base + v);
        return;
      }
      if (/^\.\.?\//.test(v)) {
        try {
          out.add(new URL(v, base + "/").toString());
          return;
        } catch {}
      }

      if (/^(uploads?|files?|images?|public\/uploads)\b/i.test(v)) {
        out.add(`${base}/${v.replace(/^\/+/, "")}`);
        return;
      }

      try {
        out.add(new URL(v, base + "/").toString());
      } catch {
        out.add(v);
      }
    };

    const push = (val) => {
      if (!val) return;
      if (Array.isArray(val)) return val.forEach(push);
      if (typeof val === "string") return resolve(val);
      if (typeof val === "object") {
        const candKeys = ["url", "src", "path", "image", "srcUrl", "secure_url"];
        for (const k of candKeys) if (val[k]) resolve(val[k]);
        if (val.items) push(val.items);
      }
    };

    push(b?.galleryAbs);
    push(b?.photos);
    push(b?.images);
    push(b?.gallery);
    push(b?.media);
    push(b?.pictures);
    push(b?.albums);
    push(b?.cover);
    push(b?.coverUrl);
    push(b?.image);
    push(b?.imageUrl);
    push(b?.featuredImage);

    return Array.from(out);
  }, [b, API_ROOT]);

  /* ---------------- rezervasyon paneli ---------------- */
  const qs = new URLSearchParams(loc.search);
  const [range, setRange] = useState({
    start: qs.get("start") || "",
    end: qs.get("end") || "",
  });
  const [adults, setAdults] = useState(qs.get("adults") || "");
  const [children, setChildren] = useState(qs.get("children") || "");
  const [childAges, setChildAges] = useState([]);

  const adultsNum = Number(adults) || 0;
  const childrenNum = Number(children) || 0;

  useEffect(() => {
    const n = Number(children) || 0;
    setChildAges((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push("");
      return next;
    });
  }, [children]);

  const nights = useMemo(() => {
    const s = toDate(range.start), e = toDate(range.end);
    if (!s || !e) return 0;
    const diff = Math.ceil((e - s) / 86400000);
    return Math.max(1, diff);
  }, [range]);

  const canReserve = Boolean(range.start && range.end && adultsNum >= 1);

  const reserve = () => {
    if (!canReserve) return;
    const s = fmtTR(range.start) || "belirtilmedi";
    const e = fmtTR(range.end || range.start) || "belirtilmedi";
    const msg =
      `Merhaba, size E-Doğrula üzerinden ulaşıyorum` +
      `\nİşletme: ${name}` +
      `\nGiriş: ${s}` +
      `\nÇıkış: ${e}` +
      `\nYetişkin: ${adultsNum}` +
      `\nÇocuk: ${childrenNum}` +
      (childrenNum > 0
        ? `\n${childAges.map((age, i) => `${i + 1}. çocuk yaşı: ${age || "belirtilmedi"}`).join("\n")}`
        : "") +
      `\nRef: ${window.location.origin}/isletme/${encodeURIComponent(slug)}`;

    const utm = `?utm_source=edogrula&utm_medium=profile&utm_campaign=wa_booking&biz=${encodeURIComponent(slug)}`;

    const wa = phones[0] ? toWa(phones[0], msg) : null;
    const link =
      (wa && wa + "&" + utm.slice(1)) ||
      (b?.bookingUrl ? addUtm(b.bookingUrl, utm) : null) ||
      (website ? addUtm(toHttps(website), utm) : null) ||
      (instagramUrl ? addUtm(instagramUrl, utm) : null) ||
      (phones[0] ? `tel:${phones[0]}` : null);

    if (link) window.open(link, "_blank", "noopener,noreferrer");
  };

  /* ---------------- Yorumlar (Google — tamamı) ---------------- */
  const [gReviews, setGReviews] = useState({ rating: null, count: 0, reviews: [], _mode: undefined });
  const [revLoading, setRevLoading] = useState(false);
  const [reviewMode, setReviewMode] = useState("scroll"); // "scroll" | "list"

  useEffect(() => {
    if (!b) return;
    let mounted = true;

    (async () => {
      try {
        setRevLoading(true);

        const reqs = [];
        if (b?.googlePlaceId) {
          reqs.push(
            http.get("/api/google/reviews", {
              params: { placeId: b.googlePlaceId, limit: GOOGLE_REVIEWS_LIMIT },
            })
          );
        }
        reqs.push(
          http.get("/api/google/reviews/search", {
            params: { query: `${name} ${city || ""}`.trim(), limit: GOOGLE_REVIEWS_LIMIT },
          })
        );

        for (const req of reqs) {
          try {
            const { data } = await req;
            const got = normalizeGoogleReviews(data);
            if (got && mounted) {
              setGReviews(got);
              break;
            }
          } catch {
            // sıradakini dene
          }
        }
      } finally {
        if (mounted) setRevLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [b, http, name, city]);

  /* ---------------- SEO ---------------- */
  useEffect(() => {
    if (!name) return;
    document.title = `${name} · E-Doğrula`;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name,
      address: address ? { "@type": "PostalAddress", streetAddress: address, addressLocality: city || undefined } : undefined,
      url: window.location.href,
      telephone: phones[0] || undefined,
      sameAs: [instagramUrl, website].filter(Boolean),
      aggregateRating:
        Number.isFinite(gReviews.rating) && gReviews.count
          ? { "@type": "AggregateRating", ratingValue: round1(gReviews.rating), reviewCount: gReviews.count }
          : undefined,
      image: imagesAbs?.slice?.(0, 5),
      geo:
        Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
          ? { "@type": "GeoCoordinates", latitude: coords.lat, longitude: coords.lng }
          : undefined,
    };
    script.text = JSON.stringify(jsonLd);
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, [name, address, city, phones, instagramUrl, website, imagesAbs, gReviews, coords]);

  /* ---------------- LOGO (public'ten, çoklu fallback) ---------------- */
  const baseUrl = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "/");
  const logoCandidates = [
    import.meta.env.VITE_LOGO_URL || "",
    `${baseUrl}logo-edogrula.png`,
    `${baseUrl}logo-edogrula.svg`,
    `${baseUrl}logo.png`,
    "/logo-edogrula.png",
    "/logo.png",
  ].filter(Boolean);
  const [logoSrc, setLogoSrc] = useState(logoCandidates[0]);
  const onLogoError = () => {
    setLogoSrc((prev) => {
      const i = logoCandidates.indexOf(prev);
      return i >= 0 && i < logoCandidates.length - 1
        ? logoCandidates[i + 1]
        : prev;
    });
  };

  return (
    <div style={st.page}>
      <style>{globalCSS}</style>

      {/* ---------- HEADER (ultra pro) ---------- */}
      <header style={st.head}>
        <button className="ghost" onClick={() => navigate(-1)} aria-label="Geri">
          ← Geri
        </button>

        <div style={{ flex: 1, textAlign: "center" }}>
          <a
            href="/"
            aria-label="E-Doğrula Ana sayfa"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
            }}
          >
            <img
              src={logoSrc}
              onError={onLogoError}
              alt="E-Doğrula"
              style={{
                height: isMobile ? 40 : 56,
                objectFit: "contain",
                aspectRatio: "auto",
                filter: "drop-shadow(0 1px 1px rgba(0,0,0,.08))",
              }}
            />
          </a>
        </div>

        <div style={{ width: 48 }} />
      </header>

      <main style={st.container}>
        <div style={st.breadcrumb}>
          <a href="/" className="lnk">Ana sayfa</a>
          <span> / </span>
          <span>{name.toLowerCase()}</span>
        </div>

        <div style={{ ...st.grid, gridTemplateColumns: isMobile ? "1fr" : "1fr 360px", gap: isMobile ? 14 : 22 }}>
          {/* SOL */}
          <section style={st.left}>
            {/* HERO/GALERİ — sabit oranlı ultra pro görünüm */}
            <HeroGallery imagesAbs={imagesAbs} title={name} isMobile={isMobile} />

            <div style={st.card}>
              <h1 style={st.title}>{name}</h1>

              {/* Aksiyonlar */}
              <div style={{ display: "flex", gap: 8, padding: "0 14px 8px", flexWrap: "wrap" }}>
                <button className="ghost" onClick={() => shareBiz({ name, slug })} title="Paylaş">
                  <i className="fa-solid fa-link" />&nbsp; Paylaş
                </button>

                {/* Yol Tarifi Al */}
                <a
                  className="ghost"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
                    ? `${coords.lat},${coords.lng}`
                    : encodeURIComponent(address || name)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  title="Yol tarifi al"
                >
                  <i className="fa-solid fa-location-arrow" />&nbsp; Yol Tarifi Al
                </a>

                {address && (
                  <a
                    className="ghost"
                    href={toMapUrl(address, coords)}
                    target="_blank"
                    rel="noreferrer noopener"
                    title="Haritada aç"
                  >
                    <i className="fa-regular fa-map" />&nbsp; Harita
                  </a>
                )}
                {phones[0] && (
                  <a className="ghost" href={`tel:${phones[0]}`} title="Ara">
                    <i className="fa-solid fa-phone-volume" />&nbsp; Tel
                  </a>
                )}
              </div>

              <div style={st.dots}>{Array.from({ length: 32 }).map((_, i) => <i key={i} />)}</div>

              {/* Açıklama */}
              <div style={st.desc}>
                <div style={st.descTitle}>Açıklama</div>
                <p style={st.descText}>{b?.description || b?.about || b?.summary || "Bu işletme henüz açıklama eklemedi."}</p>
              </div>
            </div>

            {/* HARİTA (varsa) */}
            {(Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) && (
              <div style={{ ...st.card, marginTop: 14, padding: 12 }}>
                <h2 style={{ ...st.descTitle, padding: "0 2px 8px" }}>Konum</h2>
                <MapDisplay
                  apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                  yandexKey={import.meta.env.VITE_YANDEX_MAPS_API_KEY}
                  lat={coords.lat}
                  lng={coords.lng}
                  businessName={name}
                  address={address}
                />
              </div>
            )}

            {/* GOOGLE YORUMLAR — TAMAMI */}
            <div style={{ ...st.card, marginTop: 14, padding: 14 }}>
              <GoogleHeaderBar
                rating={gReviews.rating}
                count={gReviews.count || (gReviews.reviews?.length ?? 0)}
                businessName={name}
                city={city}
                placeId={b?.googlePlaceId}
                mode={reviewMode}
                backendMode={gReviews._mode}
                onToggleMode={() => setReviewMode(m => (m === "scroll" ? "list" : "scroll"))}
              />
              {revLoading ? (
                <div className="skl" />
              ) : (
                <GoogleReviewsArea reviews={gReviews.reviews} mode={reviewMode} />
              )}
            </div>
          </section>

          {/* SAĞ */}
          <aside style={{ ...st.right, position: isMobile ? "relative" : "sticky", top: isMobile ?  "auto" : 80 }}>
            <div style={st.box}>
              <div style={{ margin: "4px 0 10px" }}>
                <label style={st.label}>Tarih</label>
                <DateRangePicker value={range} onChange={setRange} />
                {!!nights && <div style={st.nightsText}>{nights} gece</div>}
              </div>

              <div style={st.row2}>
                <div style={st.inputWrap}>
                  <label style={st.label}>Yetişkin</label>
                  <input
                    type="number" inputMode="numeric" min={0} placeholder="0"
                    value={adults}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const val = raw === "" ? "" : String(Math.max(0, parseInt(raw, 10) || 0));
                      setAdults(val);
                    }}
                    style={st.sel}
                  />
                </div>
                <div style={st.inputWrap}>
                  <label style={st.label}>Çocuk</label>
                  <input
                    type="number" inputMode="numeric" min={0} placeholder="0"
                    value={children}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const val = raw === "" ? "" : String(Math.max(0, parseInt(raw, 10) || 0));
                      setChildren(val);
                    }}
                    style={st.sel}
                  />
                </div>
              </div>

              <button
                className="btn"
                style={{ ...st.reserveBtn, opacity: canReserve ? 1 : 0.6, cursor: canReserve ? "pointer" : "not-allowed" }}
                onClick={reserve}
                disabled={!canReserve}
              >
                Rezervasyon Talebi Gönder
              </button>
            </div>

            {/* İşletme Bilgileri */}
            <section style={st.infoCard}>
              <header style={st.infoHead}>İşletme Bilgileri</header>
              <div style={st.infoRow}>
                <i className="fa-solid fa-phone-volume" />&nbsp;
                {phones[0] ? <a href={`tel:${phones[0]}`} className="lnk">{prettyPhone(phones[0])}</a> : "—"}
              </div>
              <div style={st.infoRow}>
                <i className="fa-brands fa-instagram" />&nbsp;
                {instagram ? (
                  <a href={instagramUrl} className="lnk" target="_blank" rel="noreferrer noopener">
                    @{trimAt(instagram)}
                  </a>
                ) : "—"}
              </div>
              <div style={st.infoRow}>
                <i className="fa-regular fa-globe" />&nbsp;
                {website ? (
                  <a href={toHttps(website)} className="lnk" target="_blank" rel="noreferrer noopener">
                    {website}
                  </a>
                ) : "—"}
              </div>
              <div style={st.infoRow}><i className="fa-solid fa-location-dot" />&nbsp; {address || "—"}</div>
            </section>
          </aside>
        </div>

        {loading && <Loader />}
        {!loading && err && <div style={st.err}>{err}</div>}
      </main>
    </div>
  );
}

/* ---------------- HERO / GALLERY (oran sabitleme + cover) ---------------- */
function HeroGallery({ imagesAbs = [], title, isMobile }) {
  const has = imagesAbs.length > 0;
  // oran: masaüstü 16:9, mobil 4:3
  const ratio = isMobile ? "4 / 3" : "16 / 9";
  const Hmin = isMobile ? 200 : 260;
  const Hmax = isMobile ? 320 : 420;
  return (
    <div
      className="hero"
      style={{
        position: "relative",
        borderRadius: "var(--r-lg)",
        border: "1px solid var(--border)",
        overflow: "hidden",
        background: "#efe6d9",
        aspectRatio: ratio,
        minHeight: Hmin,
        maxHeight: Hmax,
      }}
    >
      {has ? (
        <div style={{ height: "100%" }}>
          <LightboxGallery imagesAbs={imagesAbs} title={title} />
        </div>
      ) : (
        <div style={{ height: "100%" }} />
      )}
    </div>
  );
}

/* ---------------- HARİTA ---------------- */
function MapDisplay({ apiKey, yandexKey, lat, lng, businessName, address }) {
  const mapRef = useRef(null);
  const [provider, setProvider] = useState(apiKey ? "google" : "yandex");

  useEffect(() => { setProvider(apiKey ? "google" : "yandex"); }, [apiKey]);

  useEffect(() => {
    if (!mapRef.current || !lat || !lng) return;

    if (provider === "google") {
      if (window.google?.maps) { initGoogle(); return; }
      if (!document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]')) {
        const s = document.createElement("script");
        s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker`;
        s.async = true; s.defer = true; s.onload = initGoogle;
        document.head.appendChild(s);
      } else {
        initGoogle();
      }
    } else {
      if (window.ymaps && window.ymaps.ready) {
        window.ymaps.ready(initYandex);
      } else if (!document.querySelector('script[src*="api-maps.yandex.ru"]')) {
        const s = document.createElement("script");
        const keyQ = yandexKey ? `&apikey=${yandexKey}` : "";
        s.src = `https://api-maps.yandex.ru/2.1/?lang=tr_TR${keyQ}`;
        s.async = true; s.defer = true; s.onload = () => window.ymaps.ready(initYandex);
        document.head.appendChild(s);
      }
    }

    function initGoogle() {
      const position = { lat, lng };
      const map = new window.google.maps.Map(mapRef.current, {
        center: position,
        zoom: 16,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "cooperative",
      });
      const infoWindow = new window.google.maps.InfoWindow({
        content: `
          <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${escapeHtml(businessName)}</div>
          <div>${escapeHtml(address || "")}</div>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank" rel="noopener noreferrer" style="margin-top:8px;display:inline-block;">Yol Tarifi Al</a>
        `,
      });
      const marker = new window.google.maps.marker.AdvancedMarkerElement({ position, map, title: businessName });
      infoWindow.open(map, marker);
      marker.addListener("gmp-click", () => infoWindow.open(map, marker));
    }

    function initYandex() {
      const ymaps = window.ymaps;
      const map = new ymaps.Map(mapRef.current, {
        center: [lat, lng],
        zoom: 16,
        controls: ["zoomControl"],
      }, { suppressMapOpenBlock: true });
      const placemark = new ymaps.Placemark([lat, lng], {
        balloonContentHeader: `<strong>${escapeHtml(businessName)}</strong>`,
        balloonContentBody: `<div>${escapeHtml(address || "")}</div>`,
        balloonContentFooter: `<a href="https://yandex.com.tr/harita?whatshere[point]=${lng},${lat}&whatshere[zoom]=16&mode=routes&rtext=~${lat},${lng}" target="_blank" rel="noopener">Yol Tarifi Al</a>`,
        hintContent: escapeHtml(businessName),
      }, { preset: "islands#blueCircleIcon" });
      map.geoObjects.add(placemark);
      placemark.balloon.open();
    }
  }, [provider, apiKey, yandexKey, lat, lng, businessName, address]);

  if (!lat || !lng) return null;

  return (
    <div
      ref={mapRef}
      style={{
        height: "300px",
        width: "100%",
        borderRadius: "var(--r-md)",
        background: "#e5e7eb",
        border: "1px solid var(--border)",
      }}
      aria-label="İşletme konumu haritası"
    />
  );
}

/* ---------------- Google başlık + tüm yorumlar ---------------- */
function GoogleHeaderBar({ rating, count, businessName, city, placeId, mode, onToggleMode, backendMode }) {
  const writeReviewUrl = placeId
    ? `https://search.google.com/local/writereview?placeid=${placeId}`
    : `https://www.google.com/search?q=${encodeURIComponent(businessName + " " + (city || "") + " yorum yaz")}`;

  const r = Number(rating) || 0;
  const c = Number(count) || 0;

  return (
    <div style={st.gBar}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={st.gIcon}>G</span>
        <b>Güncel Misafir yorumları Google</b>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Stars value={Math.round(r)} small />
          <b style={{ fontSize: 14 }}>{r ? r.toFixed(1) : "—"}</b>
          <span style={{ opacity: .8, fontSize: 14 }}>
            Yorum sayısı {c} (72 saatte bir yenilenir)
          </span>
          {backendMode === "legacy" && (
            <span style={{ fontSize: 12, color: "#a16207", fontWeight: 700 }}>
              • API fallback
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn gbtn" onClick={onToggleMode}>
          {mode === "scroll" ? "Tümünü Listele" : "Yana Kaydır"}
        </button>
        <a className="btn gbtn" href={writeReviewUrl} target="_blank" rel="noreferrer noopener">
          Google üzerinde bizi değerlendirin
        </a>
      </div>
    </div>
  );
}

function GoogleReviewsArea({ reviews = [], mode = "scroll" }) {
  if (!reviews.length)
    return (
      <div style={{ opacity: 0.75, fontSize: 14, padding: "6px 2px" }}>
        Google yorumu bulunamadı.
      </div>
    );

  if (mode === "list") {
    // YORUM SINIRI YOK — HEPSİ ALT ALTA
    return (
      <div style={{ display: "grid", gap: 14 }}>
        {reviews.map((r, i) => <GoogleReviewCard key={i} r={r} />)}
      </div>
    );
  }

  // Varsayılan: yatay kaydırmalı şık görünüm
  return <GoogleScrollableReviews reviews={reviews} />;
}

function GoogleScrollableReviews({ reviews = [] }) {
  const scRef = useRef(null);
  const scrollBy = (dx) => {
    const el = scRef.current;
    if (!el) return;
    el.scrollBy({ left: dx, behavior: "smooth" });
  };

  return (
    <div style={{ position: "relative", marginTop: 6 }}>
      <button aria-label="sola kaydır" className="gNav left" onClick={() => scrollBy(-Math.min(900, scRef.current?.clientWidth || 360))}>‹</button>
      <div ref={scRef} style={st.gScroll} className="no-scrollbar">
        {reviews.map((r, i) => (
          <GoogleReviewCard key={i} r={r} />
        ))}
      </div>
      <button aria-label="sağa kaydır" className="gNav right" onClick={() => scrollBy(Math.min(900, scRef.current?.clientWidth || 360))}>›</button>
    </div>
  );
}

function GoogleReviewCard({ r }) {
  const text = String(r.text || "");
  const initials = (r.author || "Kullanıcı").trim().split(/\s+/).map(s => s[0]).slice(0,2).join("").toUpperCase();

  return (
    <article style={st.gCard}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={st.avatar}>{initials}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <strong>{r.author || "Kullanıcı"}</strong>
            <span style={st.verified}>✔</span>
          </div>
          <div style={{ opacity: .7, fontSize: 12 }}>{timeAgoTR(r.date) || "—"}</div>
        </div>
        <div style={{ marginLeft: "auto" }}><Stars value={r.rating} small /></div>
      </div>

      {text && (
        <p
          style={{
            margin: 0,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {text}
        </p>
      )}
    </article>
  );
}

/* ---------------- Takvim ---------------- */
function DateRangePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const today = stripTime(new Date());
  const [view, setView] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const boxRef = useRef(null);

  const s = toDate(value.start);
  const e = toDate(value.end);

  const label = s
    ? `${fmtTR(value.start)} — ${e ? fmtTR(value.end) : "seçiniz"}`
    : "gg.aa.yyyy — gg.aa.yyyy";
  const days = buildMonth(view);

  useEffect(() => {
    if (!open) return;
    const on = (ev) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(ev.target)) setOpen(false);
    };
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [open]);

  const pick = (d) => {
    if (d < today) return;
    if (!s || (s && e)) {
      onChange({ start: toYmd(d), end: "" });
    } else {
      if (d <= s) {
        onChange({ start: toYmd(d), end: "" });
      } else {
        onChange({ start: toYmd(s), end: toYmd(d) });
        setOpen(false);
      }
    }
  };

  const clear = () => onChange({ start: "", end: "" });

  return (
    <div style={{ position: "relative" }} ref={boxRef}>
      <button
        className="ghost"
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", textAlign: "left" }}
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <div style={st.cal} role="dialog" aria-label="Takvim">
          <div style={st.calHead}>
            <button className="ghost" onClick={() => setView((prev) => addMonths(prev, -1))} aria-label="Önceki ay">‹</button>
            <b>{view.toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}</b>
            <button className="ghost" onClick={() => setView((prev) => addMonths(prev, 1))} aria-label="Sonraki ay">›</button>
          </div>
          <div style={st.wdays}>
            {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
          <div style={st.gridDays}>
            {days.map((d, i) => {
              const disabled = d.getMonth() !== view.getMonth() || d < today;
              const inRange = s && e && d > s && d < e;
              const isStart = s && sameDay(d, s);
              const isEnd = e && sameDay(d, e);
              return (
                <button
                  key={i}
                  disabled={disabled}
                  onClick={() => pick(d)}
                  className="ghost"
                  style={{
                    ...st.dbtn,
                    opacity: disabled ? 0.35 : 1,
                    background:
                      isStart || isEnd ? "#111827" : inRange ? "#e5f3ff" : "var(--card)",
                    color: isStart || isEnd ? "#fff" : "inherit",
                    borderColor: isStart || isEnd ? "#111827" : "var(--border)",
                  }}
                  aria-current={isStart || isEnd ? "date" : undefined}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <button className="ghost" onClick={clear}>Temizle</button>
            <button className="ghost" onClick={() => setOpen(false)}>Tamam</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Yardımcılar ---------------- */
function normalizeGoogleReviews(data) {
  if (!data) return { rating: null, count: 0, reviews: [], _mode: undefined };

  // place öncelikli
  const place = data.place || data.result || {};

  const ratingRaw = place.rating ?? data.rating ?? data.averageRating;
  const rating = Number.isFinite(Number(ratingRaw)) ? Number(ratingRaw) : null;

  let count =
    Number(
      place.count ??
      place.userRatingCount ??
      place.user_ratings_total ??
      data.count ??
      data.userRatingsTotal
    ) || 0;

  const raw =
    data.reviews ||
    place.reviews ||
    data.result?.reviews ||
    [];

  if (!count && Array.isArray(raw)) count = raw.length;

  const reviews = raw.map((r) => {
    // tarih: unix saniye, ISO string veya bilinmeyen olabilir
    const t = r.publishTime ?? r.time ?? r.date ?? r.createdAt ?? null;
    let iso = null;
    if (typeof t === "number") {
      const d = new Date(t * 1000);
      iso = isNaN(d) ? null : d.toISOString();
    } else if (typeof t === "string") {
      const d = new Date(t);
      iso = isNaN(d) ? t : d.toISOString();
    }

    return {
      author:
        r.author ||
        r.author_name ||
        r.user ||
        r.authorAttribution?.displayName ||
        "Kullanıcı",
      text: r.text?.text ?? r.text ?? r.comment ?? "",
      rating: Number(r.rating || r.stars || 0),
      date: iso,
      authorUrl: r.authorAttribution?.uri || r.author_url || undefined,
      authorPhoto: r.authorAttribution?.photoUri || r.profile_photo_url || undefined,
    };
  });

  return { rating, count, reviews, _mode: data.mode };
}
function round1(n) { return Math.round(n * 10) / 10; }
function slugToTitle(s) {
  return String(s || "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}
function toHttps(u) { return /^https?:\/\//i.test(u) ? u : `https://${u}`; }
function trimAt(h) { return String(h || "").replace(/^@+/, ""); }
function toDate(ymd) { if (!ymd) return null; const [y, m, d] = ymd.split("-").map(Number); const dt = new Date(y, m - 1, d); return isNaN(dt) ? null : dt; }
function toYmd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function stripTime(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addMonths(d, n) { const nd = new Date(d); nd.setMonth(nd.getMonth() + n); return nd; }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function fmtTR(ymd) { const d = toDate(ymd); if (!d) return ""; return d.toLocaleDateString("tr-TR"); }
function toWa(phone, text) {
  const digits = String(phone || "").replace(/\D/g, "");
  let intl = digits;
  if (digits.startsWith("0")) intl = "90" + digits.slice(1);
  if (digits.startsWith("90")) intl = digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text || "")}`;
}
function prettyPhone(p) {
  const d = String(p || "").replace(/\D/g, "");
  const m = d.match(/^0?(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]} ${m[4]}` : p;
}
function addUtm(u, utm) {
  try {
    const url = new URL(u);
    const params = new URLSearchParams(utm.replace(/^\?/, ""));
    params.forEach((v, k) => url.searchParams.set(k, v));
    return url.toString();
  } catch { return u; }
}
function toMapUrl(address, coords) {
  if (Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
function shareBiz({ name, slug }) {
  const url = `${window.location.origin}/isletme/${encodeURIComponent(slug)}`;
  if (navigator.share) {
    navigator.share({ title: `${name} · E-Doğrula`, url }).catch(() => navigator.clipboard.writeText(url));
  } else {
    navigator.clipboard.writeText(url); alert("Bağlantı kopyalandı.");
  }
}
function fmtDate(d) {
  const dt = new Date(d);
  return isNaN(dt)
    ? ""
    : dt.toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
}
function timeAgoTR(dateIso) {
  if (!dateIso) return "";
  const now = new Date();
  const d = new Date(dateIso);
  if (isNaN(d)) return fmtDate(dateIso);
  const s = Math.floor((now - d) / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const day = Math.floor(h / 24);
  const mo = Math.floor(day / 30);
  const yr = Math.floor(day / 365);
  if (s < 60) return "az önce";
  if (m < 60) return `${m} dk önce`;
  if (h < 24) return `${h} saat önce`;
  if (day < 30) return `${day} gün önce`;
  if (mo < 12) return `${mo} ay önce`;
  return `${yr} yıl önce`;
}
function escapeHtml(s="") { return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function Loader() { return (<div style={{ marginTop: 16 }}><div className="skl" /><div className="skl" /><div className="skl" /></div>); }

/* ---------- YILDIZ BİLEŞENİ ---------- */
function Stars({ value = 0, small = false }) {
  const n = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} style={{ fontSize: small ? 14 : 18, lineHeight: 1 }}>
          {i < n ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

/* ---------------- Stil ---------------- */
const st = {
  page: { background: "var(--bg)", color: "var(--fg)", minHeight: "100vh", fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji','Segoe UI Emoji'", letterSpacing: .1 },
  head: { position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg)", borderBottom: "1px solid var(--border)", backdropFilter: "saturate(140%) blur(6px)" },
  container: { width: "min(1140px, 94vw)", margin: "14px auto 40px" },
  breadcrumb: { margin: "10px 2px 14px", color: "var(--fg-3)", display: "flex", gap: 6, alignItems: "center" },

  grid: { display: "grid", gridTemplateColumns: "1fr 360px", gap: 22, alignItems: "start" },

  left: { minWidth: 0 },

  card: { marginTop: 14, border: "1px solid var(--border)", background: "var(--card)", borderRadius: "var(--r-lg)", boxShadow: "0 12px 32px rgba(0,0,0,.05)", overflow: "hidden" },
  title: { margin: "0 0 8px", padding: "12px 14px 0", fontSize: 24, fontWeight: 900, letterSpacing: .3 },
  dots: { display: "grid", gridTemplateColumns: "repeat(32, 1fr)", gap: 4, padding: "0 14px 10px" },

  desc: { padding: "6px 14px 14px" },
  descTitle: { fontWeight: 900, margin: "4px 0 6px", fontSize: 16 },
  descText: { margin: 0, lineHeight: 1.55, color: "var(--fg-2)" },

  right: { position: "sticky", top: 80, display: "grid", gap: 14 },

  box: { border: "1px solid var(--border)", background: "var(--card)", borderRadius: "var(--r-lg)", padding: 14, boxShadow: "0 16px 40px rgba(0,0,0,.06)" },

  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  inputWrap: { display: "grid", gap: 6, margin: "10px 0" },
  label: { fontWeight: 800, fontSize: 13 },

  nightsText: { margin: "8px 0 4px", fontWeight: 800, opacity: 0.8 },

  reserveBtn: { width: "100%", background: "#0e3a2f", color: "#fff", border: "none", borderRadius: "var(--r-sm)", padding: "12px", fontWeight: 900, marginTop: 8 },
  sel: { width: "100%", border: "1px solid var(--border)", background: "var(--card)", color: "var(--fg)", borderRadius: "var(--r-sm)", padding: "8px" },

  infoCard: { border: "1px solid var(--border)", background: "var(--card)", borderRadius: "var(--r-lg)", padding: 12 },
  infoHead: { fontWeight: 900, marginBottom: 8 },
  infoRow: { padding: "10px 4px", borderTop: "1px dashed var(--border)", display: "flex", alignItems: "center", gap: 8, fontSize: 15 },

  reviews: { border: "1px solid var(--border)", background: "var(--card)", borderRadius: "var(--r-lg)", padding: 12 },
  err: { marginTop: 10, color: "#ef4444", fontWeight: 700 },

  // Google-stili bar ve kart listesi
  gBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#dcfce7", border: "1px solid #16a34a33", padding: 12, borderRadius: "var(--r-lg)", marginBottom: 12, flexWrap: "wrap" },
  gIcon: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 999, background: "#fff", border: "1px solid var(--border)", fontWeight: 900 },
  gScroll: { display: "grid", gridAutoFlow: "column", gridAutoColumns: "min(520px, 88vw)", gap: 14, overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: 4 },
  gCard: { border: "2px solid #16a34a55", borderRadius: "var(--r-lg)", padding: 12, background: "var(--card)", scrollSnapAlign: "start", boxShadow: "0 1px 0 rgba(0,0,0,.03)" },
  avatar: { width: 38, height: 38, borderRadius: 999, background: "#e5e7eb", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800 },
  verified: { display: "inline-flex", width: 18, height: 18, borderRadius: 999, background: "#16a34a", color: "#fff", alignItems: "center", justifyContent: "center", fontSize: 12 },

  // Takvim
  cal: { position: "absolute", zIndex: 30, top: "calc(100% + 6px)", left: 0, width: 280, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: 10, boxShadow: "0 16px 40px rgba(0,0,0,.1)" },
  calHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  wdays: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, fontSize: 12, opacity: 0.8, marginBottom: 4 },
  gridDays: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 },
  dbtn: { height: 34, borderRadius: "var(--r-xs)", border: "1px solid var(--border)" },
};

const globalCSS = `
:root{
  --bg:#ffffff; --card:#ffffff; --fg:#151826;
  --fg-2:#28334a; --fg-3:#6b7280; --border:#e6e7eb;
  --brand:#6a35ff;
  --r-xs:8px; --r-sm:10px; --r-md:12px; --r-lg:14px;
}
:root[data-theme="dark"]{
  --bg:#0b1220; --card:#0f172a; --fg:#e5e7eb;
  --fg-2:#cbd5e1; --fg-3:#94a3b8; --border:#243244;
  --brand:#8b7bff;
}
*{box-sizing:border-box} body{margin:0}
.no-scrollbar::-webkit-scrollbar{display:none}
.no-scrollbar{scrollbar-width:none}
.lnk{color:var(--fg); text-decoration:none; font-weight:700}
.lnk:hover{text-decoration:underline}
.ghost{
  background:var(--card); border:1px solid var(--border);
  border-radius:var(--r-sm); padding:8px 10px; cursor:pointer;
  transition:border-color .15s ease, box-shadow .15s ease, background .15s ease;
}
.ghost:hover{border-color:#c8ced6}
.ghost:focus-visible{outline:2px solid #111827; outline-offset:2px}
.btn{ border-radius:var(--r-sm); }
.btn:focus-visible{ outline:2px solid #111827; outline-offset:2px }
.gbtn{
  background:#16a34a; color:#fff; padding:10px 14px; border:0;
  border-radius:999px; font-weight:900; text-decoration:none;
}
.gbtn:hover{ filter:brightness(.95) }
.gNav{
  position:absolute; top:50%; transform:translateY(-50%);
  border:1px solid var(--border); background:#fff; width:34px; height:34px;
  border-radius:999px; cursor:pointer; z-index:2; font-weight:900;
  box-shadow:0 6px 16px rgba(0,0,0,.08);
}
.gNav.left{ left:-6px } .gNav.right{ right:-6px }
.dots i{width:10px; height:8px; background:#22c55e; display:block; border-radius:6px}
.skl{height:16px;border-radius:var(--r-xs);background:linear-gradient(90deg,rgba(0,0,0,.06),rgba(0,0,0,.12),rgba(0,0,0,.06));animation:sh 1.2s infinite;background-size:200% 100%;margin:8px 0}
@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
.lightbox img, .lightbox-gallery img, .gallery img{
  border-radius:var(--r-lg);
  border:1px solid var(--border);
}
/* HERO içindeki tüm img/iframes tam kapa */
.hero img, .hero picture, .hero video, .hero iframe {
  width: 100%; height: 100%; object-fit: cover;
}
input, select, textarea{ outline:none; }
input:hover, select:hover, textarea:hover{ border-color:#c9d1d9; }
input:focus, select:focus, textarea:focus{
  border-color:#94a3b8; box-shadow:0 0 0 3px rgba(148,163,184,.25);
}
`; // backtick KAPALI

/** Verilen ayın takvim ızgarası (6 satır x 7 gün = 42 hücre) */
function buildMonth(firstDay) {
  const start = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1);
  const weekday = (start.getDay() + 6) % 7; // Pzt=0
  const days = [];
  const first = new Date(start);
  first.setDate(1 - weekday);
  for (let i = 0; i < 42; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    days.push(d);
  }
  return days;
}
