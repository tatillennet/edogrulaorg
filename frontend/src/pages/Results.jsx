// frontend/src/pages/Results.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** ------- küçük yardımcılar ------- **/
const useQP = (k, def = "") => {
  const loc = useLocation();
  return new URLSearchParams(loc.search).get(k) || def;
};
const toDisplayHost = (url) => {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
// kısa açıklama
const truncate = (s = "", n = 160) => {
  const txt = String(s || "").replace(/\s+/g, " ").trim();
  if (txt.length <= n) return txt;
  const cut = txt.slice(0, n);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut) + "…";
};

const Stars = ({ v = 0 }) => {
  const full = Math.floor(v);
  const half = v - full >= 0.5;
  return (
    <span aria-label={`${v} puan`}>
      {"★".repeat(full)}
      {half ? "☆" : ""}
      <span style={{ opacity: 0.4 }}>
        {"★".repeat(5 - full - (half ? 1 : 0))}
      </span>
    </span>
  );
};

/** ------- MOCK veri (fallback) ------- **/
function mockData(query) {
  const q = (query || "").toLowerCase();

  const sapancaPlaces = [
    {
      name: "Sapanca Alfa Suites&SPA Hotel",
      url: "/isletme/sapanca-alfa-suites-spa-hotel",
      image:
        "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=800&auto=format&fit=crop",
      rating: 9.3,
      votes: 563,
    },
    {
      name: "Doğada View",
      url: "/isletme/dogada-view",
      image:
        "https://images.unsplash.com/photo-1604139097035-0182a29c4b15?q=80&w=800&auto=format&fit=crop",
      rating: 9.1,
      votes: 186,
    },
    {
      name: "The Green Park Hotels & Resort – Sapanca",
      url: "/isletme/the-green-park-hotels-resort-sapanca",
      image:
        "https://images.unsplash.com/photo-1505691938895-1758d7feb511?q=80&w=800&auto=format&fit=crop",
      rating: 9.3,
      votes: 144,
    },
    {
      name: "Derin Irmak Bungalow",
      url: "/isletme/derin-irmak-bungalow",
      image:
        "https://images.unsplash.com/photo-1578894384010-5859cb14a5b1?q=80&w=800&auto=format&fit=crop",
      rating: 9.1,
      votes: 237,
    },
  ];

  const sapancaSerp = [
    {
      title: "Sapanca Konaklama Rehberi",
      url: "/isletme/sapanca-konaklama-rehberi",
      snippet:
        "Sapanca Bungalov Evleri 2025 fiyatları, konum ve imkanlar karşılaştırması. En uygun fiyatlarla hemen bungalov rezervasyonu yapın!",
      breadcrumbs: ["edogrula.org"],
    },
    {
      title: "Sapanca Bungalov Evleri ve Fiyatları 2025 - Tatilsepeti",
      url: "/isletme/tatilsepeti",
      snippet:
        "Sapanca’da doğayla iç içe bungalovlarda uygun fiyatlı konaklama seçeneklerini keşfedin.",
      breadcrumbs: ["edogrula.org"],
    },
  ];

  if (q.includes("sapanca")) {
    return {
      vertical: "lodging",
      location: "Sapanca",
      places: sapancaPlaces,
      results: sapancaSerp,
      suggestions: [],
      trending: [],
    };
  }

  const defaultRes = [
    {
      title: "E-Doğrula – Türkiye’nin Dijital Doğrulama Platformu",
      url: "/",
      snippet:
        "İşletmeler için Instagram/telefon/website doğrulaması, kara liste sorgulama ve ihbar mekanizması.",
      breadcrumbs: ["edogrula.org"],
    },
  ];
  return {
    vertical: "web",
    location: "",
    places: [],
    results: defaultRes,
    suggestions: [],
    trending: [],
  };
}

/** ------- (opsiyonel) API fetch + mock fallback ------- **/
async function getResults(query, tab) {
  try {
    const base = import.meta.env.VITE_API_URL;
    if (base) {
      const r = await fetch(
        `${base}/api/explore?q=${encodeURIComponent(query)}&tab=${encodeURIComponent(
          tab || "all"
        )}`,
        { headers: { "x-edogrula-client": "web" } }
      );
      if (r.ok) {
        const data = await r.json();
        if (data && (data.results || data.places)) return data;
      }
    }
  } catch {}
  return mockData(query);
}

/** ------- Sayfa ------- **/
export default function Results() {
  const navigate = useNavigate();
  const q = useQP("q");
  const tab = useQP("tab", "all"); // all | images | videos | news
  const [data, setData] = useState(() => mockData(q));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const d = await getResults(q, tab);
      if (alive) setData(d);
      setLoading(false);
    })();
    return () => (alive = false);
  }, [q, tab]);

  const inputRef = useRef(null);
  const submit = (val) => {
    const newQ = typeof val === "string" ? val : inputRef.current?.value || "";
    navigate(`/ara?q=${encodeURIComponent(newQ)}&tab=${tab}`);
  };

  const tabs = useMemo(
    () => [
      { key: "all", label: "Tümü" },
      { key: "images", label: "Görseller" },
      { key: "videos", label: "Videolar" },
      { key: "news", label: "Haberler" },
    ],
    []
  );
  const gotoTab = (k) => navigate(`/ara?q=${encodeURIComponent(q)}&tab=${k}`);

  // SPA içi/ dışı link yönlendirme (yerel ise aynı sekme)
  const open = (e, url) => {
    if (!url) return;
    const isLocal = url.startsWith("/");
    if (isLocal) {
      e.preventDefault();
      navigate(url);
    }
  };

  return (
    <div style={st.page}>
      <style>{css}</style>

      {/* üst çubuk */}
      <header style={st.topbar}>
        <div style={st.brand} onClick={() => navigate("/")}>
          <img src="/logo.png" alt="E-Doğrula" style={{ height: 30 }} />
        </div>
        <div style={st.search}>
          <input
            ref={inputRef}
            defaultValue={q}
            placeholder="Arama ya da URL…"
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={st.searchInput}
            aria-label="Arama"
          />
          {!!q && (
            <button className="gbtn" onClick={() => submit("")} title="Temizle">
              ✕
            </button>
          )}
          <button className="btn" onClick={() => submit()} style={{ padding: "10px 14px" }}>
            Sorgula
          </button>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="gbtn" onClick={() => navigate("/apply")} title="İşletmeni doğrula">
            🛡️
          </button>
          <button className="gbtn" onClick={() => navigate("/report")} title="Şikayet et">
            🚩
          </button>
        </div>
      </header>

      {/* sekmeler */}
      <nav style={st.tabs}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => gotoTab(t.key)}
            className={`tab ${tab === t.key ? "active" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* SADE DÜZEN: tek sütun */}
      <div style={st.body}>
        <main style={st.main}>
          {loading && <div className="loading">Yükleniyor…</div>}

          {/* Konaklama kart şeridi */}
          {data.vertical === "lodging" && data.places?.length > 0 && (
            <section className="places">
              <div className="placesHead">
                {data.location ? `${data.location} için konaklama seçenekleri` : "Konaklama"}
              </div>
              <div className="placesRow">
                {data.places.map((p, i) => (
                  <a
                    key={i}
                    className="placeCard"
                    href={p.url}
                    title={p.name}
                    onClick={(e) => open(e, p.url)}
                  >
                    <div className="placeImg">
                      {/* eslint-disable-next-line */}
                      <img src={p.image} alt="" />
                    </div>
                    <div className="placeTitle">{p.name}</div>
                    <div className="placeMeta">
                      {typeof p.rating === "number" && (
                        <>
                          <span className="score">
                            {p.rating?.toFixed(1)} <Stars v={(p.rating || 0) / 2} />
                          </span>
                          <span className="votes">({p.votes})</span>
                        </>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* organik sonuçlar */}
          <section className="serp">
            {data.results?.map((r, i) => (
              <article key={i} className="serpItem">
                <a
                  className="title"
                  href={r.url}
                  onClick={(e) => open(e, r.url)}
                  title={r.title}
                >
                  {r.title}
                </a>
                <div className="url">{toDisplayHost(r.url)}</div>
                {r.breadcrumbs && <div className="crumbs">{r.breadcrumbs.join(" ")}</div>}
                {typeof r.rating === "number" && (
                  <div className="rating">
                    <span className="score">{r.rating.toFixed(1)}</span>{" "}
                    <Stars v={r.rating} />{" "}
                    {typeof r.votes === "number" && <span className="votes">({r.votes})</span>}
                  </div>
                )}
                <p className="snippet">{truncate(r.snippet, 180)}</p>
              </article>
            ))}

            {!loading && (!data.results || data.results.length === 0) && (
              <div className="nores">
                Sonuç bulunamadı.
                <br />
                <button className="btn" onClick={() => submit(q)}>
                  Tekrar dene
                </button>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

/** ------- stiller ------- **/
const st = {
  page: {
    minHeight: "100vh",
    background: "#fff",
    color: "#0f172a",
    fontFamily: "Inter, system-ui, Segoe UI, Tahoma, sans-serif",
  },
  topbar: {
    height: 64,
    display: "grid",
    gridTemplateColumns: "220px 1fr 160px",
    alignItems: "center",
    gap: 16,
    padding: "8px 16px",
    position: "sticky",
    top: 0,
    zIndex: 50,
    background: "rgba(255,255,255,.8)",
    backdropFilter: "saturate(180%) blur(8px)",
    borderBottom: "1px solid #eef2f7",
  },
  brand: { cursor: "pointer", display: "flex", alignItems: "center", gap: 8 },
  search: { display: "flex", alignItems: "center", gap: 8 },
  searchInput: {
    flex: 1,
    height: 40,
    padding: "0 14px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "#fff",
    outline: "none",
    boxShadow: "0 1px 0 rgba(0,0,0,.04) inset",
  },
  tabs: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    borderBottom: "1px solid #eef2f7",
  },
  // SADE: tek sütun
  body: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 16,
    padding: 16,
    maxWidth: 1200,
    margin: "0 auto",
  },
  main: { minHeight: 400 },
};

const css = `
.btn{background:#2d8cf0;color:#fff;border:0;border-radius:999px;font-weight:800;cursor:pointer}
.gbtn{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;cursor:pointer}
.tab{background:#fff;border:1px solid #e5e7eb;border-radius:999px;padding:8px 12px;font-weight:700;cursor:pointer}
.tab.active{background:#0f172a;color:#fff;border-color:#0f172a}
.loading{padding:12px;font-weight:700}

.placesHead{font-weight:800;margin:6px 0 10px 2px}
.placesRow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.placeCard{display:flex;flex-direction:column;gap:6px;text-decoration:none;border:1px solid #eef2f7;border-radius:14px;overflow:hidden;background:#fff}
.placeCard:hover{box-shadow:0 10px 30px rgba(0,0,0,.06);transform:translateY(-1px)}
.placeImg{aspect-ratio:4/3;overflow:hidden;background:#f3f4f6}
.placeImg img{width:100%;height:100%;object-fit:cover}
.placeTitle{color:#111;font-weight:800;padding:0 10px}
.placeMeta{display:flex;gap:8px;align-items:center;color:#334155;font-size:12px;padding:0 10px 8px}
.score{font-weight:800}
.votes{opacity:.7}

.serp{display:flex;flex-direction:column;gap:16px;margin-top:16px}
.serpItem{padding:8px 4px;border-bottom:1px solid #f1f5f9}
.serpItem .title{font-size:18px;font-weight:800;text-decoration:none;color:#0f172a}
.serpItem .title:hover{text-decoration:underline}
.serpItem .url{color:#16a34a;font-weight:700;margin-top:2px}
.serpItem .crumbs{color:#64748b;font-size:12px;margin-top:2px}
.serpItem .rating{margin-top:6px;color:#0f172a}
.serpItem .snippet{color:#334155;margin-top:6px;line-height:1.6}
.nores{padding:18px;text-align:center}

@media (max-width:1200px){
  .placesRow{grid-template-columns:repeat(2,minmax(0,1fr))}
}
`;
