// frontend/src/pages/Search.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";

/* ================== Yardımcılar ================== */
function classifyQuery(raw) {
  const q = String(raw || "").trim();
  if (!q) return { ok: false, reason: "empty" };

  const igUrlRe = /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\/([A-Za-z0-9._]{1,30})(\/)?(\?.*)?$/i;
  const igUserRe = /^@?([A-Za-z0-9._]{1,30})$/;
  const phoneRe  = /^\+?[0-9 ()\-]{10,20}$/;
  const siteRe   = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}([:/?#].*)?$/i;

  if (igUrlRe.test(q)) {
    const username = q.replace(igUrlRe, "$4");
    return { ok:true, type:"ig_url", value:`https://instagram.com/${username}`, username, pretty:`https://instagram.com/${username}` };
  }
  if (igUserRe.test(q)) {
    const username = q.replace(/^@/,"");
    return { ok:true, type:"ig_username", value:username, username, pretty:`@${username}` };
  }
  if (siteRe.test(q)) {
    const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    return { ok:true, type:"website", value:url, pretty:url };
  }
  if (phoneRe.test(q)) {
    const digits = q.replace(/\D/g,"");
    const e164 = digits.startsWith("0") ? `+9${digits}` : `+${digits}`;
    return { ok:true, type:"phone", value:e164, pretty:e164 };
  }
  return { ok:false, reason:"Lütfen Instagram kullanıcı adı, Instagram URL’si, telefon numarası veya web sitesi girin." };
}
function useQueryQ() {
  const loc = useLocation();
  return new URLSearchParams(loc.search).get("q") || "";
}

/* ================== Sayfa ================== */
export default function Search() {
  const navigate = useNavigate();
  const qParam = useQueryQ();

  const [query, setQuery] = useState(qParam);
  const [result, setResult] = useState(null);
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const controllerRef = useRef(null);

  // Tema (sadece uyguluyoruz; UI’de güneş/ay yok)
  useEffect(() => {
    const saved = localStorage.getItem("theme") || "system";
    const root = document.documentElement;
    const sysDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const mode = saved === "system" ? (sysDark ? "dark" : "light") : saved;
    root.dataset.theme = mode;
  }, []);

  // çevrimdışı/çevrimiçi
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // URL q param ile başlangıç
  useEffect(() => { if (qParam && qParam !== query) setQuery(qParam); }, [qParam]); // eslint-disable-line

  // debounce ipucu
  useEffect(() => {
    const t = setTimeout(() => {
      if (!query) { setHint(""); return; }
      const cls = classifyQuery(query);
      setHint(cls.ok ? "" : cls.reason);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  // kısayollar
  const inputRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "k") { e.preventDefault(); inputRef.current?.focus(); }
      if (!e.ctrlKey && !e.metaKey && k === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault(); inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Web Speech API (sesle giriş)
  const [recState, setRecState] = useState("idle"); // idle | listening
  const recRef = useRef(null);
  const canVoice = typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
  const startVoice = () => {
    if (!canVoice || recState === "listening") return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "tr-TR";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results?.[0]?.[0]?.transcript || "";
      setQuery((q) => (q ? `${q} ${text}` : text));
    };
    rec.onend = () => setRecState("idle");
    rec.onerror = () => setRecState("idle");
    recRef.current = rec;
    setRecState("listening");
    rec.start();
  };
  const stopVoice = () => { recRef.current?.stop(); setRecState("idle"); };

  const doSearch = useCallback(async (raw) => {
    const cls = classifyQuery(raw ?? query);
    if (!cls.ok) { setHint(cls.reason === "empty" ? "" : cls.reason); setResult({status:"error"}); setShowModal(true); return; }
    setHint("");
    navigate({ search:`?q=${encodeURIComponent(cls.pretty || cls.value)}` }, { replace:true });

    controllerRef.current?.abort();
    controllerRef.current = new AbortController();

    try {
      setLoading(true);
      const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/api/businesses/search`, {
        params: { q: cls.value, type: cls.type }, signal: controllerRef.current.signal, timeout: 12000
      });
      setResult(data);
      setShowModal(true);
    } catch (e) {
      if (axios.isCancel?.(e)) return;
      setResult({ status:"error" }); setShowModal(true);
    } finally { setLoading(false); }
  }, [query, navigate]);

  const onKey = (e) => e.key === "Enter" && doSearch();

  // trendler + hızlı chip’ler (kırmızı kutulu alan)
  const trends = [
    "kule-sapanca.com",
    "@kulesapanca",
    "https://instagram.com/kulesapanca/",
    "+90532******",
    "otelsapanca.com",
  ];
  const quickChips = [
    "sapanca bungalov evleri",
    "kartepe bungalov evleri",
    "kocaeli bungalov evleri",
  ];

  const explorePlaces = [/sapanca/i, /kartepe/i, /kocaeli/i];
  const shouldOpenExplore = (txt) => {
    const t = String(txt || "").toLowerCase();
    const isPlace = explorePlaces.some((re) => re.test(t));
    const isLodging = /(bungalov|otel|konaklama)/i.test(t);
    return isPlace && isLodging;
  };
  const openChip = (val) => {
    if (shouldOpenExplore(val)) {
      navigate(`/ara?q=${encodeURIComponent(val)}&tab=all`);
    } else {
      setQuery(val);
      doSearch(val);
    }
  };

  // link kopyalama
  const copyLink = async () => {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    await navigator.clipboard.writeText(url.toString());
    flash("Bağlantı kopyalandı");
  };

  // toast
  const [toast, setToast] = useState("");
  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(""), 1400); };

  return (
    <div style={styles.page}>
      <style>{globalCSS}</style>
      <div className="bg-grid" aria-hidden />

      {/* IG/WA: sol alt */}
      <div style={styles.fabs}>
        <a href="https://instagram.com/edogrula" target="_blank" rel="noreferrer noopener" className="fab ig" aria-label="Instagram">IG</a>
        <a href="https://wa.me/905555555555" target="_blank" rel="noreferrer noopener" className="fab wa" aria-label="WhatsApp">WA</a>
      </div>

      {/* Üst nav (tema ikonları yok) */}
      <nav style={styles.topnav}>
        <button className="link ghost-pill" onClick={() => navigate("/apply")}>İşletmeni doğrula</button>
        <button className="link ghost-pill" onClick={() => navigate("/report")}>Şikayet et / Rapor et</button>
      </nav>

      {offline && (
        <div role="status" style={styles.offline}>Şu an çevrimdışısın — sonuçlar güncellenemeyebilir.</div>
      )}

      {/* Orta kolon */}
      <main style={styles.center}>
        <img src="/logo.png" alt="E-Doğrula" style={styles.logo} />

        {/* Arama + Hızlı Chip’ler (son aramalar yerine buraya geldi) */}
        <div className="stack">
          <div style={styles.searchBarWrap} role="search" className="glass">
            <span className="lead-icon">🔎</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="Instagram kullanıcı adı, Instagram URL’si, telefon numarası veya web sitesi…"
              aria-label="Arama"
              style={styles.searchInput}
            />

            {!!query && (
              <button className="ghost icon" aria-label="Temizle" onClick={() => setQuery("")} title="Temizle">✕</button>
            )}

            {canVoice && (
              <button
                className={`ghost icon ${recState === "listening" ? "recording" : ""}`}
                aria-label={recState === "listening" ? "Dinlemeyi durdur" : "Sesle yaz"}
                onClick={recState === "listening" ? stopVoice : startVoice}
                title="Sesle yaz"
              >
                {recState === "listening" ? "🎙️" : "🎤"}
              </button>
            )}

            <button
              className={`btn primary ${loading ? "loading" : ""}`}
              onClick={() => doSearch()}
              disabled={loading}
              aria-busy={loading}
              style={styles.searchBtn}
            >
              {loading ? <LoadingDots/> : "Sorgula"}
            </button>

            <button className="ghost icon" onClick={copyLink} title="Linki kopyala" aria-label="Linki kopyala">🔗</button>
          </div>

          {/* Hata/İpucu satırı */}
          <div style={styles.hint} aria-live="polite">{hint}</div>

          {/* >>> Yeni konum: hızlı arama chip'leri */}
          <div className="glass chips-wrap">
            {quickChips.map((c, i) => (
              <button key={i} className="chip xl" onClick={() => openChip(c)}>{c}</button>
            ))}
          </div>
        </div>

        {/* Trendler */}
        <section style={styles.trendsCard} className="glass">
          <header style={styles.trendsHeader}>
            <span style={{ fontWeight: 900, letterSpacing:.2 }}>Trend olan aramalar</span>
          </header>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {trends.map((t, i) => (
              <li key={i} style={styles.trendItem}>
                <button className="trend-btn" onClick={() => openChip(t)}>
                  <span className="trend-icon">↗</span>
                  <span>{t}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={{...styles.footerInner}} className="glass">
          <div style={styles.footerLinks}>
            <a className="foot" href="/kvkk">kvkk</a>
            <a className="foot" href="/gizlilik">gizlilik sözleşmesi</a>
            <a className="foot" href="/hakkimizda">hakkımızda</a>
            <a className="foot" href="/kariyer">kariyer / iş birliği</a>
          </div>
          <div style={{flex:1}} />
          <button className="btn info" onClick={() => navigate("/iletisim")} style={styles.contactBtn}>İletişim</button>
        </div>
      </footer>

      {/* Toast */}
      {toast && <div style={styles.toast} className="glass" role="status">{toast}</div>}

      {/* Sonuç Modalı */}
      {showModal && (
        <ResultModal onClose={() => setShowModal(false)}>
          <ResultCard result={result} />
        </ResultModal>
      )}
    </div>
  );
}

/* ================== Modal ================== */
function ResultModal({ children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onEsc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => { window.removeEventListener("keydown", onEsc); prev?.focus(); };
  }, [onClose]);

  return createPortal(
    <div onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={styles.overlay}>
      <div role="dialog" aria-modal="true" tabIndex={-1} ref={ref} style={styles.modal} className="glass modal">
        <button onClick={onClose} aria-label="Kapat" className="btn subtle close-x">✕</button>
        {children}
      </div>
    </div>,
    document.body
  );
}

/* ================== Sonuç Kartı ================== */
function ResultCard({ result }) {
  const navigate = useNavigate();
  if (!result) return null;

  const Row = ({ icon, children }) => (
    <div style={{ display:"flex", gap:10, alignItems:"center", margin:"6px 0" }}>
      <span style={{ width:22, textAlign:"center" }}>{icon}</span>
      <div style={{ color:"var(--fg-2)" }}>{children}</div>
    </div>
  );

  const header = (() => {
    if (result.status === "verified")  return { title:"Doğrulanmış İşletme",    color:"#27ae60", icon:<IconCheck/> };
    if (result.status === "blacklist") return { title:"Olası Dolandırıcı İşletme", color:"#e74c3c", icon:<IconWarn/> };
    if (result.status === "not_found") return { title:"Kayıt Bulunamadı",        color:"#f39c12", icon:<IconInfo/> };
    return { title:"Bir şeyler ters gitti", color:"#7f8c8d", icon:<IconInfo/> };
  })();

  const b = result.business || {};
  const slugOrId = b?.slug || b?._id || b?.id || b?.instagramUsername;
  const canOpenProfile = Boolean(slugOrId);

  return (
    <div>
      <div style={{ textAlign:"center", marginTop:8, marginBottom:12 }}>
        <div style={{
          display:"inline-flex", alignItems:"center", justifyContent:"center",
          width:96, height:96, borderRadius:"50%", marginBottom:10, color:"#fff",
          background: result.status==="verified"
            ? "radial-gradient(60px 60px at 50% 50%, #2ecc71 0%, #27ae60 60%)"
            : result.status==="blacklist"
            ? "radial-gradient(60px 60px at 50% 50%, #ff6b6b 0%, #e74c3c 60%)"
            : "radial-gradient(60px 60px at 50% 50%, #f6c25b 0%, #f39c12 60%)",
          boxShadow: "0 18px 60px rgba(0,0,0,.25)"
        }}>
          {header.icon}
        </div>
        <h2 style={{ fontSize:24, fontWeight:900, color:header.color, margin:0 }}>{header.title}</h2>
      </div>

      {result.status === "verified" && (
        <div style={styles.verifiedRow}>
          <div style={styles.verifiedLeft}>
            <div style={{ padding:"6px 6px 2px" }}>
              <Row icon={"🏷️"}><b>{b.name}</b> {b.type ? `(${b.type})` : null}</Row>
              {b.phone && <Row icon={"📱"}>
                <a href={`tel:${b.phone}`} style={{ color:"var(--brand)", fontWeight:600, textDecoration:"none" }}>{b.phone}</a>
              </Row>}
              {(b.instagramUrl || b.instagramUsername) && (
                <Row icon={"📷"}>
                  <a href={b.instagramUrl || `https://instagram.com/${b.instagramUsername}`} target="_blank" rel="noreferrer noopener" style={{ color:"var(--brand)", fontWeight:600, textDecoration:"none" }}>
                    {b.instagramUsername || b.instagramUrl}
                  </a>
                </Row>
              )}
              {b.website && (
                <Row icon={"🕸️"}>
                  <a href={/^https?:\/\//i.test(b.website) ? b.website : `https://${b.website}`} target="_blank" rel="noreferrer noopener" style={{ color:"var(--brand)", fontWeight:600, textDecoration:"none" }}>
                    {b.website}
                  </a>
                </Row>
              )}
              {b.address && <Row icon={"📍"}>{b.address}</Row>}
            </div>
          </div>

          <aside style={styles.verifyCtaCol}>
            <div style={styles.verifyCtaBox} className="glass">
              <div style={{fontWeight:900, fontSize:16, marginBottom:6}}>İşletmeyi İncele</div>
              <p style={{fontSize:14, opacity:.85, margin:"0 0 10px 0"}}>
                Profil sayfasında belgeler, yorumlar ve tüm detayları görün.
              </p>
              <button
                className="btn success wide"
                onClick={() => canOpenProfile && navigate(`/isletme/${encodeURIComponent(slugOrId)}`)}
                disabled={!canOpenProfile}
                style={{ width:"100%", borderRadius:12, padding:"10px 12px", fontWeight:900, opacity: canOpenProfile ? 1 : .7, cursor: canOpenProfile ? "pointer" : "not-allowed"}}
              >
                İşletmeyi İncele
              </button>
            </div>
          </aside>
        </div>
      )}

      {result.status === "blacklist" && (
        <div style={{ padding:"6px 6px 2px" }}>
          <Row icon={"🏷️"}><b>{b.name || "—"}</b></Row>
          {b.phone && <Row icon={"📱"}>{b.phone}</Row>}
          {(b.instagramUrl || b.instagramUsername) && <Row icon={"📷"}><span style={{ color:"#e74c3c", fontWeight:700 }}>{b.instagramUsername || b.instagramUrl}</span></Row>}
          {b.address && <Row icon={"📍"}>{b.address}</Row>}
          <div className="warn-box">
            ⚠️ Bu işletme kara listede. İşlem yapmadan önce dikkatli olun.
          </div>
          <div style={{ display:"flex", gap:10, marginTop:14 }}>
            <button
              className="btn danger"
              onClick={() => canOpenProfile && navigate(`/isletme/${encodeURIComponent(slugOrId)}`)}
              disabled={!canOpenProfile}
              style={{ padding:"10px 14px", borderRadius:10, fontWeight:800, opacity:canOpenProfile?1:.7, cursor:canOpenProfile?"pointer":"not-allowed" }}
            >
              Profili Aç
            </button>
          </div>
        </div>
      )}

      {result.status === "not_found" && (
        <div style={{ textAlign:"center", color:"var(--fg-2)", padding:"8px 8px 2px" }}>
          Bu aradığınız işletme veri tabanımızda bulunamadı.
          <div style={{ display:"flex", gap:10, justifyContent:"center", marginTop:16 }}>
            <LinkButton to="/apply" color="#27ae60">İşletmeni Doğrula</LinkButton>
            <LinkButton to="/report" color="#e74c3c">Dolandırıcılık İhbarı</LinkButton>
          </div>
        </div>
      )}

      {result.status === "error" && (
        <div style={{ textAlign:"center", color:"var(--fg-3)", paddingTop:6 }}>
          Üzgünüz, bir hata oluştu. Lütfen tekrar deneyin.
        </div>
      )}
    </div>
  );
}
function LinkButton({ to, color, children }) {
  const navigate = useNavigate();
  return (
    <button className="btn" onClick={() => navigate(to)} style={{ padding:"10px 14px", borderRadius:10, background:color, color:"#fff", fontWeight:800 }}>
      {children}
    </button>
  );
}

/* ================== İkonlar & Loading ================== */
function IconCheck(){return(<svg width="54" height="54" viewBox="0 0 24 24" fill="none"><path d="M20 7L9 18l-5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>);}
function IconWarn(){return(<svg width="54" height="54" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#fff" strokeWidth="2.2"/></svg>);}
function IconInfo(){return(<svg width="54" height="54" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="2.2"/><path d="M12 8h.01M11 12h1v4h1" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>);}
function LoadingDots(){return(<span className="dots"><i/><i/><i/></span>);}

/* ================== Stil ================== */
const styles = {
  page: { minHeight:"100vh", background:"var(--bg)", color:"var(--fg)", fontFamily:"Inter, Segoe UI, Tahoma, sans-serif", position:"relative", overflowX:"hidden" },
  fabs: { position:"fixed", bottom:18, left:16, display:"flex", gap:8, zIndex:40 },
  topnav: { position:"fixed", top:18, right:24, display:"flex", gap:12, zIndex:20, alignItems:"center" },

  offline: { position:"fixed", top:64, left:"50%", transform:"translateX(-50%)", background:"var(--warn-bg)", border:"1px solid #ffd6ba", color:"#ad3b12", padding:"8px 12px", borderRadius:12, zIndex:25 },

  center: { width:"100%", display:"flex", flexDirection:"column", alignItems:"center", marginTop:"clamp(16px, 6vh, 56px)", paddingBottom:110 },
  logo: { width: 340, maxWidth: "72vw", height: "auto", marginBottom: 14 },

  searchBarWrap: { display:"flex", alignItems:"center", gap:8, width:"min(820px, 94vw)", margin:"0 auto 8px", padding:"6px 8px", borderRadius:20, border:"1px solid var(--border)" },
  searchInput: {
    flex:1, height:56, padding:"0 18px", borderRadius:14,
    border:"1px solid transparent", background:"transparent",
    fontSize:16, outline:"none", color:"var(--fg)"
  },
  searchBtn: { height:48, padding:"0 20px", borderRadius:12, border:"none" },

  hint: { minHeight:24, width:"min(820px, 94vw)", color:"#ad3b12", background:"var(--warn-bg)", border:"1px solid #ffd6ba", padding:"6px 10px", borderRadius:12, fontWeight:600, margin:"6px auto 8px" },

  trendsCard: { width:"min(820px, 94vw)", marginTop:8, borderRadius:18, border:"1px solid var(--border)" },
  trendsHeader: { padding:"12px 16px", borderBottom:"1px solid var(--border)", color:"var(--fg)" },
  trendItem: { borderBottom:"1px solid var(--border)" },

  footer: { position:"fixed", left:"50%", transform:"translateX(-50%)", bottom:14, width:"min(980px, 96vw)", zIndex:10 },
  footerInner: { display:"flex", alignItems:"center", justifyContent:"center", gap:16, padding:"10px 12px", borderRadius:14 },
  footerLinks: { display:"flex", flexWrap:"wrap", gap:18, alignItems:"center", justifyContent:"center" },
  contactBtn: { borderRadius:999, color:"#fff", fontWeight:800, padding:"8px 14px", border:"none" },

  overlay: { position:"fixed", inset:0, background:"rgba(17,24,39,.45)", backdropFilter:"blur(3px)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16 },
  modal: { width:"100%", maxWidth:680, border:"1px solid var(--border)", borderRadius:22, padding:22, position:"relative", color:"var(--fg)" },

  verifiedRow: { display:"flex", gap:16, alignItems:"flex-start", flexWrap:"wrap", marginTop:6 },
  verifiedLeft: { flex:"1 1 300px", minWidth:260 },
  verifyCtaCol: { flex:"0 0 300px", minWidth:260 },
  verifyCtaBox: { border:"1px solid var(--border)", borderRadius:16, padding:16 },

  toast: { position:"fixed", bottom:92, left:"50%", transform:"translateX(-50%)", border:"1px solid var(--border)", padding:"8px 12px", borderRadius:12, zIndex:60 }
};

const globalCSS = `
:root {
  --bg: radial-gradient(1400px 900px at 20% -10%, #e6f0ff 0%, transparent 55%), radial-gradient(1200px 800px at 120% 10%, #ffe9e6 0%, transparent 50%), #ffffff;
  --card:#ffffffcc;
  --fg:#0f172a;
  --fg-2:#24324a;
  --fg-3:#475569;
  --border:#e5e7eb80;
  --brand:#2d8cf0;
  --muted:#f4f7fb80;
  --warn-bg:#fff5ec;
}
:root[data-theme="dark"]{
  --bg: radial-gradient(1200px 800px at -10% -20%, #0b132f 0%, transparent 55%), radial-gradient(1200px 800px at 120% 0%, #1b1530 0%, transparent 55%), #0b1220;
  --card:#0f172acc;
  --fg:#e5e7eb;
  --fg-2:#cbd5e1;
  --fg-3:#94a3b8;
  --border:#24324499;
  --brand:#4aa3ff;
  --muted:#142235cc;
  --warn-bg:#2b1b12;
}
* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); }

.bg-grid {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background-image:
    radial-gradient(currentColor 1px, transparent 1px),
    radial-gradient(currentColor 1px, transparent 1px);
  background-color: transparent;
  opacity: .05;
  background-position: 0 0, 12px 12px;
  background-size: 24px 24px;
  color: #000;
}

.stack { width: min(820px, 94vw); margin: 0 auto; }
.glass { backdrop-filter: blur(10px) saturate(120%); background: var(--card); box-shadow: 0 20px 40px rgba(0,0,0,.06); border: 1px solid var(--border); }
.lead-icon { margin-left:8px; opacity:.9 }
.btn { transition: all .2s ease; cursor: pointer; }
.btn.primary { background: linear-gradient(90deg, #2d8cf0, #5db2ff); color:#fff; font-weight:900; box-shadow: 0 10px 24px rgba(45,140,240,.35); }
.btn.primary:hover { transform: translateY(-1px); }
.btn.primary.loading { filter: saturate(.7); }
.btn.success { background: linear-gradient(90deg, #19b56f, #22c55e); color:#fff; }
.btn.danger { background: linear-gradient(90deg, #ef4444, #dc2626); color:#fff; }
.btn.info { background: linear-gradient(90deg, #0ea5e9, #38bdf8); }
.btn.subtle { background: var(--muted); border:1px solid var(--border); }
.btn.wide { width: 100%; }
.link { background: transparent; border: 0; color: var(--fg); font-weight: 800; cursor: pointer; }
.link:hover { text-decoration: underline; }
.ghost { background: transparent; color: var(--fg); border:1px solid var(--border); border-radius:12px; padding:8px 10px; cursor:pointer; }
.ghost.icon { width:48px; height:48px; display:flex; align-items:center; justify-content:center; border-radius:12px; }
.ghost.small { padding:6px 8px; border-radius:10px; font-weight:700; }
.ghost-pill { border-radius: 999px; padding: 8px 14px; }
.icon.recording { outline:2px solid #ef4444; }

.fab { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; font-weight: 900; color: #fff; text-decoration: none; box-shadow: 0 12px 28px rgba(0,0,0,.18); }
.fab.ig { background: linear-gradient(45deg,#fd1d1d,#fcb045); }
.fab.wa { background: #25D366; }

.chips-wrap { display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:center; border-radius:16px; padding:10px 12px; }
.chip { border:1px solid var(--border); background:transparent; color: var(--fg); border-radius:999px; padding:8px 12px; font-weight:800; cursor:pointer; }
.chip.xl { padding:10px 16px; font-size:14px; }
.chip:hover { background:rgba(0,0,0,.04); }
:root[data-theme="dark"] .chip:hover { background:rgba(255,255,255,.06); }

.trend-btn { width: 100%; display:flex; gap:10px; align-items:center; justify-content:flex-start; padding:12px 16px; background:transparent; border:0; text-align:left; cursor:pointer; color: var(--fg); }
.trend-btn:hover { background: rgba(0,0,0,.04); }
:root[data-theme="dark"] .trend-btn:hover { background: rgba(255,255,255,.06); }
.trend-icon { font-weight:900; width:16px; text-align:center; opacity:.7; }

.warn-box { margin-top:12px; background:var(--warn-bg); color:#c0392b; padding:10px 12px; border-radius:12px; font-weight:800; border:1px solid #fecaca; }

.modal.glass { border: 1px solid var(--border); }
.close-x { position:absolute; top:12px; right:12px; }

.dots { display:inline-flex; gap:6px; align-items:center; }
.dots i{ width:6px; height:6px; border-radius:50%; background:#fff; display:inline-block; animation: b 1s infinite ease-in-out; }
.dots i:nth-child(2){ animation-delay:.15s }
.dots i:nth-child(3){ animation-delay:.3s }
@keyframes b { 0%,80%,100%{ transform:scale(0.6); opacity:.7 } 40%{ transform:scale(1); opacity:1 } }

input:focus { outline: none; box-shadow: 0 0 0 3px rgba(45,140,240,.25); }

.foot { color: var(--fg-2); text-decoration: none; font-weight:700; }
.foot:hover { text-decoration: underline; }

/* ===== Mobil uyum ===== */
@media (max-width: 680px) {
  .ghost.icon { width:42px; height:42px; }
  .chip.xl { font-size:13px; padding:9px 14px; }
  .trend-btn { padding:10px 14px; }
}
@media (max-width: 520px) {
  .ghost-pill { padding:6px 10px; font-size:13px; }
  .chips-wrap { gap:8px; }
}
@media (prefers-reduced-motion: reduce){ *{ transition:none!important; animation:none!important; } }
`;
