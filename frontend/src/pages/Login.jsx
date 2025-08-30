import React, { useState } from "react";
import axios from "axios";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/login`, { email, password });
      localStorage.setItem("token", res.data.token);
      window.location.href = "/admin/dashboard";
    } catch {
      alert("Hatalı giriş");
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "20%" }}>
      <h2>Admin Login</h2>
      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: "block", margin: "10px auto", padding: "10px", borderRadius: "6px", border: "1px solid #ccc" }}
      />
      <input
        type="password"
        placeholder="Şifre"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: "block", margin: "10px auto", padding: "10px", borderRadius: "6px", border: "1px solid #ccc" }}
      />
      <button
        onClick={handleLogin}
        style={{
          padding: "12px 20px",
          borderRadius: "6px",
          border: "none",
          backgroundColor: "#2980b9",
          color: "#fff",
          fontSize: "15px",
          fontWeight: "600",
          cursor: "pointer",
        }}
      >
        Giriş
      </button>
    </div>
  );
}
