import React, { useState } from "react";
import axios from "axios";

export default function Apply() {
  const [form, setForm] = useState({
    name: "",
    type: "", // ✅ Yeni alan
    instagramUsername: "",
    instagramUrl: "",
    phone: "",
    address: "",
    email: ""
  });
  const [success, setSuccess] = useState("");

  const handleSubmit = async () => {
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/apply`, form);
      setSuccess("✅ Başvurunuz alınmıştır. En kısa sürede incelenecektir.");
      setForm({ name: "", type: "", instagramUsername: "", instagramUrl: "", phone: "", address: "", email: "" });
    } catch {
      setSuccess("❌ Başvuru gönderilirken bir hata oluştu.");
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

      {success && <p style={{ marginTop: "15px", textAlign: "center" }}>{success}</p>}
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
