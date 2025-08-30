import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function Search() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);   // { status: "verified" | "blacklist" | "not_found" | "error", business? }
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async () => {
    if (!query.trim()) return;
    try {
      setLoading(true);
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/businesses/search?q=${encodeURIComponent(query.trim())}`
      );
      setResult(res.data);
      setShowModal(true);
    } catch (err) {
      console.error("Search error:", err);
      setResult({ status: "error" });
      setShowModal(true);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = useCallback(() => setShowModal(false), []);

  // ESC ile modal kapama
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && closeModal();
    if (showModal) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showModal, closeModal]);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(1200px 600px at 20% 10%, rgba(93, 173, 226,.18), transparent 60%), radial-gradient(900px 500px at 80% 90%, rgba(39, 174, 96,.15), transparent 60%), linear-gradient(180deg,#f7fbff 0%, #f3f6f9 100%)",
        fontFamily: "Inter, Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
      }}
    >
      {/* küçük CSS enjekte edelim (animasyonlar) */}
      <style>{`
        @keyframes glow {
          0% { box-shadow: 0 0 0 rgba(46, 204, 113, 0.0); }
          100% { box-shadow: 0 12px 40px rgba(46, 204, 113, .35); }
        }
        @keyframes pop {
          0% { transform: scale(.95); opacity: .0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .hover-lift:hover { transform: translateY(-1px); box-shadow: 0 10px 22px rgba(0,0,0,.08); }
        .btn { transition: all .2s ease; cursor: pointer; border: none; }
        .chip { font-size: 12px; padding: 4px 10px; border-radius: 999px; background:#eef3f7; color:#2c3e50; font-weight:600; }
      `}</style>

      {/* Başlık */}
      <h1
        style={{
          fontSize: 54,
          fontWeight: 900,
          letterSpacing: -0.5,
          color: "#1f2d3d",
          marginBottom: 10,
        }}
      >
        E-Doğrula
      </h1>

      {/* Açıklama */}
      <div
        style={{
          width: "100%",
          maxWidth: 780,
          background: "#fff",
          borderRadius: 18,
          padding: "20px 26px",
          boxShadow: "0 12px 30px rgba(16,24,40,.06)",
          marginBottom: 22,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
          <span className="chip">Nasıl çalışır?</span>
        </div>
        <div style={{ color: "#495057", lineHeight: 1.8, fontSize: 16 }}>
          • İşletme adını, <b>Instagram kullanıcı adını</b>, <b>telefon numarasını</b> veya
          <b> Instagram profil URL’sini</b> arama kutusuna yazın. <br />
          • Kayıtlı ise doğrulanmış bilgileri görürsünüz. <br />
          • Kayıtlı değilse ya da kara listede ise şık bir uyarı popup’ı açılır.
        </div>
      </div>

      {/* Arama Kutusu */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          width: "100%",
          maxWidth: 700,
          gap: 12,
          marginBottom: 14,
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="İşletme adı, Instagram kullanıcı adı, telefon veya URL..."
          style={{
            flex: 1,
            padding: "16px 22px",
            borderRadius: 14,
            border: "1px solid #dfe5ec",
            fontSize: 16,
            outline: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,.04) inset",
          }}
        />

        <button
          className="btn hover-lift"
          onClick={handleSearch}
          disabled={loading}
          style={{
            padding: "14px 22px",
            borderRadius: 12,
            background: loading ? "#95a5a6" : "#2d8cf0",
            color: "#fff",
            fontWeight: 700,
            minWidth: 120,
          }}
        >
          {loading ? "Sorgulanıyor…" : "Sorgula"}
        </button>
      </div>

      {/* Alt Aksiyonlar */}
      <div style={{ display: "flex", gap: 12 }}>
        <button
          className="btn hover-lift"
          onClick={() => navigate("/apply")}
          style={{
            padding: "12px 18px",
            borderRadius: 12,
            background: "#27ae60",
            color: "#fff",
            fontWeight: 700,
          }}
        >
          İşletmeni Doğrula
        </button>
        <button
          className="btn hover-lift"
          onClick={() => navigate("/report")}
          style={{
            padding: "12px 18px",
            borderRadius: 12,
            background: "#e74c3c",
            color: "#fff",
            fontWeight: 700,
          }}
        >
          Dolandırıcılık İhbarı
        </button>
      </div>

      {/* ---------------- Modal ---------------- */}
      {showModal && (
        <Modal onClose={closeModal}>
          <ResultCard result={result} />
        </Modal>
      )}
    </div>
  );
}

/* ---------------- Components ---------------- */

function Modal({ children, onClose }) {
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,24,39,.45)",
        backdropFilter: "blur(3px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          background: "#fff",
          borderRadius: 18,
          padding: 22,
          boxShadow: "0 24px 60px rgba(0,0,0,.25)",
          animation: "pop .16s ease-out",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Kapat"
          className="btn"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "#f1f5f9",
            color: "#111",
            borderRadius: 10,
            padding: "8px 10px",
            fontWeight: 700,
          }}
        >
          ✕
        </button>

        {children}
      </div>
    </div>
  );
}

function ResultCard({ result }) {
  if (!result) return null;

  // Ortak küçük UI
  const Row = ({ icon, children }) => (
    <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "6px 0" }}>
      <span style={{ width: 22, textAlign: "center" }}>{icon}</span>
      <div style={{ color: "#2c3e50" }}>{children}</div>
    </div>
  );

  // Duruma göre başlık/renk/ikon
  const header = (() => {
    if (result.status === "verified") {
      return {
        title: "Doğrulanmış İşletme",
        color: "#27ae60",
        icon: <IconCheck />,
        glow: "0 0 0 rgba(46, 204, 113, .0)",
      };
    }
    if (result.status === "blacklist") {
      return {
        title: "Olası Dolandırıcı İşletme",
        color: "#e74c3c",
        icon: <IconWarn />,
      };
    }
    if (result.status === "not_found") {
      return {
        title: "Kayıt Bulunamadı",
        color: "#f39c12",
        icon: <IconInfo />,
      };
    }
    return {
      title: "Bir şeyler ters gitti",
      color: "#7f8c8d",
      icon: <IconInfo />,
    };
  })();

  const b = result.business || {};

  return (
    <div>
      {/* Başlık + büyük ikon */}
      <div style={{ textAlign: "center", marginTop: 8, marginBottom: 12 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 96,
            height: 96,
            borderRadius: "50%",
            marginBottom: 10,
            background:
              result.status === "verified"
                ? "radial-gradient(60px 60px at 50% 50%, #2ecc71 0%, #27ae60 60%)"
                : result.status === "blacklist"
                ? "radial-gradient(60px 60px at 50% 50%, #ff6b6b 0%, #e74c3c 60%)"
                : "radial-gradient(60px 60px at 50% 50%, #f6c25b 0%, #f39c12 60%)",
            color: "#fff",
            boxShadow:
              result.status === "verified"
                ? "0 18px 60px rgba(39,174,96,.45)"
                : result.status === "blacklist"
                ? "0 18px 60px rgba(231,76,60,.45)"
                : "0 18px 60px rgba(243,156,18,.35)",
          }}
        >
          {header.icon}
        </div>

        <h2
          style={{
            fontSize: 24,
            fontWeight: 900,
            color: header.color,
            margin: 0,
          }}
        >
          {header.title}
        </h2>
      </div>

      {/* İçerik */}
      {result.status === "verified" && (
        <div style={{ padding: "6px 6px 2px" }}>
          <Row icon={"🏷️"}>
            <b>{b.name}</b> {b.type ? `(${b.type})` : null}
          </Row>

          {b.phone && (
            <Row icon={"📱"}>
              <a href={`tel:${b.phone}`} style={{ color: "#2d8cf0", fontWeight: 600, textDecoration: "none" }}>
                {b.phone}
              </a>
            </Row>
          )}

          {(b.instagramUrl || b.instagramUsername) && (
            <Row icon={"📷"}>
              <a
                href={b.instagramUrl || "#"}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#2d8cf0", fontWeight: 600, textDecoration: "none" }}
              >
                {b.instagramUsername || b.instagramUrl}
              </a>
            </Row>
          )}

          {b.address && <Row icon={"📍"}>{b.address}</Row>}

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            {b.phone && (
              <a
                className="btn hover-lift"
                href={`tel:${b.phone}`}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "#27ae60",
                  color: "#fff",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Ara
              </a>
            )}
            {b.instagramUrl && (
              <a
                className="btn hover-lift"
                target="_blank"
                rel="noreferrer"
                href={b.instagramUrl}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "#2d8cf0",
                  color: "#fff",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Instagram’a Git
              </a>
            )}
          </div>
        </div>
      )}

      {result.status === "blacklist" && (
        <div style={{ padding: "6px 6px 2px" }}>
          <Row icon={"🏷️"}>
            <b>{b.name || "—"}</b>
          </Row>

          {b.phone && <Row icon={"📱"}>{b.phone}</Row>}

          {(b.instagramUrl || b.instagramUsername) && (
            <Row icon={"📷"}>
              <a
                href={b.instagramUrl || "#"}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#e74c3c", fontWeight: 700, textDecoration: "none" }}
              >
                {b.instagramUsername || b.instagramUrl}
              </a>
            </Row>
          )}

          {b.address && <Row icon={"📍"}>{b.address}</Row>}

          <div
            style={{
              marginTop: 12,
              background: "#fff5f4",
              color: "#c0392b",
              padding: "10px 12px",
              borderRadius: 12,
              fontWeight: 700,
            }}
          >
            ⚠️ Bu işletme kara listede. İşlem yapmadan önce dikkatli olun.
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            {b.instagramUrl && (
              <a
                className="btn hover-lift"
                target="_blank"
                rel="noreferrer"
                href={b.instagramUrl}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "#e74c3c",
                  color: "#fff",
                  fontWeight: 800,
                  textDecoration: "none",
                }}
              >
                Profili Aç
              </a>
            )}
          </div>
        </div>
      )}

      {result.status === "not_found" && (
        <div style={{ textAlign: "center", color: "#444", padding: "8px 8px 2px" }}>
          Bu aradığınız işletme veri tabanımızda bulunamadı.  
          <div style={{ marginTop: 10 }}>
            <span className="chip" style={{ background: "#fff7e6", color: "#ad7100" }}>
              İpucu
            </span>{" "}
            <span>Doğrulama başvurusu yapabilir veya şüpheleniyorsanız ihbar bırakabilirsiniz.</span>
          </div>
        </div>
      )}

      {result.status === "error" && (
        <div style={{ textAlign: "center", color: "#7f8c8d", paddingTop: 6 }}>
          Üzgünüz, bir hata oluştu. Lütfen tekrar deneyin.
        </div>
      )}

      {/* Alt kısım CTA: başvuru & ihbar */}
      {(result.status === "not_found" || result.status === "error") && (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
          <LinkButton to="/apply" color="#27ae60">İşletmeni Doğrula</LinkButton>
          <LinkButton to="/report" color="#e74c3c">Dolandırıcılık İhbarı</LinkButton>
        </div>
      )}
    </div>
  );
}

/* Basit yönlendirme butonu */
function LinkButton({ to, color, children }) {
  const navigate = useNavigate();
  return (
    <button
      className="btn hover-lift"
      onClick={() => navigate(to)}
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        background: color,
        color: "#fff",
        fontWeight: 800,
      }}
    >
      {children}
    </button>
  );
}

/* ---------------- Icons (inline SVG) ---------------- */

function IconCheck() {
  return (
    <svg width="54" height="54" viewBox="0 0 24 24" fill="none">
      <path d="M20 7L9 18l-5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconWarn() {
  return (
    <svg width="54" height="54" viewBox="0 0 24 24" fill="none">
      <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#fff" strokeWidth="2.2" />
    </svg>
  );
}
function IconInfo() {
  return (
    <svg width="54" height="54" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="2.2" />
      <path d="M12 8h.01M11 12h1v4h1" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
