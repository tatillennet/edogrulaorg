// frontend/src/pages/SapancaBungalov.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { FaInstagram, FaPhone, FaGlobe, FaCheck, FaStar, FaBuilding } from "react-icons/fa6";

/* ================== API ================== */
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const api = axios.create({
  baseURL: API_BASE || undefined,
  withCredentials: true,
  timeout: 12000,
  headers: { Accept: "application/json" },
});

/* ================== Sayfa ================== */
export default function SapancaBungalov() {
  const navigate = useNavigate();

  // liste & metrik
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // sponsorlar
  const [featured, setFeatured] = useState([]);

  // filtre/sıralama
  const [sort, setSort] = useState("rating");   // "rating" | "reviews"
  const [onlyVerified, setOnlyVerified] = useState(false);

  // sayfalama
  const PER_PAGE = 20;
  const [page, setPage] = useState(1);

  // görsel fallback
  const DEFAULT_IMG = "/defaults/edogrula-default.webp.png";

  /* ---------- yardımcı: normalize ---------- */
  const normalize = useCallback((b) => {
    const descRaw =
      (b?.summary && String(b.summary).trim()) ||
      (b?.description && String(b.description).trim()) ||
      "";
    const summary =
      descRaw.length > 0
        ? descRaw.length > 180
          ? `${descRaw.slice(0, 180)}…`
          : descRaw
        : "Açıklama mevcut değil.";

    const rating = Number(b?.rating ?? 0);
    const reviews = Number(b?.reviewsCount ?? 0);
    const googleRating = Number(b?.googleRating ?? b?.google_rate ?? b?.google?.rating ?? 0);
    const googleReviews = Number(
      b?.googleReviewsCount ?? b?.google_reviews ?? b?.google?.reviewsCount ?? 0
    );

    const photo =
      (Array.isArray(b?.gallery) && b.gallery[0]) ||
      b?.photo ||
      DEFAULT_IMG;

    return {
      id: b?._id,
      slug: b?.slug || b?._id,
      name: b?.name || "İsimsiz İşletme",
      verified: !!b?.verified,
      address: b?.address || "Sapanca",
      phone: b?.phone || "",
      website: b?.website || "",
      instagramHandle: b?.handle || b?.instagramUsername || "",
      instagramUrl: b?.instagramUrl || "",
      type: b?.type || "Bungalov",
      photo,
      summary,
      rating,
      reviews,
      googleRating,
      googleReviews,
    };
  }, []);

  /* ---------- Sunucudan sayfalı çekme ---------- */
  const fetchServerPaged = useCallback(async () => {
    const { data } = await api.get("/api/businesses/filter", {
      params: {
        address: "Sapanca",
        type: "bungalov",          // backend filtreleyebiliyorsa
        page,
        perPage: PER_PAGE,
        onlyVerified,
        sort,                      // "rating" | "reviews"
      },
    });

    const raw = data?.items || [];
    const normalized = raw.map(normalize);
    setItems(normalized);
    setTotal(Number(data?.total ?? normalized.length));
  }, [page, onlyVerified, sort, normalize]);

  /* ---------- Sponsorlar (admin yönetimli) ---------- */
  const fetchFeatured = useCallback(async () => {
    try {
      // Beklenen endpoint sözleşmesi:
      // GET /api/featured?place=Sapanca&type=bungalov&limit=8
      const { data } = await api.get("/api/featured", {
        params: { place: "Sapanca", type: "bungalov", limit: 8 },
      });
      const arr = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      const normalized = arr.map(normalize).filter(Boolean);
      setFeatured(normalized.slice(0, 8));
    } catch {
      // endpoint yoksa sponsorları organikten türet (yalnızca 1. sayfada)
      setFeatured([]);
    }
  }, [normalize]);

  /* ---------- Fallback: geniş arama + client filtre ---------- */
  const fetchFallback = useCallback(async () => {
    const queries = ["sapanca", "sapanca bungalov", "sapanca bungalow"];
    const buckets = await Promise.all(
      queries.map((q) =>
        api
          .get("/api/businesses/search", { params: { q, type: "text", limit: 500 } })
          .then((r) => r.data?.businesses || [])
          .catch(() => [])
      )
    );
    const map = new Map();
    for (const b of [].concat(...buckets)) if (b?._id) map.set(b._id, b);
    const raw = Array.from(map.values());

    const filtered = raw.filter((b) => {
      const addr = (b?.address || "").toString();
      const inSapanca = /sapanca/i.test(addr) || /^sapanca$/i.test(addr);
      const t = (b?.type || "").toString().toLowerCase();
      const isBungalow = /bungalov|bungalow/.test(t);
      return inSapanca && isBungalow && (!onlyVerified || b?.verified);
    });

    const normalized = filtered.map(normalize);

    const score = (x) => (x.rating > 0 ? x.rating : x.googleRating || 0);
    const rev = (x) => (x.reviews > 0 ? x.reviews : x.googleReviews || 0);
    normalized.sort((a, b) => (sort === "reviews" ? rev(b) - rev(a) : score(b) - score(a)));

    setTotal(normalized.length);

    const start = (page - 1) * PER_PAGE;
    setItems(normalized.slice(start, start + PER_PAGE));

    // sponsor fallback (sadece 1. sayfa)
    if (page === 1 && featured.length === 0) {
      setFeatured(normalized.slice(0, 4));
    }
  }, [page, onlyVerified, sort, normalize, featured.length]);

  /* ---------- Yükleyiciler ---------- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchServerPaged(), fetchFeatured()]);
    } catch {
      await fetchFallback();
    } finally {
      setLoading(false);
    }
  }, [fetchServerPaged, fetchFeatured, fetchFallback]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // filtre/sıralama değişince ilk sayfaya dön
  useEffect(() => {
    setPage(1);
  }, [sort, onlyVerified]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // 1. sayfada sponsor varsa organikten düş
  const organicItems = useMemo(() => {
    if (page !== 1 || featured.length === 0) return items;
    // listeden featured ile çakışanları çıkar
    const featuredIds = new Set(featured.map((x) => x.id));
    return items.filter((x) => !featuredIds.has(x.id));
  }, [items, featured, page]);

  return (
    <>
      <PageStyles />
      <div className="page-shell">
        <nav className="main-nav">
          <button className="nav-button" onClick={() => navigate("/apply")}>
            İşletmeni doğrula
          </button>
          <button className="nav-button" onClick={() => navigate("/report")}>
            Şikayet et / Rapor et
          </button>
        </nav>

        <main className="content-container">
          {loading ? (
            <SkeletonList />
          ) : total === 0 && organicItems.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {page === 1 && featured.length > 0 && (
                <section className="sponsored-section">
                  <h2 className="section-title">Öne Çıkan Tesisler</h2>
                  <div className="horizontal-scroll">
                    {featured.map((it) => (
                      <SponsoredCard key={it.id} business={it} />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <header className="results-header">
                  <h2 className="section-title">Arama Sonuçları</h2>
                  <div className="filters">
                    <label className="filter-checkbox">
                      <input
                        type="checkbox"
                        checked={onlyVerified}
                        onChange={(e) => setOnlyVerified(e.target.checked)}
                      />
                      Sadece doğrulanmış
                    </label>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                      className="filter-select"
                    >
                      <option value="rating">Puan (yüksek)</option>
                      <option value="reviews">Yorum (çok)</option>
                    </select>
                  </div>
                </header>

                <div className="results-list">
                  {organicItems.map((b) => (
                    <ResultItem key={b.id} b={b} />
                  ))}
                </div>

                {totalPages > 1 && (
                  <Pagination page={page} total={totalPages} onChange={setPage} />
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </>
  );
}

/* ================== Alt Bileşenler ================== */
function SponsoredCard({ business }) {
  const navigate = useNavigate();
  return (
    <div
      className="sponsored-card"
      onClick={() =>
        business.slug && navigate(`/isletme/${encodeURIComponent(business.slug)}`)
      }
    >
      <div className="sponsored-image-wrapper">
        {business.photo ? (
          <img src={business.photo} alt={business.name} className="sponsored-image" />
        ) : (
          <div className="sponsored-image-fallback">
            <FaBuilding />
          </div>
        )}
        <span className="sponsored-tag">Sponsorlu</span>
      </div>
      <div className="sponsored-card-content">
        <h3 className="sponsored-title">{business.name}</h3>
        <p className="sponsored-location">{business.address?.split(",")[0]}</p>
      </div>
    </div>
  );
}

function ResultItem({ b }) {
  const navigate = useNavigate();
  const onOpen = () => b.slug && navigate(`/isletme/${encodeURIComponent(b.slug)}`);

  const hasEDogrula = b.rating > 0;
  const hasGoogle = b.googleRating > 0;

  return (
    <article className="result-item">
      <div>
        <div className="item-header">
          <div className="item-icon">
            <FaBuilding />
          </div>
          <div className="item-header-text">
            <span className="item-name-small">{b.name}</span>
            <span className="item-handle">{b.instagramHandle ? `@${b.instagramHandle}` : ""}</span>
          </div>
        </div>

        <a
          href={`/isletme/${encodeURIComponent(b.slug)}`}
          onClick={(e) => {
            e.preventDefault();
            onOpen();
          }}
          className="item-title-link"
        >
          {b.name}
        </a>

        <div className="item-meta">
          {b.verified && (
            <span className="badge-verified">
              <FaCheck /> Doğrulandı
            </span>
          )}

          {hasEDogrula ? (
            <span className="badge-rating">
              <FaStar /> {b.rating.toFixed(1)}
            </span>
          ) : (
            <span className="badge-muted">
              <FaStar /> E-Doğrula değerlendirme yok
            </span>
          )}

          {hasGoogle && (
            <span className="badge-google">
              Google <FaStar /> {b.googleRating.toFixed(1)}
            </span>
          )}

          {!hasEDogrula && !hasGoogle && <span className="badge-muted">Puan yok</span>}

          <span className="dot">•</span>
          <span>{b.type || "Bungalov"}</span>
        </div>

        <p className="item-summary">{b.summary}</p>

        <div className="item-links">
          {b.phone && (
            <a href={`tel:${b.phone}`} className="item-link-button">
              <FaPhone /> Telefon
            </a>
          )}
          {b.website && (
            <a
              href={/^https?:\/\//i.test(b.website) ? b.website : `https://${b.website}`}
              target="_blank"
              rel="noreferrer noopener"
              className="item-link-button"
            >
              <FaGlobe /> Web Sitesi
            </a>
          )}
          {b.instagramUrl && (
            <a
              href={b.instagramUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="item-link-button"
            >
              <FaInstagram /> Instagram
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

/* ---------- Basit sayfalama ---------- */
function Pagination({ page, total, onChange }) {
  const win = 2;
  const pages = [];
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || (p >= page - win && p <= page + win)) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }
  return (
    <div className="pager">
      <button className="pager-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹ Önceki
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`gap-${i}`} className="pager-gap">
            …
          </span>
        ) : (
          <button
            key={p}
            className={`pager-num ${p === page ? "active" : ""}`}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        )
      )}
      <button className="pager-btn" disabled={page >= total} onClick={() => onChange(page + 1)}>
        Sonraki ›
      </button>
    </div>
  );
}

/* ---------- Skeleton & Empty ---------- */
function SkeletonList() {
  return (
    <div className="results-list">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="result-item skeleton" />
      ))}
    </div>
  );
}
function EmptyState() {
  return <div className="result-item">Sonuç bulunamadı.</div>;
}

/* ================== Stiller ================== */
function PageStyles() {
  return (
    <style>{`
      :root{
        --bg-color:#f8fafc; --card-bg:#fff; --text-color:#0f172a; --text-muted:#64748b;
        --border-color:#e2e8f0; --brand-blue:#2563eb; --verified-green:#16a34a; --star-yellow:#f59e0b;
      }

      /* Sol hizalı "pro" iskelet */
      .page-shell{ background:var(--bg-color); color:var(--text-color); min-height:100vh; }
      .main-nav{ position:sticky; top:0; z-index:10; background:rgba(248,250,252,.85);
        backdrop-filter:blur(8px); padding:12px 24px; border-bottom:1px solid var(--border-color);
        display:flex; justify-content:flex-end; gap:12px; }
      .nav-button{ background:var(--card-bg); border:1px solid var(--border-color); padding:8px 16px;
        border-radius:999px; font-weight:700; cursor:pointer; }
      .nav-button:hover{ background:#f1f5f9; border-color:#cbd5e1; }

      /* SOLA HİZA: solda sabit boşluk, sağda esneme */
      .content-container{
        max-width: 1200px;
        margin-left: clamp(14px, 3.2vw, 32px);
        margin-right: auto;
        padding: 28px 0 120px;
      }

      .section-title{ font-size:28px; font-weight:800; color:#1e293b; margin:0 0 18px; }

      /* Sponsorlar */
      .sponsored-section{ margin-bottom:36px; }
      .horizontal-scroll{ display:flex; gap:18px; overflow-x:auto; padding: 4px 0 16px;
        -webkit-overflow-scrolling:touch; }
      .horizontal-scroll::-webkit-scrollbar{ display:none; } .horizontal-scroll{ scrollbar-width:none; }

      .sponsored-card{ flex:0 0 260px; background:var(--card-bg); border-radius:16px;
        border:1px solid var(--border-color); overflow:hidden; cursor:pointer;
        transition: transform .2s, box-shadow .2s; }
      .sponsored-card:hover{ transform:translateY(-4px); box-shadow:0 14px 28px rgba(0,0,0,.08); }
      .sponsored-image-wrapper{ height:150px; position:relative; background:#eef2f7; }
      .sponsored-image{ width:100%; height:100%; object-fit:cover; }
      .sponsored-image-fallback{ width:100%; height:100%; display:grid; place-items:center;
        font-size:34px; color:var(--text-muted); }
      .sponsored-tag{ position:absolute; top:10px; left:10px; background:rgba(0,0,0,.6); color:#fff;
        padding:4px 8px; border-radius:6px; font-size:11px; font-weight:800; letter-spacing:.2px; }
      .sponsored-card-content{ padding:12px; }
      .sponsored-title{ font-size:17px; font-weight:800; margin:0 0 4px; }
      .sponsored-location{ font-size:14px; color:var(--text-muted); margin:0; }

      /* Filtre barı */
      .results-header{ display:flex; align-items:center; justify-content:space-between; gap:12px;
        padding:12px 16px; border-radius:14px; border:1px solid var(--border-color);
        background:var(--card-bg); margin-bottom:18px; }
      .filters{ display:flex; align-items:center; gap:16px; }
      .filter-checkbox{ display:inline-flex; gap:8px; align-items:center; cursor:pointer; font-size:14px; }
      .filter-select{ background:none; border:none; font-size:14px; font-weight:700; cursor:pointer; }

      /* Sonuç listesi */
      .results-list{ display:grid; gap:18px; }
      .result-item{ background:var(--card-bg); padding:18px; border-radius:14px;
        border:1px solid var(--border-color); transition: box-shadow .2s; }
      .result-item:hover{ box-shadow:0 10px 24px rgba(0,0,0,.06); }
      .result-item.skeleton{ height:120px; background:linear-gradient(90deg,#f3f4f6,#eef2f7,#f3f4f6);
        background-size:200% 100%; animation:shimmer 1.2s infinite; }
      @keyframes shimmer{ 0%{background-position:0 0} 100%{background-position:-200% 0} }

      .item-header{ display:flex; align-items:center; gap:8px; margin-bottom:2px; }
      .item-icon{ width:28px; height:28px; border-radius:50%; background:#eef2f7; display:grid;
        place-items:center; color:var(--text-muted); }
      .item-header-text{ display:flex; flex-direction:column; }
      .item-name-small{ font-size:15px; font-weight:700; }
      .item-handle{ font-size:13px; color:var(--text-muted); }
      .item-title-link{ font-size:22px; font-weight:800; color:var(--brand-blue); text-decoration:none;
        display:block; margin:4px 0 8px; }
      .item-title-link:hover{ text-decoration:underline; }

      .item-summary{ font-size:15px; color:#334155; line-height:1.6; margin:8px 0 14px; }
      .item-meta{ display:flex; gap:12px; align-items:center; font-size:14px; flex-wrap:wrap; }
      .badge-verified{ display:inline-flex; gap:6px; align-items:center; color:var(--verified-green);
        font-weight:900; }
      .badge-rating{ display:inline-flex; gap:6px; align-items:center; color:var(--star-yellow);
        font-weight:900; }
      .badge-google{ display:inline-flex; gap:6px; align-items:center; background:#f1f5f9;
        border:1px solid var(--border-color); padding:2px 8px; border-radius:999px; font-weight:800; }
      .badge-muted{ display:inline-flex; gap:6px; align-items:center; color:var(--text-muted); }
      .dot{ color:var(--text-muted); }

      .item-links{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:14px;
        border-top:1px solid var(--border-color); padding-top:14px; }
      .item-link-button{ display:inline-flex; gap:8px; align-items:center; background:#f1f5f9;
        border:1px solid transparent; padding:6px 12px; border-radius:8px; font-size:14px;
        font-weight:700; color:var(--text-muted); text-decoration:none; transition:.2s; }
      .item-link-button:hover{ background:#e2e8f0; color:var(--text-color); }

      /* Pager */
      .pager{ margin:22px 0 0; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
      .pager-btn{ padding:8px 12px; border-radius:8px; border:1px solid var(--border-color);
        background:#fff; cursor:pointer; }
      .pager-btn[disabled]{ opacity:.6; cursor:not-allowed; }
      .pager-num{ width:40px; height:40px; border-radius:999px; border:1px solid var(--border-color);
        background:#fff; cursor:pointer; }
      .pager-num.active{ background:#1f2937; color:#fff; border-color:#1f2937; }
      .pager-gap{ padding:0 4px; color:var(--text-muted); }
    `}</style>
  );
}
