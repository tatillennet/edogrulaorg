// src/pages/Login.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useLocation, useNavigate } from "react-router-dom";

/* ----------------------- BASE URL (auto /api) ----------------------- */
const RAW_BASE = (import.meta.env.VITE_API_URL || "").trim().replace(/\/+$/, "");
const API_BASE = RAW_BASE ? (RAW_BASE.endsWith("/api") ? RAW_BASE : `${RAW_BASE}/api`) : "/api";
const api = (p) => `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;

/* ---------------------- Ortak doğrulama helper ---------------------- */
async function verifySession(headers) {
  // 1) /auth/me dene
  try {
    const r = await axios.get(api("/auth/me"), { withCredentials: true, headers, timeout: 10000 });
    return { ok: true, kind: "auth/me", user: r.data };
  } catch (e) {
    const st = e?.response?.status;
    if (st && ![404, 405].includes(st)) return { ok: false, code: st, from: "auth/me" };
  }
  // 2) /admin/me fallback
  try {
    const r = await axios.get(api("/admin/me"), { withCredentials: true, headers, timeout: 10000 });
    return { ok: true, kind: "admin/me", user: r.data };
  } catch (e) {
    const st = e?.response?.status;
    if (st && ![404, 405].includes(st)) return { ok: false, code: st, from: "admin/me" };
  }
  // 3) Son çare: korumalı bir admin uç noktasına ping
  try {
    await axios.get(api("/admin/businesses"), {
      withCredentials: true,
      headers,
      params: { limit: 1 },
      timeout: 10000,
    });
    return { ok: true, kind: "admin/ping" };
  } catch (e) {
    const st = e?.response?.status || 0;
    return { ok: false, code: st, from: "admin/ping" };
  }
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  // UI & form state
  const [mode, setMode] = useState("password"); // "password" | "key"
  const [email, setEmail] = useState(localStorage.getItem("lastAdminEmail") || "");
  const [password, setPassword] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // redirect hedefi: ?redirect -> localStorage -> dashboard (güvenli)
  const redirectTarget = useMemo(() => {
    const q = new URLSearchParams(location.search);
    const fromQ = q.get("redirect");
    const saved = localStorage.getItem("redirectAfterAdminLogin");
    let target = decodeURIComponent(fromQ || saved || "/admin/dashboard") || "/admin/dashboard";
    if (!target.startsWith("/")) target = "/admin/dashboard";
    if (target.startsWith("/login")) target = "/admin/dashboard";
    return target;
  }, [location.search]);

  // Açılışta: token varsa doğrula, sadece geçerliyse yönlendir
  useEffect(() => {
    let ignore = false;
    localStorage.setItem("redirectAfterAdminLogin", redirectTarget);

    (async () => {
      const tok = localStorage.getItem("adminToken");
      if (!tok) return;
      const headers = { Authorization: `Bearer ${tok}` };
      const res = await verifySession(headers);
      if (ignore) return;
      if (res.ok) {
        navigate(redirectTarget, { replace: true });
      } else {
        if (res.code === 403) setMsg("Bu kullanıcı admin yetkisine sahip değil.");
        localStorage.removeItem("adminToken");
      }
    })();

    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEnter = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  const handleSubmit = async () => {
    setMsg("");
    if (loading) return;

    try {
      setLoading(true);

      if (mode === "password") {
        if (!/\S+@\S+\.\S+/.test(email) || password.length < 6) {
          setMsg("Lütfen geçerli e-posta ve en az 6 karakterli şifre girin.");
          return;
        }

        const { data } = await axios.post(
          api("/auth/login"),
          { email: email.trim(), password },
          { withCredentials: true, timeout: 15000 }
        );

        // Token varsa header’da da kullanırız; yoksa cookie-only devam eder
        const token =
          data?.token || data?.accessToken || data?.jwt || data?.idToken || "";

        if (token) {
          localStorage.setItem("adminToken", token);
          localStorage.setItem("lastAdminEmail", email.trim());
        }

        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const res = await verifySession(headers);

        if (!res.ok) {
          if (token) localStorage.removeItem("adminToken");
          if (res.code === 401) setMsg("Giriş başarısız görünüyor. Lütfen tekrar deneyin.");
          else if (res.code === 403) setMsg("Hesabınızda admin izni yok.");
          else setMsg("Giriş doğrulanamadı. Sunucu uçları eksik olabilir.");
          return;
        }

        navigate(redirectTarget, { replace: true });
      } else {
        // mode === "key"  -> ADMIN_KEY ile giriş
        const key = String(adminKey || "").trim();
        if (!key) {
          setMsg("Admin anahtarı gerekli.");
          return;
        }

        localStorage.setItem("adminToken", key);

        const res = await verifySession({ Authorization: `Bearer ${key}` });
        if (!res.ok) {
          localStorage.removeItem("adminToken");
          setMsg(
            res.code === 401
              ? "Anahtar geçersiz."
              : res.code === 403
              ? "Bu anahtar admin yetkisi vermiyor."
              : "Doğrulama başarısız. Ağ/CORS ya da uç nokta eksikliği olabilir."
          );
          return;
        }

        navigate(redirectTarget, { replace: true });
      }
    } catch (err) {
      const status = err?.response?.status;
      const text =
        err?.response?.data?.message ||
        (status === 401
          ? "E-posta/şifre hatalı."
          : status === 429
          ? "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin."
          : err?.message?.includes("Network")
          ? "Ağ hatası veya CORS engeli."
          : "Giriş başarısız.");
      setMsg(text);
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    (mode === "password" && /\S+@\S+\.\S+/.test(email) && password.length >= 6) ||
    (mode === "key" && String(adminKey || "").trim().length > 0);

  return (
    <div style={st.wrap}>
      <div style={st.card}>
        <img src="/logo.png" alt="E-Doğrula" style={{ height: 36, marginBottom: 10 }} />
        <h2 style={{ margin: "4px 0 14px", fontSize: 20 }}>Yönetici Girişi</h2>

        {/* Mode switch */}
        <div style={st.tabs}>
          <button
            type="button"
            onClick={() => setMode("password")}
            className={`tab ${mode === "password" ? "active" : ""}`}
          >
            Şifre ile
          </button>
          <button
            type="button"
            onClick={() => setMode("key")}
            className={`tab ${mode === "key" ? "active" : ""}`}
          >
            Admin Anahtarı
          </button>
        </div>

        {mode === "password" ? (
          <>
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
          </>
        ) : (
          <>
            <label style={st.lbl}>Admin Anahtarı</label>
            <input
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              onKeyDown={handleEnter}
              placeholder="Örn: 3x-uzun-bir-admin-key"
              style={st.input}
            />
            <p style={st.help}>
              Backend’te <code>ADMIN_KEY</code> tanımlıysa, admin uçlarına erişim için{" "}
              <b>Authorization: Bearer &lt;ANAHTAR&gt;</b> kullanılır. Bu alan onu saklar.
            </p>
          </>
        )}

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
          <small>
            Versiyon: <code>{import.meta.env.VITE_APP_VERSION || "web"}</code>
            {API_BASE && <> • API: <code>{API_BASE}</code></>}
          </small>
        </div>
      </div>

      <style>{css}</style>
    </div>
  );
}

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
  tabs: { display: "flex", gap: 8, marginBottom: 12 },
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
  help: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  meta: { marginTop: 10, textAlign: "center", color: "#64748b" },
};

const css = `
.tab{background:#fff;border:1px solid #e5e7eb;border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer}
.tab.active{background:#0f172a;color:#fff;border-color:#0f172a}
input:focus{box-shadow:0 0 0 3px rgba(45,140,240,.25)}
`;
