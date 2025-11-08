// frontend/src/pages/AdminLogin.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/axios-boot"; // paylaşılan axios instance

/* ------------- Token yardımcıları (UYUMLU) ------------- */
const getToken = () => {
  try {
    return (
      localStorage.getItem("authToken") ||
      localStorage.getItem("token") ||       // eski anahtar uyumu
      ""
    );
  } catch {
    return "";
  }
};

const setTokenEverywhere = (token) => {
  try {
    localStorage.setItem("authToken", token);
    localStorage.setItem("token", token);    // axios-boot 'token' okuyorsa da çalışsın
  } catch {}
  // axios default header’ları da anında ayarla (isteğe özel header’lar da tutulur)
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
  api.defaults.headers.common["x-auth-token"] = token; // backend bu header’ı bekliyorsa işini görür
};

const clearTokenEverywhere = () => {
  try {
    localStorage.removeItem("authToken");
    localStorage.removeItem("token");
  } catch {}
  delete api.defaults.headers.common.Authorization;
  delete api.defaults.headers.common["x-auth-token"];
};

/* ------------------ Oturum doğrulama ------------------ */
/** Sadece token varsa çalışır; user.isAdmin/role=admin bekler. */
async function verifySession() {
  const tok = getToken();
  if (!tok) return { ok: false, code: 401, from: "no-token" };

  try {
    const r = await api.get("/auth/me", { timeout: 10000 });
    const u = r?.data?.user || r?.data || {};
    if (u?.isAdmin || u?.role === "admin") return { ok: true, from: "auth/me", user: u };

    // İsteğe bağlı: admin uçtan da ping (istekli)
    try {
      await api.get("/admin/featured", { params: { limit: 1 }, timeout: 8000 });
      return { ok: true, from: "admin/featured", user: u };
    } catch {
      return { ok: false, code: 403, from: "admin/featured" };
    }
  } catch (e) {
    return { ok: false, code: e?.response?.status || 0, from: "auth/me" };
  }
}

export default function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState(localStorage.getItem("lastAdminEmail") || "");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const redirectTarget = useMemo(() => {
    const q = new URLSearchParams(location.search);
    const fromQ = q.get("redirect");
    const saved = localStorage.getItem("redirectAfterAdminLogin");
    let target = decodeURIComponent(fromQ || saved || "/admin/dashboard") || "/admin/dashboard";
    if (!target.startsWith("/")) target = "/admin/dashboard";
    if (target.startsWith("/login")) target = "/admin/dashboard";
    return target;
  }, [location.search]);

  // /admin/login?switch=1 → logout
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("switch") === "1") {
      (async () => {
        try { await api.post("/auth/logout", {}); } catch {}
        clearTokenEverywhere();
        setMsg("Oturum kapatıldı. Yeni hesapla giriş yapabilirsiniz.");
      })();
    }
  }, [location.search]);

  // Sayfa açılışında mevcut token ile doğrulama
  useEffect(() => {
    let ignore = false;
    localStorage.setItem("redirectAfterAdminLogin", redirectTarget);

    (async () => {
      const tok = getToken();
      if (!tok) return; // token yokken doğrulama çağrısı atma
      // axios defaultlarına da token’ı koy (sayfa yenilemelerinde)
      setTokenEverywhere(tok);

      const res = await verifySession();
      if (ignore) return;
      if (res.ok) navigate(redirectTarget, { replace: true });
      else if (res.code === 403) {
        setMsg("Bu kullanıcı admin yetkisine sahip değil.");
        clearTokenEverywhere();
      }
    })();

    return () => { ignore = true; };
  }, [redirectTarget, navigate]);

  const handleEnter = (e) => { if (e.key === "Enter") handleSubmit(); };

  const handleSubmit = async () => {
    if (loading) return;
    setMsg("");

    if (!/\S+@\S+\.\S+/.test(email) || password.length < 6) {
      setMsg("Lütfen geçerli e-posta ve en az 6 karakterli şifre girin.");
      return;
    }

    try {
      setLoading(true);

      // 1) Giriş
      const { data } = await api.post(
        "/auth/login",
        { email: email.trim(), password },
        { timeout: 15000 }
      );

      // 2) Token bul ve kaydet
      const token = data?.token || data?.accessToken || data?.jwt || data?.idToken || "";
      if (!token) throw new Error("Sunucudan token dönmedi");
      setTokenEverywhere(token);
      localStorage.setItem("lastAdminEmail", email.trim());

      // 3) Oturumu doğrula
      const res = await verifySession();
      if (!res.ok) {
        clearTokenEverywhere();
        setMsg(res.code === 403 ? "Bu kullanıcı admin yetkisine sahip değil." : "Giriş doğrulanamadı. Lütfen tekrar deneyin.");
        return;
      }

      navigate(redirectTarget, { replace: true });
    } catch (err) {
      const status = err?.response?.status;
      const text =
        err?.response?.data?.message ||
        (status === 401
          ? "E-posta/şifre hatalı."
          : status === 429
          ? "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin."
          : "Giriş başarısız.");
      setMsg(text);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = /\S+@\S+\.\S+/.test(email) && password.length >= 6;

  return (
    <div style={st.wrap}>
      <div style={st.card}>
        <img src="/logo.png" alt="E-Doğrula" style={{ height: 36, marginBottom: 10 }} />
        <h2 style={{ margin: "4px 0 14px", fontSize: 20 }}>Yönetici Girişi</h2>

        <label style={st.lbl}>E-posta</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleEnter}
          placeholder="admin@edogrula.org"
          autoComplete="username"
          style={st.input}
        />

        <label style={st.lbl}>Şifre</label>
        <div style={{ position: "relative" }}>
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleEnter}
            placeholder="••••••••"
            autoComplete="current-password"
            style={{ ...st.input, paddingRight: 44 }}
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            aria-label={showPw ? "Şifreyi gizle" : "Şifreyi göster"}
            style={st.eyeBtn}
          >
            {showPw ? "🙈" : "👁️"}
          </button>
        </div>

        {msg && <div style={st.err} role="alert">{msg}</div>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          style={{ ...st.btn, opacity: !canSubmit || loading ? 0.7 : 1 }}
          aria-busy={loading ? "true" : "false"}
        >
          {loading ? "Giriş yapılıyor…" : "Giriş"}
        </button>

        <div style={st.meta}>
          <small>Versiyon: <code>{import.meta.env.VITE_APP_VERSION || "web"}</code></small>
        </div>
      </div>
      <style>{css}</style>
    </div>
  );
}

/* --- STYLES --- */
const st = {
  wrap: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background:
      "radial-gradient(1200px 800px at -10% -20%, #e6f0ff 0%, transparent 55%), radial-gradient(1200px 800px at 120% 0%, #ffe9e6 0%, transparent 55%), #ffffff",
    fontFamily: "Inter, system-ui, Segoe UI, Tahoma, sans-serif",
    padding: 16,
  },
  card: {
    width: "min(420px, 94vw)",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    boxShadow: "0 18px 40px rgba(0,0,0,.08)",
    padding: 20,
    textAlign: "left",
  },
  lbl: { fontSize: 13, color: "#6b7280", margin: "6px 0 4px", display: "block" },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    outline: "none",
    fontSize: 15,
    marginBottom: 8,
  },
  eyeBtn: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 28,
    height: 28,
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#f8fafc",
    cursor: "pointer",
  },
  btn: {
    marginTop: 8,
    width: "100%",
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(90deg, #2d8cf0, #5db2ff)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 900,
    cursor: "pointer",
  },
  err: {
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#b91c1c",
    padding: "8px 10px",
    borderRadius: 10,
    fontWeight: 700,
    margin: "6px 0 8px",
  },
  meta: { marginTop: 10, textAlign: "center", color: "#64748b" },
};

const css = `
input:focus{box-shadow:0 0 0 3px rgba(45,140,240,.25)}
`;
