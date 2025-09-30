// frontend/src/pages/BusinessProfile.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import LightboxGallery from "@/components/LightboxGallery.jsx";

/** Profil sayfası — Pro sürüm
 * - Tek axios instance + baseURL normalizasyonu
 * - İşletme fetch: çok uç + abort + sessionStorage cache
 * - Görsel toplama (abs path), Lightbox
 * - Rezervasyon paneli: sağlam doğrulama, dış tıkla-kapat takvim
 * - WhatsApp linkine UTM / ref ekleme
 * - Google + Site yorumları, güvenli normalizasyon
 * - Paylaş / kopyala / harita kısayolları
 * - JSON-LD LocalBusiness (SEO)
 */

export default function BusinessProfile() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const loc = useLocation();

  /* ---------------- HTTP instance ---------------- */
  const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
  const http = useMemo(() => {
    const inst = axios.create({
      baseURL: API_BASE || "",
      withCredentials: true,
      timeout: 15000,
    });
    inst.interceptors.request.use((cfg) => {
      // ziyaretçi sayfası; token opsiyonel
      const t = localStorage.getItem("adminToken") || localStorage.getItem("token") || "";
      if (t) cfg.headers.Authorization = `Bearer ${t}`;
      return cfg;
    });
    return inst;
  }, [API_BASE]);

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
            const { data } = await http.get(path, { signal: ctrlRef.current.signal });
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
  const instagram = b?.instagram || b?.instagramUsername || b?.handle || null;
  const instagramUrl = b?.instagramUrl || (instagram ? `https://instagram.com/${trimAt(instagram)}` : null);
  const website = b?.website || b?.site || null;
  const address = b?.address || b?.fullAddress || b?.location?.address || null;
  const coords = {
    lat: b?.location?.lat ?? b?.lat,
    lng: b?.location?.lng ?? b?.lng,
  };

  // Görseller (absolute)
  const imagesAbs = useMemo(() => {
    if (Array.isArray(b?.galleryAbs) && b.galleryAbs.length) return uniq(b.galleryAbs.filter(Boolean));
    const base =
      API_BASE ||
      (typeof window !== "undefined" ? window.location.origin.replace(/\/+$/, "") : "");
    const out = new Set();
    const push = (v) => {
      if (!v) return;
      if (Array.isArray(v)) return v.forEach(push);
      if (typeof v !== "string") return;
      let s = v.trim();
      if (!s) return;
      if (/^https?:\/\//i.test(s)) out.add(s);
      else if (s.startsWith("/uploads/")) out.add(base + s);
      else if (/^uploads\//i.test(s)) out.add(`${base}/${s.replace(/^\/+/, "")}`);
    };
    push(b?.photos);
    push(b?.images);
    push(b?.gallery);
    push(b?.media);
    push(b?.cover);
    return Array.from(out);
  }, [b, API_BASE]);

  /* ---------------- rezervasyon paneli ---------------- */
  // URL ile ön doldurma (?start=YYYY-MM-DD&end=YYYY-MM-DD&adults=2&children=1)
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
    const s = toDate(range.start),
      e = toDate(range.end);
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
        ? `\n${childAges
            .map((age, i) => `${i + 1}. çocuk yaşı: ${age || "belirtilmedi"}`)
            .join("\n")}`
        : "") +
      `\nRef: ${window.location.origin}/isletme/${encodeURIComponent(slug)}`;

    const utm = `?utm_source=edogrula&utm_medium=profile&utm_campaign=wa_booking&biz=${encodeURIComponent(
      slug
    )}`;

    const wa = phones[0] ? toWa(phones[0], msg) : null;
    const link =
      (wa && wa + "&" + utm.slice(1)) ||
      (b?.bookingUrl ? addUtm(b.bookingUrl, utm) : null) ||
      (website ? addUtm(toHttps(website), utm) : null) ||
      (instagramUrl ? addUtm(instagramUrl, utm) : null) ||
      (phones[0] ? `tel:${phones[0]}` : null);

    if (link) window.open(link, "_blank", "noopener,noreferrer");
  };

  /* ---------------- yorumlar + puanlama ---------------- */
  const [tab, setTab] = useState("google"); // google | site
  const [gReviews, setGReviews] = useState({ rating: null, count: 0, reviews: [] });
  const [sReviews, setSReviews] = useState({ rating: null, count: 0, reviews: [] });
  const [revLoading, setRevLoading] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [myComment, setMyComment] = useState("");
  const ratedKey = b?._id ? `rated_${b._id}` : slug ? `rated_${slug}` : null;
  const alreadyRated = !!(ratedKey && localStorage.getItem(ratedKey));

  useEffect(() => {
    if (!b) return;
    let mounted = true;
    (async () => {
      try {
        setRevLoading(true);

        const gUrls = [
          b?.googlePlaceId ? `/api/google/reviews?placeId=${b.googlePlaceId}` : null,
          `/api/google/reviews/search?query=${encodeURIComponent(name + " " + (city || ""))}`,
        ].filter(Boolean);

        for (const p of gUrls) {
          try {
            const { data } = await http.get(p);
            const got = normalizeGoogleReviews(data);
            if (got) {
              if (!mounted) return;
              setGReviews(got);
              break;
            }
          } catch {}
        }

        const idOrSlug = b?._id || slug;
        const sUrls = [`/api/businesses/${idOrSlug}/reviews`, `/api/reviews?business=${idOrSlug}`];
        for (const p of sUrls) {
          try {
            const { data } = await http.get(p);
            const got = normalizeSiteReviews(data);
            if (got) {
              if (!mounted) return;
              setSReviews(got);
              break;
            }
          } catch {}
        }
      } finally {
        if (mounted) setRevLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [b, http, slug, name, city]);

  const submitReview = async () => {
    if (!b) return;
    if (myRating < 1 || myRating > 5) return;
    try {
      const payload = {
        business: b._id || slug,
        rating: myRating,
        comment: myComment || undefined,
      };
      const targets = [`/api/reviews`, `/api/businesses/${b._id || slug}/reviews`];
      for (const p of targets) {
        try {
          await http.post(p, payload);
          break;
        } catch {}
      }
      setSReviews((prev) => ({
        rating: calcAvg((prev.reviews || []).map((r) => r.rating).concat([myRating])),
        count: (prev.count || 0) + 1,
        reviews: [
          { author: "Misafir", rating: myRating, text: myComment, date: new Date().toISOString() },
          ...(prev.reviews || []),
        ].slice(0, 20),
      }));
      if (ratedKey) localStorage.setItem(ratedKey, "1");
      setMyRating(0);
      setMyComment("");
      alert("Değerlendirmeniz alındı. Teşekkürler!");
    } catch {
      alert("Gönderilemedi, lütfen tekrar deneyin.");
    }
  };

  /* ---------------- SEO: title + JSON-LD ---------------- */
  useEffect(() => {
    if (!name) return;
    document.title = `${name} · E-Doğrula`;
    // JSON-LD
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
        avgSafe(gReviews.rating, sReviews.rating) && (gReviews.count || sReviews.count)
          ? {
              "@type": "AggregateRating",
              ratingValue: round1(avgSafe(gReviews.rating, sReviews.rating)),
              reviewCount: (gReviews.count || 0) + (sReviews.count || 0),
            }
          : undefined,
      image: imagesAbs?.slice?.(0, 5),
      geo:
        Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
          ? { "@type": "GeoCoordinates", latitude: coords.lat, longitude: coords.lng }
          : undefined,
    };
    script.text = JSON.stringify(jsonLd);
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, [name, address, city, phones, instagramUrl, website, imagesAbs, gReviews, sReviews, coords]);

  /* ---------------- UI ---------------- */
  return (
    <div style={st.page}>
      <style>{globalCSS}</style>

      <header style={st.head}>
        <button className="ghost" onClick={() => navigate(-1)} aria-label="Geri">
          ← Geri
        </button>
        <div style={{ flex: 1 }} />
        <nav style={{ display: "flex", gap: 18 }}>
          <a className="lnk" href="/evler">
            Evler
          </a>
          <a className="lnk" href="/iletisim">
            İletişim
          </a>
        </nav>
      </header>

      <main style={st.container}>
        <div style={st.breadcrumb}>
          <a href="/" className="lnk">
            Ana sayfa
          </a>
          <span> / </span>
          <span>{name.toLowerCase()}</span>
        </div>

        <div style={st.grid}>
          {/* SOL */}
          <section style={st.left}>
            {imagesAbs.length > 0 ? <LightboxGallery imagesAbs={imagesAbs} title={name} /> : <div style={st.cover} />}

            <div style={st.card}>
              <h1 style={st.title}>{name}</h1>
              <div style={st.metaRow}>
                {(city || district) && (
                  <span>
                    {district ? `${district}, ` : ""}
                    {city}
                  </span>
                )}
                <span>• 4 kişi</span>
                <span>• 2 oda</span>
                <span>• 1 banyo</span>
              </div>

              {/* Aksiyonlar */}
              <div style={{ display: "flex", gap: 8, padding: "0 14px 8px" }}>
                <button className="ghost" onClick={() => shareBiz({ name, slug })} title="Paylaş">
                  🔗 Paylaş
                </button>
                {address && (
                  <a
                    className="ghost"
                    href={toMapUrl(address, coords)}
                    target="_blank"
                    rel="noreferrer noopener"
                    title="Haritada aç"
                  >
                    🗺️ Harita
                  </a>
                )}
                {phones[0] && (
                  <button
                    className="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(prettyPhone(phones[0]));
                    }}
                    title="Telefon kopyala"
                  >
                    📋 Tel
                  </button>
                )}
              </div>

              <div style={st.dots}>{Array.from({ length: 32 }).map((_, i) => <i key={i} />)}</div>

              {/* Açıklama */}
              <div style={st.desc}>
                <div style={st.descTitle}>Açıklama</div>
                <p style={st.descText}>
                  {b?.description || b?.about || b?.summary || "Bu işletme henüz açıklama eklemedi."}
                </p>
              </div>
            </div>
          </section>

          {/* SAĞ */}
          <aside style={st.right}>
            {/* Rezervasyon */}
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
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="0"
                    value={adults}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const val = raw === "" ? "" : String(Math.max(0, parseInt(raw, 10) || 0));
                      setAdults(val);
                    }}
                  />
                </div>
                <div style={st.inputWrap}>
                  <label style={st.label}>Çocuk</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="0"
                    value={children}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const val = raw === "" ? "" : String(Math.max(0, parseInt(raw, 10) || 0));
                      setChildren(val);
                    }}
                  />
                </div>
              </div>

              {childrenNum > 0 && (
                <div style={{ marginTop: 6 }}>
                  <label style={st.label}>Çocuk Yaşları</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {Array.from({ length: childrenNum }).map((_, i) => (
                      <select
                        key={i}
                        value={childAges[i] || ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setChildAges((a) => {
                            const c = [...a];
                            c[i] = v;
                            return c;
                          });
                        }}
                        style={st.sel}
                      >
                        <option value="">Yaş</option>
                        {Array.from({ length: 18 }).map((__, y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    ))}
                  </div>
                </div>
              )}

              <button
                className="btn"
                style={{ ...st.reserveBtn, opacity: canReserve ? 1 : 0.6, cursor: canReserve ? "pointer" : "not-allowed" }}
                onClick={reserve}
                disabled={!canReserve}
              >
                Rezervasyon Yap
              </button>
              <button
                className="btn"
                style={st.askBtn}
                onClick={() => {
                  const link =
                    (instagramUrl && addUtm(instagramUrl, "?utm_source=edogrula&utm_medium=profile&utm_campaign=ask")) ||
                    (phones[0] ? toWa(phones[0], "Merhaba, bilgi almak istiyorum.") : null);
                  if (link) window.open(link, "_blank", "noopener,noreferrer");
                }}
              >
                Soruların var mı?
              </button>
            </div>

            {/* İşletme Bilgileri */}
            <section style={st.infoCard}>
              <header style={st.infoHead}>İşletme Bilgileri</header>
              <div style={st.infoRow}>
                📱 {phones[0] ? <a href={`tel:${phones[0]}`} className="lnk">{prettyPhone(phones[0])}</a> : "—"}
              </div>
              <div style={st.infoRow}>
                📷 {instagram ? <a href={instagramUrl} className="lnk" target="_blank" rel="noreferrer noopener">@{trimAt(instagram)}</a> : "—"}
              </div>
              <div style={st.infoRow}>
                🕸️ {website ? <a href={toHttps(website)} className="lnk" target="_blank" rel="noreferrer noopener">{website}</a> : "—"}
              </div>
              <div style={st.infoRow}>📍 {address || "—"}</div>
            </section>

            {/* Yorumlar + Puanlama */}
            <section style={st.reviews}>
              <header style={st.revHead}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Stars value={avgSafe(gReviews.rating, sReviews.rating)} />
                  <b>{avgSafe(gReviews.rating, sReviews.rating)?.toFixed?.(1) || "—"}</b>
                </div>
                <div className="tabs">
                  <button className={`tab ${tab === "google" ? "sel" : ""}`} onClick={() => setTab("google")}>
                    Google
                  </button>
                  <button className={`tab ${tab === "site" ? "sel" : ""}`} onClick={() => setTab("site")}>
                    E-Doğrula
                  </button>
                </div>
              </header>

              {revLoading ? (
                <div className="skl" />
              ) : (
                <>
                  {tab === "google" ? (
                    <ReviewList list={gReviews.reviews} empty="Google yorumu bulunamadı." />
                  ) : (
                    <>
                      <ReviewList list={sReviews.reviews} empty="Henüz yorum yok. İlk yorumu sen yaz!" />
                      <div style={st.rateBox}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 800 }}>Değerlendir:</span>
                          <StarPicker value={myRating} onChange={alreadyRated ? () => {} : setMyRating} disabled={alreadyRated} />
                          {alreadyRated && <span style={{ opacity: 0.7, fontSize: 12 }}>teşekkürler, oy verdin ✓</span>}
                        </div>
                        <textarea
                          placeholder="İsteğe bağlı yorumun (maks. 400 karakter)"
                          maxLength={400}
                          value={myComment}
                          onChange={(e) => setMyComment(e.target.value)}
                          style={st.ta}
                          disabled={alreadyRated}
                        />
                        <button className="btn" onClick={submitReview} disabled={alreadyRated || myRating < 1} style={st.okBtn}>
                          Gönder
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          </aside>
        </div>

        {loading && <Loader />}
        {!loading && err && <div style={st.err}>{err}</div>}
      </main>
    </div>
  );
}

/* ---------------- Tek takvimli tarih aralığı ---------------- */
function DateRangePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const today = stripTime(new Date());
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const boxRef = useRef(null);

  const s = toDate(value.start);
  const e = toDate(value.end);

  const label = s ? `${fmtTR(value.start)} — ${e ? fmtTR(value.end) : "seçiniz"}` : "gg.aa.yyyy — gg.aa.yyyy";
  const days = buildMonth(view);

  // dış tıkla kapat
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
    if (d < today) return; // geçmiş kapalı
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
      <button className="ghost" onClick={() => setOpen((o) => !o)} style={{ width: "100%", textAlign: "left" }} aria-expanded={open}>
        {label}
      </button>
      {open && (
        <div style={st.cal} role="dialog" aria-label="Takvim">
          <div style={st.calHead}>
            <button className="ghost" onClick={() => setView((prev) => addMonths(prev, -1))} aria-label="Önceki ay">
              ‹
            </button>
            <b>{view.toLocaleDateString("tr-TR", { month: "long", year: "numeric" })}</b>
            <button className="ghost" onClick={() => setView((prev) => addMonths(prev, 1))} aria-label="Sonraki ay">
              ›
            </button>
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
                    background: isStart || isEnd ? "#111827" : inRange ? "#e5f3ff" : "var(--card)",
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
            <button className="ghost" onClick={clear}>
              Temizle
            </button>
            <button className="ghost" onClick={() => setOpen(false)}>
              Tamam
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Yorum listesi & yıldızlar ---------------- */
function ReviewList({ list = [], empty }) {
  if (!list.length) return <div style={{ opacity: 0.75, fontSize: 14, padding: "6px 2px" }}>{empty}</div>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {list.slice(0, 5).map((r, i) => (
        <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <strong>{r.author || r.user || "Kullanıcı"}</strong>
            <Stars value={r.rating} small />
          </div>
          {r.text && <p style={{ margin: "6px 0 0", lineHeight: 1.45 }}>{r.text}</p>}
          {r.date && <div style={{ opacity: 0.6, fontSize: 12, marginTop: 6 }}>{fmtDate(r.date)}</div>}
        </div>
      ))}
    </div>
  );
}
function Stars({ value = 0, small = false }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <div style={{ display: "inline-flex", gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} style={{ fontSize: small ? 14 : 18, lineHeight: 1 }}>
          {i < Math.round(v) ? "★" : "☆"}
        </span>
      ))}
    </div>
  );
}
function StarPicker({ value = 0, onChange = () => {}, disabled }) {
  return (
    <div style={{ display: "inline-flex", gap: 4, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} onClick={() => !disabled && onChange(i + 1)} title={`${i + 1}`} style={{ fontSize: 22, userSelect: "none" }}>
          {i < value ? "★" : "☆"}
        </span>
      ))}
    </div>
  );
}

/* ---------------- Yardımcılar ---------------- */
function normalizeGoogleReviews(data) {
  if (!data) return null;
  const rating = Number(data.rating ?? data.averageRating ?? data.result?.rating);
  const count = Number(data.count ?? data.userRatingsTotal ?? data.result?.count) || (data.reviews?.length || 0);
  const arr = data.reviews || data.result?.reviews || [];
  const reviews = arr.map((r) => ({
    author: r.author_name || r.author || r.user || "Kullanıcı",
    text: r.text || r.comment || "",
    rating: Number(r.rating || r.stars || 0),
    date: r.time ? new Date(r.time * 1000).toISOString() : r.date || r.createdAt || null,
  }));
  if (!Number.isFinite(rating) && !reviews.length) return { rating: null, count: 0, reviews: [] };
  return { rating, count, reviews };
}
function normalizeSiteReviews(data) {
  if (!data) return null;
  const avg = Number(data.avg ?? data.average ?? data.rating);
  const total = Number(data.total ?? data.count ?? (data.reviews?.length || 0));
  const list =
    (data.reviews || data.data || []).map((r) => ({
      author: r.user?.name || r.author || "Kullanıcı",
      text: r.text || r.comment || "",
      rating: Number(r.rating || r.stars || 0),
      date: r.createdAt || r.date || null,
    })) || [];
  return { rating: Number.isFinite(avg) ? avg : list.length ? calcAvg(list.map((x) => x.rating)) : null, count: total, reviews: list };
}
function calcAvg(nums) {
  const a = nums.map(Number).filter((n) => Number.isFinite(n));
  return a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0;
}
function avgSafe(a, b) {
  const arr = [a, b].map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return arr.length ? calcAvg(arr) : null;
}
function round1(n) {
  return Math.round(n * 10) / 10;
}

function slugToTitle(s) {
  return String(s || "").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());
}
function toHttps(u) {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}
function trimAt(h) {
  return String(h || "").replace(/^@+/, "");
}
function toDate(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return isNaN(dt) ? null : dt;
}
function toYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function stripTime(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addMonths(d, n) {
  const nd = new Date(d);
  nd.setMonth(nd.getMonth() + n);
  return nd;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
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
function fmtTR(ymd) {
  const d = toDate(ymd);
  if (!d) return "";
  return d.toLocaleDateString("tr-TR");
}
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
  } catch {
    return u;
  }
}
function uniq(arr) {
  return Array.from(new Set(arr));
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
    navigator
      .share({ title: `${name} · E-Doğrula`, url })
      .catch(() => navigator.clipboard.writeText(url));
  } else {
    navigator.clipboard.writeText(url);
    alert("Bağlantı kopyalandı.");
  }
}
function fmtDate(d) {
  const dt = new Date(d);
  return isNaN(dt) ? "" : dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
}
function Loader() {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="skl" />
      <div className="skl" />
      <div className="skl" />
    </div>
  );
}

/* ---------------- Stil ---------------- */
const st = {
  page: { background: "var(--bg)", color: "var(--fg)", minHeight: "100vh", fontFamily: "Inter, Segoe UI, Tahoma, sans-serif" },
  head: {
    position: "sticky",
    top: 0,
    zIndex: 5,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    background: "var(--bg)",
    borderBottom: "1px solid var(--border)",
  },
  container: { width: "min(1140px, 94vw)", margin: "14px auto 40px" },
  breadcrumb: { margin: "10px 2px 14px", color: "var(--fg-3)", display: "flex", gap: 6, alignItems: "center" },

  grid: { display: "grid", gridTemplateColumns: "1fr 360px", gap: 22, alignItems: "start" },

  left: { minWidth: 0 },
  cover: {
    height: 340,
    background: "#efe6d9",
    borderRadius: 14,
    border: "1px solid var(--border)",
    boxShadow: "inset 0 2px 10px rgba(0,0,0,.04)",
  },

  card: {
    marginTop: 14,
    border: "1px solid var(--border)",
    background: "var(--card)",
    borderRadius: 14,
    boxShadow: "0 12px 32px rgba(0,0,0,.05)",
  },
  title: { margin: "0 0 8px", padding: "12px 14px 0", fontSize: 22, fontWeight: 900 },
  metaRow: { display: "flex", gap: 10, flexWrap: "wrap", padding: "0 14px 10px", opacity: 0.85 },
  dots: { display: "grid", gridTemplateColumns: "repeat(32, 1fr)", gap: 4, padding: "0 14px 10px" },

  desc: { padding: "6px 14px 14px" },
  descTitle: { fontWeight: 900, margin: "4px 0 6px", fontSize: 16 },
  descText: { margin: 0, lineHeight: 1.55, color: "var(--fg-2)" },

  right: { position: "sticky", top: 80, display: "grid", gap: 14 },

  box: { border: "1px solid var(--border)", background: "var(--card)", borderRadius: 14, padding: 14, boxShadow: "0 16px 40px rgba(0,0,0,.06)" },

  row2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  inputWrap: { display: "grid", gap: 6, margin: "10px 0" },
  label: { fontWeight: 800, fontSize: 13 },

  nightsText: { margin: "8px 0 4px", fontWeight: 800, opacity: 0.8 },

  reserveBtn: {
    width: "100%",
    background: "#0e3a2f",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "12px",
    fontWeight: 900,
    marginTop: 8,
  },
  askBtn: {
    width: "100%",
    background: "#f6f8f9",
    color: "var(--fg)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "10px",
    fontWeight: 800,
    marginTop: 8,
  },
  sel: { width: "100%", border: "1px solid var(--border)", background: "var(--card)", color: "var(--fg)", borderRadius: 10, padding: "8px" },

  infoCard: { border: "1px solid var(--border)", background: "var(--card)", borderRadius: 14, padding: 12 },
  infoHead: { fontWeight: 900, marginBottom: 8 },
  infoRow: { padding: "6px 4px", borderTop: "1px dashed var(--border)" },

  reviews: { border: "1px solid var(--border)", background: "var(--card)", borderRadius: 14, padding: 12 },
  revHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  rateBox: { borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10 },
  ta: {
    width: "100%",
    minHeight: 70,
    padding: 10,
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--card)",
    color: "var(--fg)",
    margin: "8px 0",
  },

  okBtn: { background: "#22c55e", color: "#fff", border: "none", borderRadius: 10, padding: "10px 12px", fontWeight: 800 },

  err: { marginTop: 10, color: "#ef4444", fontWeight: 700 },

  // Takvim
  cal: {
    position: "absolute",
    zIndex: 30,
    top: "calc(100% + 6px)",
    left: 0,
    width: 280,
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 10,
    boxShadow: "0 16px 40px rgba(0,0,0,.1)",
  },
  calHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  wdays: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, fontSize: 12, opacity: 0.8, marginBottom: 4 },
  gridDays: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 },
  dbtn: { height: 34, borderRadius: 8, border: "1px solid var(--border)" },
};

const globalCSS = `
:root{
  --bg:#ffffff; --card:#ffffff; --fg:#0f172a;
  --fg-2:#24324a; --fg-3:#475569; --border:#e5e7eb;
}
:root[data-theme="dark"]{
  --bg:#0b1220; --card:#0f172a; --fg:#e5e7eb;
  --fg-2:#cbd5e1; --fg-3:#94a3b8; --border:#243244;
}
*{box-sizing:border-box} body{margin:0}
.lnk{color:var(--fg); text-decoration:none; font-weight:700}
.lnk:hover{text-decoration:underline}
.ghost{background:var(--card); border:1px solid var(--border); border-radius:10px; padding:8px 10px; cursor:pointer}
.dots i{width:10px; height:8px; background:#22c55e; display:block; border-radius:6px}
.skl{height:16px;border-radius:8px;background:linear-gradient(90deg,rgba(0,0,0,.06),rgba(0,0,0,.12),rgba(0,0,0,.06));animation:sh 1.2s infinite;background-size:200% 100%;margin:8px 0}
@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
.tabs{display:inline-flex; gap:6px}
.tab{border:1px solid var(--border); background:var(--card); border-radius:999px; padding:6px 10px; font-weight:800; cursor:pointer}
.tab.sel{background:#111827; color:#fff; border-color:#111827}
@media (max-width: 960px){
  body .grid{grid-template-columns:1fr}
  body .right{position:relative; top:auto}
}
`;
