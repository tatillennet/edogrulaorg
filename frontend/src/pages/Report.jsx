import React, { useState } from "react";
import axios from "axios";

export default function Report() {
  const [form, setForm] = useState({ 
    name: "", 
    instagramUsername: "", 
    instagramUrl: "", 
    phone: "", 
    desc: "" 
  });

  const handleSubmit = async () => {
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/report`, form);
      alert("✅ İhbarınız alınmıştır. İnceleme başlatılacaktır.");
      setForm({ name: "", instagramUsername: "", instagramUrl: "", phone: "", desc: "" });
    } catch {
      alert("❌ İhbar gönderilirken bir hata oluştu.");
    }
  };

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
