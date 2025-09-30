import React, { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  FaInstagram,
  FaPhone,
  FaGlobe,
  FaCheck,
  FaStar,
  FaBuilding,
} from "react-icons/fa6";

/* ================== API Yapılandırması ================== */
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const api = axios.create({
  baseURL: API_BASE || undefined,
  withCredentials: true,
  timeout: 12000,
  headers: { Accept: "application/json" },
});

/* ================== Ana Sayfa Bileşeni (Main Page) ================== */
export default function SapancaBungalov() {
  const navigate = useNavigate();
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("rating");
  const [onlyVerified, setOnlyVerified] = useState(false);

  const { sponsoredItems, organicItems } = useMemo(() => {
    // Backend'den sponsorlu olarak işaretlenmiş verileri çekmek en doğrusu.
    // Şimdilik ilk 5 sonucu sponsorlu olarak varsayıyoruz.
    const sponsored = allItems.slice(0, 5);
    const organic = allItems.slice(5);
    return { sponsoredItems: sponsored, organicItems: organic };
  }, [allItems]);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/api/businesses/search", {
        params: { q: "sapanca", type: "text", limit: 50 },
      });
      const raw = response.data?.businesses || [];
      const normalized = raw
        .filter(b => b.type && b.type.toLowerCase().includes('bungalov'))
        .map((b) => ({
          id: b._id,
          name: b.name || "İsimsiz İşletme",
          slug: b.slug || b._id,
          verified: b.verified,
          summary: b.summary || b.description?.slice(0, 155) + '...' || "Açıklama mevcut değil.",
          address: b.address || "",
          phone: b.phone || "",
          website: b.website || "",
          instagramHandle: b.handle,
          instagramUrl: b.instagramUrl,
          rating: Number(b.rating ?? 0),
          reviews: Number(b.reviewsCount ?? 0),
          photo: b.gallery?.[0] || b.photo || "",
          type: b.type || "Bungalov",
        }));
      setAllItems(normalized);
    } catch (error) {
      console.error("Veri çekme hatası:", error);
      setAllItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const shownOrganic = useMemo(() => {
    let arr = [...organicItems];
    if (onlyVerified) arr = arr.filter((x) => x.verified);
    if (sort === "rating") arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    if (sort === "reviews") arr.sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
    return arr;
  }, [organicItems, sort, onlyVerified]);

  return (
    <>
      <PageStyles />
      <div className="page-container">
        <nav className="main-nav">
          <button className="nav-button" onClick={() => navigate("/apply")}>İşletmeni doğrula</button>
          <button className="nav-button" onClick={() => navigate("/report")}>Şikayet et / Rapor et</button>
        </nav>

        <main className="content-container">
          {loading ? (
            <SkeletonList />
          ) : allItems.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {sponsoredItems.length > 0 && (
                <section className="sponsored-section">
                  <h2 className="section-title">Öne Çıkan Tesisler</h2>
                  <div className="horizontal-scroll">
                    {sponsoredItems.map(item => <SponsoredCard key={item.id} business={item} />)}
                  </div>
                </section>
              )}

              {organicItems.length > 0 && (
                <section>
                  <header className="results-header">
                    <h2 className="section-title">Arama Sonuçları</h2>
                    <div className="filters">
                      <label className="filter-checkbox">
                        <input type="checkbox" checked={onlyVerified} onChange={(e) => setOnlyVerified(e.target.checked)} />
                        Sadece doğrulanmış
                      </label>
                      <select value={sort} onChange={(e) => setSort(e.target.value)} className="filter-select">
                        <option value="rating">Puan (yüksek)</option>
                        <option value="reviews">Yorum (çok)</option>
                      </select>
                    </div>
                  </header>
                  <div className="results-list">
                    {shownOrganic.map((b) => <ResultItem key={b.id} b={b} />)}
                  </div>
                </section>
              )}
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
    <div className="sponsored-card" onClick={() => business.slug && navigate(`/isletme/${encodeURIComponent(business.slug)}`)}>
      <div className="sponsored-image-wrapper">
        {business.photo ? (
          <img src={business.photo} alt={business.name} className="sponsored-image" />
        ) : (
          <div className="sponsored-image-fallback"><FaBuilding /></div>
        )}
        <span className="sponsored-tag">Sponsorlu</span>
      </div>
      <div className="sponsored-card-content">
        <h3 className="sponsored-title">{business.name}</h3>
        <p className="sponsored-location">{business.address.split(',')[0]}</p>
      </div>
    </div>
  );
}

function ResultItem({ b }) {
  const navigate = useNavigate();
  const onOpen = () => b.slug && navigate(`/isletme/${encodeURIComponent(b.slug)}`);

  return (
    <article className="result-item">
      <div>
        <div className="item-header">
          <div className="item-icon"><FaBuilding /></div>
          <div className="item-header-text">
            <span className="item-name-small">{b.name}</span>
            <span className="item-handle">{b.instagramHandle ? `@${b.instagramHandle}` : ''}</span>
          </div>
        </div>
        <a href={`/isletme/${encodeURIComponent(b.slug)}`} onClick={(e) => { e.preventDefault(); onOpen(); }} className="item-title-link">
          {b.name}
        </a>
        <div className="item-meta">
          {b.verified && <span className="badge-verified"><FaCheck /> Doğrulandı</span>}
          {b.rating > 0 ? (
            <span className="badge-rating"><FaStar /> {b.rating.toFixed(1)}</span>
          ) : (
            <span className="badge-muted"><FaStar /> Puan Yok</span>
          )}
          <span className="dot">•</span>
          <span>{b.type || "Bungalov"}</span>
        </div>
        <p className="item-summary">{b.summary}</p>
        <div className="item-links">
          {b.phone && <a href={`tel:${b.phone}`} className="item-link-button"><FaPhone /> Telefon</a>}
          {b.website && <a href={/^https?:\/\//i.test(b.website) ? b.website : `https://${b.website}`} target="_blank" rel="noreferrer noopener" className="item-link-button"><FaGlobe /> Web Sitesi</a>}
          {b.instagramUrl && <a href={b.instagramUrl} target="_blank" rel="noreferrer noopener" className="item-link-button"><FaInstagram /> Instagram</a>}
        </div>
      </div>
    </article>
  );
}

function SkeletonList() { /* ... bu component aynı kalabilir ... */ }
function EmptyState() { /* ... bu component aynı kalabilir ... */ }

// Sayfanın tüm stillerini içeren özel bileşen
function PageStyles() {
  return (
    <style>{`
      :root {
        --bg-color: #f8fafc;
        --card-bg: #ffffff;
        --text-color: #0f172a;
        --text-muted: #64748b;
        --border-color: #e2e8f0;
        --brand-blue: #2563eb;
        --verified-green: #16a34a;
        --star-yellow: #f59e0b;
      }
      .page-container {
        background-color: var(--bg-color);
        color: var(--text-color);
        font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
        min-height: 100vh;
      }
      .main-nav {
        position: sticky;
        top: 0;
        z-index: 10;
        background: rgba(248, 250, 252, 0.85);
        backdrop-filter: blur(8px);
        padding: 12px 24px;
        border-bottom: 1px solid var(--border-color);
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }
      .nav-button {
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        padding: 8px 16px;
        border-radius: 99px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .nav-button:hover {
        background: #f1f5f9;
        border-color: #cbd5e1;
      }
      .content-container {
        width: min(980px, 94vw);
        margin: 0 auto;
        padding: 32px 0 120px;
      }
      .section-title {
        font-size: 28px;
        font-weight: 700;
        color: #1e293b;
        margin-bottom: 20px;
        margin-top: 0;
      }
      
      /* Sponsorlu Alan */
      .sponsored-section {
        margin-bottom: 48px;
      }
      .horizontal-scroll {
        display: flex;
        gap: 20px;
        overflow-x: auto;
        padding-bottom: 20px;
        -webkit-overflow-scrolling: touch;
      }
      .horizontal-scroll::-webkit-scrollbar { display: none; }
      .horizontal-scroll { scrollbar-width: none; }
      
      .sponsored-card {
        flex: 0 0 240px;
        background: var(--card-bg);
        border-radius: 16px;
        border: 1px solid var(--border-color);
        overflow: hidden;
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .sponsored-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 10px 25px rgba(0,0,0,0.08);
      }
      .sponsored-image-wrapper {
        height: 150px;
        position: relative;
        background: var(--border-color);
      }
      .sponsored-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .sponsored-image-fallback {
        width: 100%; height: 100%; display: grid; place-items: center; font-size: 32px; color: var(--text-muted);
      }
      .sponsored-tag {
        position: absolute;
        top: 10px;
        left: 10px;
        background: rgba(0,0,0,0.6);
        color: #fff;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: bold;
      }
      .sponsored-card-content { padding: 12px; }
      .sponsored-title { font-size: 17px; font-weight: 600; margin: 0 0 4px; }
      .sponsored-location { font-size: 14px; color: var(--text-muted); margin: 0; }

      /* Organik Sonuçlar */
      .results-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        border-radius: 14px;
        border: 1px solid var(--border-color);
        background: var(--card-bg);
        margin-bottom: 20px;
      }
      .filters { display: flex; align-items: center; gap: 16px; }
      .filter-checkbox { display: inline-flex; gap: 8px; align-items: center; cursor: pointer; font-size: 14px; }
      .filter-select { background: none; border: none; font-size: 14px; font-weight: 500; cursor: pointer; }
      .results-list { display: grid; gap: 20px; }
      
      .result-item {
        background: var(--card-bg);
        padding: 20px;
        border-radius: 14px;
        border: 1px solid var(--border-color);
        transition: box-shadow 0.2s ease;
      }
      .result-item:hover {
        box-shadow: 0 8px 25px rgba(0,0,0,0.07);
      }
      .item-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
      .item-icon { width: 28px; height: 28px; border-radius: 50%; background: #eef2f7; display: grid; place-items: center; color: var(--text-muted); }
      .item-header-text { display: flex; flex-direction: column; }
      .item-name-small { font-size: 15px; color: var(--text-color); font-weight: 500; }
      .item-handle { font-size: 13px; color: var(--text-muted); }
      .item-title-link {
        font-size: 22px;
        font-weight: 500;
        color: var(--brand-blue);
        text-decoration: none;
        display: block;
        margin-bottom: 8px;
      }
      .item-title-link:hover { text-decoration: underline; }
      .item-summary { font-size: 15px; color: #334155; line-height: 1.6; margin: 8px 0 16px; }
      .item-meta { display: flex; gap: 12px; align-items: center; font-size: 14px; }
      .badge-verified { display: inline-flex; gap: 6px; align-items: center; color: var(--verified-green); font-weight: bold; }
      .badge-rating { display: inline-flex; gap: 4px; align-items: center; font-weight: bold; color: var(--star-yellow); }
      .badge-muted { display: inline-flex; gap: 4px; align-items: center; color: var(--text-muted); }
      .dot { color: var(--text-muted); }
      .item-links { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 16px; }
      .item-link-button {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        background: #f1f5f9;
        border: 1px solid transparent;
        padding: 6px 12px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        color: var(--text-muted);
        text-decoration: none;
        transition: all 0.2s ease;
      }
      .item-link-button:hover {
        background: #e2e8f0;
        color: var(--text-color);
      }
    `}</style>
  );
}