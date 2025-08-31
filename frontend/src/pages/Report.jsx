import React, { useState, useEffect } from "react";
import axios from "axios";

export default function Report() {
  const [form, setForm] = useState({ 
    name: "", 
    instagramUsername: "", 
    instagramUrl: "", 
    phone: "", 
    desc: "" 
  });
  const [showPopup, setShowPopup] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/report`, form);
      setShowPopup(true); // ✅ Başarılı olduğunda popup aç
      setError("");
      setForm({ name: "", instagramUsername: "", instagramUrl: "", phone: "", desc: "" });
    } catch {
      setError("❌ İhbar gönderilirken bir hata oluştu.");
    }
  };

  // ✅ Popup açıldığında 3sn sonra otomatik kapat
  useEffect(() => {
    if (showPopup) {
      const timer = setTimeout(() => {
        setShowPopup(false);
      }, 3000);
      return () => clearTimeout(timer); // cleanup
    }
  }, [showPopup]);

  return (
    <div style={{ padding: "40px", maxWidth: "600px", margin: "auto", fontFamily: "Segoe UI, sans-serif" }}>
      <h2 style={{ marginBottom: "20px", color: "#2c3e50", textAlign: "center" }}>Dolandırıcılık İhbarı</h2>

      <input 
        value={form.name}
        placeholder="Şüpheli İşletme Adı" 
        onChange={(e) => setForm({ ...form, name: e.target.value })} 
        style={inputStyle}
      />

      <input 
        value={form.instagramUsername}
        placeholder="Instagram Kullanıcı Adı (@kullanici)" 
        onChange={(e) => setForm({ ...form, instagramUsername: e.target.value })} 
        style={inputStyle}
      />

      <input 
        value={form.instagramUrl}
        placeholder="Instagram Profil URL (https://instagram.com/hesap)" 
        onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })} 
        style={inputStyle}
      />

      <input 
        value={form.phone}
        placeholder="Telefon" 
        onChange={(e) => setForm({ ...form, phone: e.target.value })} 
        style={inputStyle}
      />

      <textarea 
        value={form.desc}
        placeholder="İhbar Açıklaması" 
        onChange={(e) => setForm({ ...form, desc: e.target.value })} 
        style={{ ...inputStyle, minHeight: "100px", marginBottom: "20px" }}
      />

      <button 
        onClick={handleSubmit} 
        style={{
          padding: "12px 25px",
          backgroundColor: "#c0392b",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          width: "100%",
          fontWeight: "600",
          fontSize: "15px"
        }}
      >
        Gönder
      </button>

      {error && <p style={{ marginTop: "15px", textAlign: "center", color: "red" }}>{error}</p>}

      {/* ✅ Popup */}
      {showPopup && (
        <div style={popupOverlay}>
          <div style={popupBox}>
            <h3>İhbarınız İçin Teşekkür Ederiz</h3>
            <p>
              İhbarınız için gerekli incelemeleri başlatıyoruz. <br />
              <b>“Duyarlı vatandaş, güvenli toplum”</b> ilkemizi benimsediğiniz için teşekkür ederiz.
            </p>
            <button
              onClick={() => setShowPopup(false)}
              style={{
                marginTop: "15px",
                padding: "10px 20px",
                backgroundColor: "#c0392b",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer"
              }}
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  display: "block",
  marginBottom: "12px",
  width: "100%",
  padding: "12px",
  borderRadius: "8px",
  border: "1px solid #ccc",
  fontSize: "15px"
};

const popupOverlay = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000
};

const popupBox = {
  backgroundColor: "#fff",
  padding: "25px",
  borderRadius: "10px",
  maxWidth: "450px",
  textAlign: "center",
  boxShadow: "0px 4px 15px rgba(0,0,0,0.3)"
};
