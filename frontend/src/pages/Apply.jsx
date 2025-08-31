import React, { useState } from "react";
import axios from "axios";

export default function Apply() {
  const [form, setForm] = useState({
    name: "",
    type: "",
    instagramUsername: "",
    instagramUrl: "",
    phone: "",
    address: "",
    email: ""
  });
  const [showPopup, setShowPopup] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/apply`, form);
      setShowPopup(true); // ✅ Başvuru başarılı -> popup aç
      setError("");
      setForm({ name: "", type: "", instagramUsername: "", instagramUrl: "", phone: "", address: "", email: "" });
    } catch {
      setError("❌ Başvuru gönderilirken bir hata oluştu.");
    }
  };

  return (
    <div style={{ padding: "40px", maxWidth: "600px", margin: "auto", fontFamily: "Segoe UI, sans-serif" }}>
      <h2 style={{ marginBottom: "20px", textAlign: "center", color: "#2c3e50" }}>
        İşletme Doğrulama Başvurusu
      </h2>

      <input
        value={form.name}
        placeholder="İşletme Adı"
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        style={inputStyle}
      />
      <input
        value={form.type}
        placeholder="İşletme Türü (Otel, Kafe, Mağaza...)"
        onChange={(e) => setForm({ ...form, type: e.target.value })}
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
      <input
        value={form.address}
        placeholder="Adres"
        onChange={(e) => setForm({ ...form, address: e.target.value })}
        style={inputStyle}
      />
      <input
        value={form.email}
        placeholder="E-posta"
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        style={inputStyle}
      />

      <button
        onClick={handleSubmit}
        style={{
          padding: "14px 25px",
          width: "100%",
          marginTop: "10px",
          borderRadius: "8px",
          border: "none",
          backgroundColor: "#27ae60",
          color: "#fff",
          fontSize: "16px",
          fontWeight: "600",
          cursor: "pointer"
        }}
      >
        Gönder
      </button>

      {error && <p style={{ marginTop: "15px", textAlign: "center", color: "red" }}>{error}</p>}

      {/* ✅ Popup */}
      {showPopup && (
        <div style={popupOverlay}>
          <div style={popupBox}>
            <h3>Başvurunuz Değerlendirmeye Alınmıştır</h3>
            <p>En kısa sürede değerlendirilip size mail üzerinden bilgi verilecektir.</p>
            <button
              onClick={() => setShowPopup(false)}
              style={{
                marginTop: "15px",
                padding: "10px 20px",
                backgroundColor: "#27ae60",
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
  marginBottom: "10px",
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
  maxWidth: "400px",
  textAlign: "center",
  boxShadow: "0px 4px 15px rgba(0,0,0,0.3)"
};
