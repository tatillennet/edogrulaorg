import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Search from "./pages/Search";
import Apply from "./pages/Apply";
import Report from "./pages/Report";

function NotFound() {
  return (
    <div style={{ textAlign: "center", marginTop: "20%", fontFamily: "Segoe UI, sans-serif" }}>
      <h2 style={{ color: "#c0392b" }}>404 - Sayfa Bulunamadı</h2>
      <p>Aradığınız sayfa mevcut değil.</p>
      <a href="/" style={{ color: "#2980b9", fontWeight: "600" }}>Ana Sayfaya Dön</a>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Kullanıcı tarafı */}
        <Route path="/" element={<Search />} />
        <Route path="/apply" element={<Apply />} />
        <Route path="/report" element={<Report />} />

        {/* Admin tarafı */}
        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin/dashboard" element={<Dashboard />} />

        {/* Fallback - 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
