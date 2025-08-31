import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

export default function BusinessProfile() {
  const { id } = useParams(); // URL'den işletme id al
  const navigate = useNavigate();
  const [business, setBusiness] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBusiness = async () => {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/businesses/${id}`);
        setBusiness(res.data);
      } catch (err) {
        console.error("İşletme bulunamadı", err);
      } finally {
        setLoading(false);
      }
    };
    fetchBusiness();
  }, [id]);

  if (loading) return <p style={{ textAlign: "center", marginTop: "50px" }}>Yükleniyor...</p>;
  if (!business) return <p style={{ textAlign: "center", marginTop: "50px" }}>İşletme bulunamadı.</p>;

  return (
    <div style={styles.container}>
      {/* Durum Banner */}
      {business.status === "blacklist" && (
        <div style={{ ...styles.banner, background: "#fdecea", color: "#c0392b" }}>
          ⚠️ Bu işletme kara listede. İşlem yapmadan önce dikkatli olun.
        </div>
      )}
      {business.status === "pending" && (
        <div style={{ ...styles.banner, background: "#fff3cd", color: "#856404" }}>
          ⏳ Bu işletme inceleme aşamasında.
        </div>
      )}
      {business.status === "verified" && (
        <div style={{ ...styles.banner, background: "#d4edda", color: "#155724" }}>
          ✅ Bu işletme Edoğrula tarafından doğrulanmıştır.
        </div>
      )}

      {/* İşletme Başlığı */}
      <h1 style={styles.title}>{business.name}</h1>
      <p style={styles.subtitle}>{business.type}</p>

      {/* Bilgiler */}
      <div style={styles.infoBox}>
        <p><b>📸 Instagram:</b> <a href={business.instagramUrl} target="_blank">{business.instagramUsername}</a></p>
        <p><b>📱 Telefon:</b> {business.phone}</p>
        <p><b>📍 Adres:</b> {business.address}</p>
        <p><b>📝 Açıklama:</b> {business.desc || "Bilgi bulunmuyor"}</p>
        <p><b>📅 Eklenme Tarihi:</b> {new Date(business.createdAt).toLocaleDateString()}</p>
      </div>

      {/* Butonlar */}
      <div style={styles.actions}>
        <button style={{ ...styles.btn, background: "#c0392b" }} onClick={() => navigate("/report")}>
          İhbar Et
        </button>
        <button style={{ ...styles.btn, background: "#2980b9" }} onClick={() => navigator.clipboard.writeText(window.location.href)}>
          Profili Paylaş
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "800px",
    margin: "40px auto",
    padding: "20px",
    fontFamily: "Segoe UI, sans-serif",
    color: "#2c3e50"
  },
  banner: {
    padding: "12px",
    borderRadius: "8px",
    fontWeight: "600",
    marginBottom: "20px",
    textAlign: "center"
  },
  title: { fontSize: "32px", margin: "10px 0" },
  subtitle: { fontSize: "18px", color: "#7f8c8d" },
  infoBox: {
    background: "#f9f9f9",
    padding: "20px",
    borderRadius: "10px",
    marginTop: "20px",
    fontSize: "15px",
    lineHeight: "1.6"
  },
  actions: {
    marginTop: "20px",
    display: "flex",
    gap: "15px"
  },
  btn: {
    flex: 1,
    padding: "12px",
    border: "none",
    borderRadius: "8px",
    color: "#fff",
    fontWeight: "600",
    cursor: "pointer"
  }
};
