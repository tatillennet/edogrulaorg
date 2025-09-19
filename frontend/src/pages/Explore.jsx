// frontend/src/pages/Explore.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/* ---------------- helpers ---------------- */
function useQP(name){ const {search}=useLocation(); return useMemo(()=>new URLSearchParams(search).get(name)||"",[search,name]); }
function getDomain(u){ try{ return new URL(u).hostname.replace(/^www\./,""); }catch{ return ""; } }
function getFavicon(u){ const d=getDomain(u); return d?`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`:""; }

/* ---- TEMP: sonuçları kapalı tut ----
   Backend hazır olduğunda burayı gerçek API çağrısıyla değiştirin. */
async function fetchResultsDisabled(/* query, tab */){
  return { type: "web", related: [], items: [] };
}

/* ---------------- page ---------------- */
export default function Explore(){
  const navigate = useNavigate();
  const qParam    = useQP("q");

  const [query, setQuery]     = useState(qParam);
  const [tab, setTab]         = useState("all");
  const [results, setResults] = useState({ type:"web", related:[], items:[] });
  const [loading, setLoading] = useState(false);
  const [shadow, setShadow]   = useState(false);
  const inputRef = useRef(null);

  useEffect(()=> setQuery(qParam), [qParam]);
  useEffect(()=>{
    const on = () => setShadow(window.scrollY>4);
    on(); window.addEventListener("scroll", on);
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(()=>{ run(qParam, tab); /* eslint-disable-next-line */}, [qParam, tab]);

  const run = async (q=qParam, t=tab) => {
    setLoading(true);
    const data = await fetchResultsDisabled(q, t==="all" ? "web" : t);
    setResults(data);
    setLoading(false);
  };

  const submit = () => {
    const v = query.trim();
    if(!v) return;
    navigate(`/ara?q=${encodeURIComponent(v)}`);
  };
  const onKey = (e) => e.key==="Enter" && submit();

  const suggestions = [
    "sapanca bungalov evleri",
    "kartepe bungalov evleri",
    "kocaeli bungalov evleri",
    "instagram doğrulama",
    "otel yorumları güvenilir mi",
    "işletme telefonu sorgula",
  ];

  return (
    <div className="xp-page">
      <style>{css}</style>

      {/* header */}
      <header className={`xp-header ${shadow?"withShadow":""}`}>
        <div className="xp-head-inner">
          <a href="/" className="xp-logo" aria-label="E-Doğrula"><img src="/logo.png" alt="E-Doğrula" /></a>
          <div className="xp-search">
            <input
              ref={inputRef}
              value={query}
              onChange={e=>setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="Aramak için yazın…"
              aria-label="Arama"
            />
            {query && <button className="icon ghost" onClick={()=>setQuery("")} aria-label="Temizle">✕</button>}
            <button className="btn solid" onClick={submit}>Sorgula</button>
          </div>
          <nav className="xp-tabs">
            <button className={`pill ${tab==="all"?"sel":""}`}     onClick={()=>setTab("all")}>Tümü</button>
            <button className={`pill ${tab==="images"?"sel":""}`}  onClick={()=>setTab("images")}>Görseller</button>
            <button className={`pill ${tab==="videos"?"sel":""}`}  onClick={()=>setTab("videos")}>Videolar</button>
            <button className={`pill ${tab==="news"?"sel":""}`}    onClick={()=>setTab("news")}>Haberler</button>
          </nav>
        </div>
      </header>

      {/* layout: sol öneriler + sonuç alanı */}
      <div className="xp-container two">
        <aside className="rail left">
          <section className="card">
            <div className="card-head">Öneriler</div>
            <ul className="list">
              {suggestions.map((s,i)=>(
                <li key={i}>
                  <button className="row" onClick={()=>navigate(`/ara?q=${encodeURIComponent(s)}`)}>
                    <span className="i">🔎</span><span>{s}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <main className="xp-main">
          {/* loader */}
          {loading && (
            <div className="skeletons">
              {[...Array(4)].map((_,i)=>(
                <div key={i} className="sk-row">
                  <div className="sk-title shimmer" />
                  <div className="sk-meta shimmer" />
                  <div className="sk-snippet shimmer" />
                </div>
              ))}
            </div>
          )}

          {/* boş durum */}
          {!loading && results.items.length===0 && (
            <div className="empty">
              <div className="h">Şimdilik sonuç gösterilmiyor</div>
              <div className="m">Backend bağlandığında bu alan otomatik dolacak.</div>
              <button className="btn ghost" onClick={()=>run()}>Yenile</button>
            </div>
          )}

          {/* (Not: Sonuç listesi kasıtlı olarak kapalı) */}
        </main>
      </div>

      <button className="toTop" onClick={()=>window.scrollTo({top:0,behavior:"smooth"})} aria-label="Başa dön">↑</button>
    </div>
  );
}

/* ---------------- styles (aynı) ---------------- */
const css = `
:root{
  --bg: var(--bg, #ffffff);
  --card: var(--card, #ffffff);
  --fg: var(--fg, #0f172a);
  --fg2: var(--fg-2, #24324a);
  --muted: var(--muted, #f1f5f9);
  --border: var(--border, #e5e7eb);
  --brand: var(--brand, #2d8cf0);
}
.xp-page{min-height:100vh;background:var(--bg);color:var(--fg);font-family:Inter, Segoe UI, Tahoma, sans-serif}
.btn{cursor:pointer;transition:.2s}.btn.solid{background:var(--brand);color:#fff;border:none;border-radius:999px;padding:10px 16px;font-weight:800}
.btn.ghost{background:var(--card);color:var(--fg);border:1px solid var(--border);border-radius:10px;padding:8px 10px}
.icon{border:1px solid var(--border);border-radius:10px;background:var(--card);padding:8px 10px}
.xp-header{position:sticky;top:0;z-index:20;backdrop-filter:saturate(160%) blur(8px);background:color-mix(in oklab, var(--bg) 80%, transparent);border-bottom:1px solid color-mix(in oklab, var(--border) 70%, transparent)}
.xp-header.withShadow{box-shadow:0 8px 24px rgba(0,0,0,.08)}
.xp-head-inner{max-width:1100px;margin:0 auto;padding:12px 14px;display:grid;grid-template-columns:160px 1fr auto;gap:12px;align-items:center}
.xp-logo img{height:38px}
.xp-search{display:flex;align-items:center;gap:8px}
.xp-search input{flex:1;height:44px;border-radius:999px;border:1px solid var(--border);background:var(--card);color:var(--fg);padding:0 16px;outline:none}
.xp-tabs{display:flex;gap:8px;align-items:center}
.pill{background:var(--card);border:1px solid var(--border);border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer}
.pill.sel{background:var(--brand);color:#fff;border-color:var(--brand)}
.xp-container.two{max-width:1100px;margin:14px auto;padding:0 12px;display:grid;gap:16px;grid-template-columns:260px minmax(0,1fr)}
.rail .card{border:1px solid var(--border);background:var(--card);border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.04);overflow:hidden}
.card-head{padding:12px 14px;border-bottom:1px solid var(--border);font-weight:900}
.list{margin:0;padding:0;list-style:none}
.list li{border-bottom:1px solid var(--border)}
.row{width:100%;display:flex;gap:10px;align-items:center;justify-content:flex-start;padding:10px 12px;background:transparent;border:0;text-align:left;cursor:pointer;color:var(--fg)}
.row:hover{background:color-mix(in oklab, var(--muted) 60%, transparent)}
.row .i{width:18px;text-align:center;opacity:.8}
.skeletons .sk-row{border:1px solid var(--border);background:var(--card);border-radius:14px;padding:14px;margin-bottom:10px}
.shimmer{background:linear-gradient(90deg, rgba(0,0,0,.04), rgba(0,0,0,.08), rgba(0,0,0,.04));background-size:200% 100%;animation:sh 1.1s infinite linear;border-radius:8px}
.sk-title{height:18px;width:60%;margin-bottom:8px}
.sk-meta{height:12px;width:30%}
.sk-snippet{height:42px;width:90%;margin-top:10px}
@keyframes sh{0%{background-position:0 0}100%{background-position:200% 0}}
.empty{display:grid;place-items:center;padding:48px 0;color:#475569}
.empty .h{font-weight:900;margin-bottom:4px}
.empty .m{margin-bottom:10px}
.toTop{position:fixed;right:18px;bottom:18px;border:1px solid var(--border);background:var(--card);color:var(--fg);width:40px;height:40px;border-radius:50%;cursor:pointer;box-shadow:0 10px 24px rgba(0,0,0,.12)}
@media (max-width: 980px){
  .xp-head-inner{grid-template-columns:140px 1fr;grid-template-rows:auto auto}
  .xp-tabs{grid-column:1/3;justify-content:center}
  .xp-container.two{grid-template-columns:minmax(0,1fr);max-width:900px}
  .rail.left{order:2}
  .xp-main{order:1}
}
`;
