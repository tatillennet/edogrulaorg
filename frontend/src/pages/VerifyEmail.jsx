import React, { useState } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";

export default function VerifyEmail() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email"); // "email" → mail girme, "code" → kod girme
  const [msg, setMsg] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Kod Gönder
  const sendCode = async () => {
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/auth/send-code`,
        { email }
      );
      setStep("code");
      setMsg(res.data.message || "Kod e-posta adresinize gönderildi.");
    } catch (err) {
      setMsg("Kod gönderilemedi. Lütfen tekrar deneyin.");
    }
  };

  // ✅ Kod Doğrula
  const verifyCode = async () => {
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/auth/verify-code`,
        { email, code }
      );
      setMsg("Doğrulama başarılı 🎉");
      localStorage.setItem("isVerifiedEmail", "true");
      localStorage.setItem("verifiedEmail", email);

      // Kullanıcı hangi sayfaya gitmek istiyorduysa oraya yönlendir
      const redirect = location.state?.from || "/";
      navigate(redirect);
    } catch (err) {
      setMsg("Kod yanlış veya süresi dolmuş.");
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>E-posta Doğrulama</h2>
      <p style={{ marginBottom: "15px" }}>
        {step === "email"
          ? "Devam etmek için e-posta adresinizi giriniz."
          : "E-postanıza gelen doğrulama kodunu giriniz."}
      </p>

      {step === "email" && (
        <>
          <input
            type="email"
            placeholder="E-posta adresiniz"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />
          <button onClick={sendCode} style={styles.btn}>
            Kod Gönder
          </button>
        </>
      )}

      {step === "code" && (
        <>
          <input
            type="text"
            placeholder="6 haneli kod"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={styles.input}
          />
          <button onClick={verifyCode} style={styles.btn}>
            Doğrula
          </button>
        </>
      )}

      {msg && <p style={{ marginTop: "15px", color: "#2c3e50" }}>{msg}</p>}
    </div>
  );
}

const styles = {
  container: {
    padding: "40px",
    maxWidth: "400px",
    margin: "auto",
    textAlign: "center",
    fontFamily: "Segoe UI, sans-serif",
  },
  title: {
    fontSize: "24px",
    fontWeight: "600",
    marginBottom: "15px",
    color: "#2c3e50",
  },
  input: {
    margin: "10px 0",
    padding: "12px",
    width: "100%",
    borderRadius: "8px",
    border: "1px solid #ccc",
    fontSize: "15px",
  },
  btn: {
    padding: "12px 20px",
    background: "#27ae60",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    width: "100%",
    fontWeight: "600",
    fontSize: "15px",
    marginTop: "10px",
  },
};
