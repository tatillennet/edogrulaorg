// frontend/src/pages/BusinessProfile.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useLocation, useNavigate, useParams } from "react-router-dom";

/** Profil sayfası: sağ panel geliştirilmiş rezervasyon + işletme bilgileri + yorumlar + puanlama */
export default function BusinessProfile() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const loc = useLocation();

  const [b, setB] = useState(loc.state?.business || null);
  const [loading, setLoading] = useState(!b);
  const [err, setErr] = useState("");

  const API = import.meta.env.VITE_API_URL;
  const ctrlRef = useRef(null);

  // ------- İŞLETMEYİ GETİR -------
  useEffect(() => {
    if (b) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        ctrlRef.current?.abort?.();
        ctrlRef.current = new AbortController();

        const urls = [
          `${API}/api/businesses/by-slug/${encodeURIComponent(slug)}`,
          `${API}/api/businesses/${encodeURIComponent(slug)}`,
          `${API}/api/businesses/handle/${encodeURIComponent(slug)}`,
          `${API}/api/businesses/search?q=${encodeURIComponent(slug)}`
        ];
        for (const u of urls) {
          try {
            const { data } = await axios.get(u, { signal: ctrlRef.current.signal, timeout: 12000 });
            const biz =
              data?.business || data?.result || data?.data?.business ||
              data?.businesses?.[0] || (data?._id ? data : null);
            if (biz) {
              if (!mounted) return;
              setB(biz);
              setLoading(false);
              return;
            }
            if (data?.status === "not_found") break;
          } catch {}
        }
        if (mounted) { setErr("İşletme bulunamadı."); setLoading(false); }
      } catch { if (mounted) { setErr("Bir hata oluştu."); setLoading(false); } }
    })();
    return () => { ctrlRef.current?.abort?.(); mounted = false; };
  }, [slug, API, b]);

  // ------- TÜREV ALANLAR -------
  const name = b?.name || slugToTitle(slug);
  const city = b?.city || b?.location?.city;
  const district = b?.district || b?.location?.district;
  const phones = useMemo(() => Array.isArray(b?.phones) ? b.phones : (b?.phone ? [b.phone] : []), [b]);
  const instagram = b?.instagram || b?.instagramUsername || b?.handle;
  const instagramUrl = b?.instagramUrl || (instagram ? `https://instagram.com/${instagram}` : null);
  const website = b?.website || b?.site;
  const address = b?.address || b?.fullAddress || b?.location?.address;

  // Görseller (photos/images/gallery/cover alanlarından toparlıyoruz)
  const images = useMemo(() => {
    const list = [];
    const push = (v) => {
      if (!v) return;
      if (Array.isArray(v)) v.forEach(push);
      else if (typeof v === "string") list.push(toHttps(v));
    };
    push(b?.photos);
    push(b?.images);
    push(b?.gallery);
    push(b?.media);
    push(b?.cover);
    return Array.from(new Set(list)).filter(Boolean);
  }, [b]);

  // ------- REZERVASYON PANELİ -------
  const [range, setRange] = useState({ start: "", end: "" }); // "YYYY-MM-DD"
  const nights = useMemo(() => {
    const s = toDate(range.start), e = toDate(range.end);
    if (!s || !e) return 0;
    const diff = Math.ceil((e - s) / 86400000);
    return Math.max(1, diff);
  }, [range]);

  // yetişkin/çocuk & çocuk yaşları (başlangıçta boş!)
  const [adults, setAdults] = useState("");
  const [children, setChildren] = useState("");
  const adultsNum = Number(adults) || 0;
  const childrenNum = Number(children) || 0;

  const [childAges, setChildAges] = useState([]);
  useEffect(() => {
    const n = Number(children) || 0;
    setChildAges((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push("");
      return next;
    });
  }, [children]);

  const reserve = () => {
    const s = fmtTR(range.start) || "belirtilmedi";
    const e = fmtTR(range.end || range.start) || "belirtilmedi";
    const msg =
      `Merhaba sizlere www.edogrula.org üzerinden ulaşıyorum\n` +
      `Giriş tarihi: ${s}\n` +
      `Çıkış tarihi: ${e}\n` +
      `Yetişkin sayısı: ${adultsNum || "belirtilmedi"}\n` +
      `Çocuk sayısı: ${childrenNum || 0}` +
      (childrenNum > 0
        ? `\n${childAges.map((age, i) => `${i + 1}. çocuk yaşı: ${age || "belirtilmedi"}`).join("\n")}`
        : "");

    const wa = phones[0] ? toWa(phones[0], msg) : null;
    const link = wa || b?.bookingUrl || website || instagramUrl || (phones[0] ? `tel:${phones[0]}` : null);
    if (link) window.open(link, "_blank", "noopener,noreferrer");
  };

  const canReserve = Boolean(range.start && range.end && adultsNum >= 1);

  // ------- YORUMLAR + PUANLAMA -------
  const [tab, setTab] = useState("google"); // google | site
  const [gReviews, setGReviews] = useState({ rating: null, count: 0, reviews: [] });
  const [sReviews, setSReviews] = useState({ rating: null, count: 0, reviews: [] });
  const [revLoading, setRevLoading] = useState(false);
  const [myRating, setMyRating] = useState(0);
  const [myComment, setMyComment] = useState("");
  const ratedKey = b?._id ? `rated_${b._id}` : (slug ? `rated_${slug}` : null);
  const alreadyRated = !!(ratedKey && localStorage.getItem(ratedKey));

  useEffect(() => {
    if (!b) return;
    let mounted = true;
    (async () => {
      try {
        setRevLoading(true);

        const gTries = [
          b?.googlePlaceId ? `${API}/api/google/reviews?placeId=${b.googlePlaceId}` : null,
          `${API}/api/google/reviews/search?query=${encodeURIComponent(name + " " + (city || ""))}`
        ].filter(Boolean);
        for (const u of gTries) {
          try {
            const { data } = await axios.get(u, { timeout: 12000, withCredentials: true });
            const got = normalizeGoogleReviews(data);
            if (got) { if (!mounted) return; setGReviews(got); break; }
          } catch {}
        }

        const idOrSlug = b?._id || slug;
        const sTries = [
          `${API}/api/businesses/${idOrSlug}/reviews`,
          `${API}/api/reviews?business=${idOrSlug}`
        ];
        for (const u of sTries) {
          try {
            const { data } = await axios.get(u, { timeout: 12000, withCredentials: true });
            const got = normalizeSiteReviews(data);
            if (got) { if (!mounted) return; setSReviews(got); break; }
          } catch {}
        }
      } finally { if (mounted) setRevLoading(false); }
    })();
    return () => { mounted = false; };
  }, [b, API, slug, name, city]);

  const submitReview = async () => {
    if (!b) return;
    if (myRating < 1 || myRating > 5) return;
    try {
      const payload = { business: b._id || slug, rating: myRating, comment: myComment || undefined };
      const postUrls = [`${API}/api/reviews`, `${API}/api/businesses/${b._id || slug}/reviews`];
      for (const u of postUrls) { try { await axios.post(u, payload, { withCredentials: true, timeout: 12000 }); break; } catch {} }
      setSReviews((prev) => ({
        rating: calcAvg((prev.reviews || []).map(r=>r.rating).concat([myRating])),
        count: (prev.count || 0) + 1,
        reviews: [{ author:"Misafir", rating: myRating, text: myComment, date: new Date().toISOString() }, ...(prev.reviews||[])].slice(0,20)
      }));
      if (ratedKey) localStorage.setItem(ratedKey, "1");
      setMyRating(0); setMyComment("");
      alert("Değerlendirmeniz alındı. Teşekkürler!");
    } catch { alert("Gönderilemedi, lütfen tekrar deneyin."); }
  };

  // ------- UI -------
  return (
    <div style={st.page}>
      <style>{globalCSS}</style>

      <header style={st.head}>
        <button className="ghost" onClick={() => navigate(-1)}>← Geri</button>
        <div style={{flex:1}} />
        <nav style={{display:"flex", gap:18}}>
          <a className="lnk" href="/evler">Evler</a>
          <a className="lnk" href="/iletisim">İletişim</a>
        </nav>
      </header>

      <main style={st.container}>
        <div style={st.breadcrumb}>
          <a href="/" className="lnk">Ana sayfa</a>
          <span> / </span>
          <span>{name.toLowerCase()}</span>
        </div>

        <div style={st.grid}>
          {/* SOL */}
          <section style={st.left}>
            <Gallery images={images} />
            <div style={st.card}>
              <h1 style={st.title}>{name}</h1>
              <div style={st.metaRow}>
                {(city || district) && <span>{district ? `${district}, ` : ""}{city}</span>}
                <span>• 4 kişi</span><span>• 2 oda</span><span>• 1 banyo</span>
              </div>
              <div style={st.dots}>{Array.from({length:32}).map((_,i)=>(<i key={i}/>))}</div>

              {/* Açıklama alanı */}
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
              <div style={{margin:"4px 0 10px"}}>
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
                    onChange={(e)=>{
                      const raw = e.target.value;
                      const val = raw === "" ? "" : String(Math.max(0, parseInt(raw,10) || 0));
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
                    onChange={(e)=>{
                      const raw = e.target.value;
                      const val = raw === "" ? "" : String(Math.max(0, parseInt(raw,10) || 0));
                      setChildren(val);
                    }}
                  />
                </div>
              </div>

              {childrenNum > 0 && (
                <div style={{marginTop:6}}>
                  <label style={st.label}>Çocuk Yaşları</label>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
                    {Array.from({length: childrenNum}).map((_, i) => (
                      <select
                        key={i}
                        value={childAges[i] || ""}
                        onChange={(e)=>{
                          const v = e.target.value;
                          setChildAges(a => { const c=[...a]; c[i]=v; return c; });
                        }}
                        style={st.sel}
                      >
                        <option value="">Yaş</option>
                        {Array.from({length:18}).map((__,y)=>(
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    ))}
                  </div>
                </div>
              )}

              <button
                className="btn"
                style={{...st.reserveBtn, opacity: canReserve?1:.6, cursor: canReserve?"pointer":"not-allowed"}}
                onClick={reserve}
                disabled={!canReserve}
              >
                Rezervasyon Yap
              </button>
              <button
                className="btn"
                style={st.askBtn}
                onClick={()=>{
                  const link = instagramUrl || (phones[0]? toWa(phones[0], "Merhaba, bilgi almak istiyorum.") : null);
                  if (link) window.open(link,"_blank","noopener,noreferrer");
                }}
              >
                Soruların var mı?
              </button>
            </div>

            {/* İşletme Bilgileri */}
            <section style={st.infoCard}>
              <header style={st.infoHead}>İşletme Bilgileri</header>
              <div style={st.infoRow}>📱 {phones[0] ? <a href={`tel:${phones[0]}`} className="lnk">{phones[0]}</a> : "—"}</div>
              <div style={st.infoRow}>📷 {instagram ? <a href={instagramUrl} className="lnk" target="_blank" rel="noreferrer noopener">@{instagram}</a> : "—"}</div>
              <div style={st.infoRow}>🕸️ {website ? <a href={toHttps(website)} className="lnk" target="_blank" rel="noreferrer noopener">{website}</a> : "—"}</div>
              <div style={st.infoRow}>📍 {address || "—"}</div>
            </section>

            {/* Yorumlar + Puanlama */}
            <section style={st.reviews}>
              <header style={st.revHead}>
                <div style={{display:"flex", alignItems:"center", gap:8}}>
                  <Stars value={avgSafe(gReviews.rating, sReviews.rating)} />
                  <b>{avgSafe(gReviews.rating, sReviews.rating)?.toFixed?.(1) || "—"}</b>
                </div>
                <div className="tabs">
                  <button className={`tab ${tab==="google"?"sel":""}`} onClick={()=>setTab("google")}>Google</button>
                  <button className={`tab ${tab==="site"?"sel":""}`} onClick={()=>setTab("site")}>E-Doğrula</button>
                </div>
              </header>

              {revLoading ? <div className="skl" /> : (
                <>
                  {tab==="google" ? (
                    <ReviewList list={gReviews.reviews} empty="Google yorumu bulunamadı." />
                  ) : (
                    <>
                      <ReviewList list={sReviews.reviews} empty="Henüz yorum yok. İlk yorumu sen yaz!" />
                      <div style={st.rateBox}>
                        <div style={{display:"flex", alignItems:"center", gap:8}}>
                          <span style={{fontWeight:800}}>Değerlendir:</span>
                          <StarPicker value={myRating} onChange={alreadyRated?()=>{}:setMyRating} disabled={alreadyRated}/>
                          {alreadyRated && <span style={{opacity:.7, fontSize:12}}>teşekkürler, oy verdin ✓</span>}
                        </div>
                        <textarea
                          placeholder="İsteğe bağlı yorumun (maks. 400 karakter)"
                          maxLength={400}
                          value={myComment}
                          onChange={(e)=>setMyComment(e.target.value)}
                          style={st.ta}
                          disabled={alreadyRated}
                        />
                        <button className="btn"
                          onClick={submitReview}
                          disabled={alreadyRated || myRating<1}
                          style={st.okBtn}
                        >Gönder</button>
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

  const s = toDate(value.start);
  const e = toDate(value.end);

  const label = s
    ? `${fmtTR(value.start)} — ${e ? fmtTR(value.end) : "seçiniz"}`
    : "gg.aa.yyyy — gg.aa.yyyy";

  const days = buildMonth(view);

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
    <div style={{position:"relative"}}>
      <button className="ghost" onClick={()=>setOpen(o=>!o)} style={{width:"100%", textAlign:"left"}}>
        {label}
      </button>
      {open && (
        <div style={st.cal}>
          <div style={st.calHead}>
            <button className="ghost" onClick={()=>setView(prev=>addMonths(prev,-1))}>‹</button>
            <b>{view.toLocaleDateString("tr-TR", { month:"long", year:"numeric" })}</b>
            <button className="ghost" onClick={()=>setView(prev=>addMonths(prev,1))}>›</button>
          </div>
          <div style={st.wdays}>
            {["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"].map((w)=>(
              <div key={w}>{w}</div>
            ))}
          </div>
          <div style={st.gridDays}>
            {days.map((d,i)=>{
              const disabled = d.getMonth() !== view.getMonth() || d < today;
              const inRange = s && e && d > s && d < e;
              const isStart = s && sameDay(d, s);
              const isEnd   = e && sameDay(d, e);
              return (
                <button
                  key={i}
                  disabled={disabled}
                  onClick={()=>pick(d)}
                  className="ghost"
                  style={{
                    ...st.dbtn,
                    opacity: disabled ? .35 : 1,
                    background: isStart || isEnd ? "#111827" : inRange ? "#e5f3ff" : "var(--card)",
                    color: isStart || isEnd ? "#fff" : "inherit",
                    borderColor: isStart || isEnd ? "#111827" : "var(--border)",
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div style={{display:"flex", justifyContent:"space-between", marginTop:8}}>
            <button className="ghost" onClick={clear}>Temizle</button>
            <button className="ghost" onClick={()=>setOpen(false)}>Tamam</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Basit Galeri (kapak alanı) ---------------- */
function Gallery({ images = [] }) {
  const [idx, setIdx] = useState(0);
  const has = images.length > 0;

  const go = (d) => setIdx((i) => (i + d + images.length) % images.length);

  // klavye
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length]);

  // swipe
  const startRef = useRef(null);
  const onDown = (e) => { startRef.current = e.clientX; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const onUp = (e) => {
    if (startRef.current == null) return;
    const dx = e.clientX - startRef.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    startRef.current = null;
  };

  return (
    <div style={st.gal}>
      <div style={st.galMain} onPointerDown={onDown} onPointerUp={onUp}>
        {has ? (
          <img src={images[idx]} alt="" loading="lazy" style={st.galImg} />
        ) : (
          <div style={st.cover} />
        )}
        {has && (
          <>
            <button aria-label="Önceki" onClick={() => go(-1)} style={st.galBtnLeft}>‹</button>
            <button aria-label="Sonraki" onClick={() => go(1)} style={st.galBtnRight}>›</button>
          </>
        )}
      </div>

      {has && (
        <div style={st.galThumbs}>
          {images.slice(0, 8).map((src, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              style={{ ...st.thumb, outline: i === idx ? "2px solid #111827" : "1px solid var(--border)" }}
            >
              <img src={src} alt="" loading="lazy" style={st.thumbImg} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Yorum listesi & yıldızlar ---------------- */
function ReviewList({ list=[], empty }){
  if (!list.length) return <div style={{opacity:.75, fontSize:14, padding:"6px 2px"}}>{empty}</div>;
  return (
    <div style={{display:"grid", gap:10}}>
      {list.slice(0,5).map((r,i)=>(
        <div key={i} style={{border:"1px solid var(--border)", borderRadius:10, padding:10}}>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
            <strong>{r.author || r.user || "Kullanıcı"}</strong>
            <Stars value={r.rating} small />
          </div>
          {r.text && <p style={{margin:"6px 0 0", lineHeight:1.45}}>{r.text}</p>}
          {r.date && <div style={{opacity:.6, fontSize:12, marginTop:6}}>{fmtDate(r.date)}</div>}
        </div>
      ))}
    </div>
  );
}
function Stars({ value=0, small=false }){
  const v = Math.max(0, Math.min(5, Number(value)||0));
  return (
    <div style={{display:"inline-flex", gap:2}}>
      {Array.from({length:5}).map((_,i)=>(
        <span key={i} style={{fontSize: small?14:18, lineHeight:1}}>{i < Math.round(v) ? "★" : "☆"}</span>
      ))}
    </div>
  );
}
function StarPicker({ value=0, onChange=()=>{}, disabled }){
  return (
    <div style={{display:"inline-flex", gap:4, cursor: disabled? "not-allowed":"pointer", opacity: disabled? .6:1}}>
      {Array.from({length:5}).map((_,i)=>(
        <span key={i}
          onClick={()=>!disabled && onChange(i+1)}
          title={`${i+1}`}
          style={{fontSize:22, userSelect:"none"}}
        >{i < value ? "★" : "☆"}</span>
      ))}
    </div>
  );
}

/* ---------------- Yardımcılar ---------------- */
function normalizeGoogleReviews(data){
  if (!data) return null;
  const rating = Number(data.rating ?? data.averageRating ?? data.result?.rating);
  const count  = Number(data.count  ?? data.userRatingsTotal ?? data.result?.count) || (data.reviews?.length || 0);
  const arr    = data.reviews || data.result?.reviews || [];
  const reviews = arr.map(r => ({
    author: r.author_name || r.author || r.user || "Kullanıcı",
    text: r.text || r.comment || "",
    rating: Number(r.rating || r.stars || 0),
    date: r.time ? new Date(r.time*1000).toISOString() : (r.date || r.createdAt || null)
  }));
  if (!Number.isFinite(rating) && !reviews.length) return { rating:null, count:0, reviews:[] };
  return { rating, count, reviews };
}
function normalizeSiteReviews(data){
  if (!data) return null;
  const avg = Number(data.avg ?? data.average ?? data.rating);
  const total = Number(data.total ?? data.count ?? (data.reviews?.length||0));
  const list = (data.reviews || data.data || []).map(r=>({
    author: r.user?.name || r.author || "Kullanıcı",
    text: r.text || r.comment || "",
    rating: Number(r.rating || r.stars || 0),
    date: r.createdAt || r.date || null
  }));
  return { rating: Number.isFinite(avg)? avg : (list.length? calcAvg(list.map(x=>x.rating)) : null), count: total, reviews: list };
}
function calcAvg(nums){ const a = nums.map(Number).filter(n=>Number.isFinite(n)); return a.length? a.reduce((s,n)=>s+n,0)/a.length : 0; }
function avgSafe(a,b){ const arr = [a,b].map(Number).filter(n=>Number.isFinite(n) && n>0); return arr.length ? calcAvg(arr) : null; }

function slugToTitle(s){ return String(s||"").replace(/[-_]/g," ").replace(/\s+/g," ").trim().replace(/^./,c=>c.toUpperCase()); }
function toHttps(u){ return /^https?:\/\//i.test(u) ? u : `https://${u}`; }
function toDate(ymd){ if(!ymd) return null; const [y,m,d]=ymd.split("-").map(Number); const dt=new Date(y,m-1,d); return isNaN(dt)? null : dt; }
function toYmd(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function stripTime(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addMonths(d, n){ const nd=new Date(d); nd.setMonth(nd.getMonth()+n); return nd; }
function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function buildMonth(firstDay){
  const start = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1);
  const weekday = (start.getDay()+6)%7; // Pzt=0
  const days = [];
  const first = new Date(start); first.setDate(1 - weekday);
  for (let i=0;i<42;i++){ const d=new Date(first); d.setDate(first.getDate()+i); days.push(d); }
  return days;
}
function fmtTR(ymd){ const d=toDate(ymd); if(!d) return ""; return d.toLocaleDateString("tr-TR"); }
function toWa(phone, text){
  const digits = String(phone||"").replace(/\D/g, "");
  let intl = digits;
  if (digits.startsWith("0")) intl = "90" + digits.slice(1);
  if (digits.startsWith("90")) intl = digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text||"")}`;
}
function fmtDate(d){ const dt = new Date(d); return isNaN(dt)? "" : dt.toLocaleDateString("tr-TR", { day:"2-digit", month:"long", year:"numeric" }); }
function Loader(){ return (<div style={{marginTop:16}}><div className="skl" /><div className="skl" /><div className="skl" /></div>); }

/* ---------------- Stiller ---------------- */
const st = {
  page:{ background:"var(--bg)", color:"var(--fg)", minHeight:"100vh", fontFamily:"Inter, Segoe UI, Tahoma, sans-serif" },
  head:{ position:"sticky", top:0, zIndex:5, display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
         background:"var(--bg)", borderBottom:"1px solid var(--border)" },
  container:{ width:"min(1140px, 94vw)", margin:"14px auto 40px" },
  breadcrumb:{ margin:"10px 2px 14px", color:"var(--fg-3)", display:"flex", gap:6, alignItems:"center" },

  grid:{ display:"grid", gridTemplateColumns:"1fr 360px", gap:22, alignItems:"start" },

  left:{ minWidth:0 },
  cover:{ height:340, background:"#efe6d9", borderRadius:14, border:"1px solid var(--border)", boxShadow:"inset 0 2px 10px rgba(0,0,0,.04)" },

  // Galeri
  gal:{ display:"grid", gap:10 },
  galMain:{
    position:"relative",
    height:340,
    borderRadius:14,
    border:"1px solid var(--border)",
    overflow:"hidden",
    background:"#efe6d9",
    boxShadow:"inset 0 2px 10px rgba(0,0,0,.04)"
  },
  galImg:{ width:"100%", height:"100%", objectFit:"cover", display:"block" },
  galBtnLeft:{
    position:"absolute", left:8, top:"50%", transform:"translateY(-50%)",
    border:"1px solid var(--border)", background:"rgba(255,255,255,.85)",
    borderRadius:10, padding:"4px 10px", fontSize:20, cursor:"pointer"
  },
  galBtnRight:{
    position:"absolute", right:8, top:"50%", transform:"translateY(-50%)",
    border:"1px solid var(--border)", background:"rgba(255,255,255,.85)",
    borderRadius:10, padding:"4px 10px", fontSize:20, cursor:"pointer"
  },
  galThumbs:{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:8 },
  thumb:{ padding:0, background:"var(--card)", borderRadius:8, overflow:"hidden", height:58, cursor:"pointer" },
  thumbImg:{ width:"100%", height:"100%", objectFit:"cover", display:"block" },

  card:{ marginTop:14, border:"1px solid var(--border)", background:"var(--card)", borderRadius:14, boxShadow:"0 12px 32px rgba(0,0,0,.05)" },
  title:{ margin:"0 0 8px", padding:"12px 14px 0", fontSize:22, fontWeight:900 },
  metaRow:{ display:"flex", gap:10, flexWrap:"wrap", padding:"0 14px 10px", opacity:.85 },
  dots:{ display:"grid", gridTemplateColumns:"repeat(32, 1fr)", gap:4, padding:"0 14px 10px" },

  // Açıklama
  desc:{ padding:"6px 14px 14px" },
  descTitle:{ fontWeight:900, margin:"4px 0 6px", fontSize:16 },
  descText:{ margin:0, lineHeight:1.55, color:"var(--fg-2)" },

  right:{ position:"sticky", top:80, display:"grid", gap:14 },

  box:{ border:"1px solid var(--border)", background:"var(--card)", borderRadius:14, padding:14, boxShadow:"0 16px 40px rgba(0,0,0,.06)" },

  row2:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 },
  inputWrap:{ display:"grid", gap:6, margin:"10px 0" },
  label:{ fontWeight:800, fontSize:13 },

  nightsText:{ margin:"8px 0 4px", fontWeight:800, opacity:.8 },

  reserveBtn:{ width:"100%", background:"#0e3a2f", color:"#fff", border:"none", borderRadius:10, padding:"12px", fontWeight:900, marginTop:8 },
  askBtn:{ width:"100%", background:"#f6f8f9", color:"var(--fg)", border:"1px solid var(--border)", borderRadius:10, padding:"10px", fontWeight:800, marginTop:8 },
  sel:{ width:"100%", border:"1px solid var(--border)", background:"var(--card)", color:"var(--fg)", borderRadius:10, padding:"8px" },

  infoCard:{ border:"1px solid var(--border)", background:"var(--card)", borderRadius:14, padding:12 },
  infoHead:{ fontWeight:900, marginBottom:8 },
  infoRow:{ padding:"6px 4px", borderTop:"1px dashed var(--border)" },

  reviews:{ border:"1px solid var(--border)", background:"var(--card)", borderRadius:14, padding:12 },
  revHead:{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 },
  rateBox:{ borderTop:"1px solid var(--border)", marginTop:10, paddingTop:10 },
  ta:{ width:"100%", minHeight:70, padding:10, border:"1px solid var(--border)", borderRadius:10, background:"var(--card)", color:"var(--fg)", margin:"8px 0" },

  okBtn: { background:"#22c55e", color:"#fff", border:"none", borderRadius:10, padding:"10px 12px", fontWeight:800 },

  err: { marginTop:10, color:"#ef4444", fontWeight:700 },

  // Takvim
  cal:{ position:"absolute", zIndex:30, top:"calc(100% + 6px)", left:0, width:280, background:"var(--card)", border:"1px solid var(--border)", borderRadius:12, padding:10, boxShadow:"0 16px 40px rgba(0,0,0,.1)" },
  calHead:{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 },
  wdays:{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, fontSize:12, opacity:.8, marginBottom:4 },
  gridDays:{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 },
  dbtn:{ height:34, borderRadius:8, border:"1px solid var(--border)" },
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
