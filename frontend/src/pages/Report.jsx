// src/pages/Report.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";

/* ===================== Config & Helpers ===================== */
const API_BASE = (import.meta.env.VITE_API_URL || "").toString().replace(/\/+$/, "");
const AX = axios.create({
  baseURL: API_BASE || undefined,                 // same-origin fallback
  withCredentials: true,
  timeout: 30000,
  headers: { Accept: "application/json", "x-edogrula-client": "web" },
});
const genRID = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function getVerifyToken() {
  const keys = ["emailVerifyToken", "verifyEmailToken", "verify_token", "verifyToken"];
  for (const k of keys) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v) return v;
  }
  try {
    const vt = new URLSearchParams(window.location.search).get("vt");
    if (vt) {
      localStorage.setItem("emailVerifyToken", vt);
      sessionStorage.setItem("emailVerifyToken", vt);
      return vt;
    }
  } catch {}
  return null;
}

// Request interceptor: token + meta
AX.interceptors.request.use((cfg) => {
  const vt = getVerifyToken();
  if (vt) {
    cfg.headers["x-verify-token"] = vt;
    cfg.headers["X-Verify-Token"] = vt; // backend hangi key'i beklerse
  }
  cfg.headers["x-request-id"] = genRID();
  try {
    cfg.headers["x-tz"] = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {}
  if (import.meta.env.VITE_APP_VERSION) cfg.headers["x-app-version"] = String(import.meta.env.VITE_APP_VERSION);
  return cfg;
});

/* ===================== Pattern Helpers ===================== */
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILES = 10;
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const REGEX = {
  iban: /\bTR\d{24}\b/gi,
  phone: /(\+90\s?)?0?\s?5\d{2}\s?\d{3}\s?\d{2}\s?\d{2}\b/gi,
  instagram: /(?:@|instagram\.com\/)([A-Za-z0-9._]{2,30})/gi,
  amount: /(?:₺|TL|TRY)\s?([0-9]{1,3}(\.[0-9]{3})*(,[0-9]{1,2})?|[0-9]+([.,][0-9]{1,2})?)/gi,
  date: /\b(0?[1-9]|[12][0-9]|3[01])[./-](0?[1-9]|1[0-2])[./-](20\d{2})\b/gi,
};
const extractSignals = (text) => {
  const lower = (text || "").toString();
  const pick = (re) => {
    const out = [];
    const r = new RegExp(re.source, re.flags);
    let m;
    while ((m = r.exec(lower))) out.push(m[0]);
    return [...new Set(out)];
  };
  const igHandles = [];
  {
    const r = new RegExp(REGEX.instagram.source, REGEX.instagram.flags);
    let m;
    while ((m = r.exec(lower))) {
      const h = (m[1] || "").replace(/^@+/, "");
      if (h) igHandles.push(h);
    }
  }
  return {
    ibans: pick(REGEX.iban),
    phones: pick(REGEX.phone),
    instagrams: [...new Set(igHandles)],
    amounts: pick(REGEX.amount),
    dates: pick(REGEX.date),
  };
};
const prettyPhone = (p) =>
  String(p || "").replace(/\D/g, "").replace(/^0?(\d{3})(\d{3})(\d{2})(\d{2}).*/, "0$1 $2 $3 $4");
const normIgHandle = (h) => String(h || "").replace(/\s/g, "").replace(/^@+/, "");

/* ===================== UI helpers ===================== */
const card = { background: "#fff", border: "1px solid #eaeaea", borderRadius: 14, boxShadow: "0 6px 18px rgba(0,0,0,0.06)", padding: 20 };
const inputStyle = (ok = true) => ({ display: "block", width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${ok ? "#d0d7de" : "#ef4444"}`, outline: "none", fontSize: 15, marginBottom: 12 });
const labelStyle = { fontSize: 13, color: "#6b7280", marginBottom: 6 };
const btn = { padding: "12px 18px", background: "#c0392b", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" };
const subtleBtn = { padding: "8px 12px", background: "#f1f5f9", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 8, fontWeight: 600, cursor: "pointer" };
const chip = { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#eef6ff", border: "1px solid #cfe5ff", borderRadius: 999, fontSize: 13, marginRight: 8, marginBottom: 8, cursor: "pointer" };
const stepDot = (active, done) => ({ width: 10, height: 10, borderRadius: 999, background: active ? "#111827" : done ? "#6b7280" : "#d1d5db" });
const popupOverlay = { position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 };
const popupBox = { backgroundColor: "#fff", padding: 24, borderRadius: 14, maxWidth: 520, textAlign: "center", boxShadow: "0px 10px 28px rgba(0,0,0,0.25)" };

/* ===================== Component ===================== */
export default function Report() {
  const navigate = useNavigate();
  const location = useLocation();

  // FORM
  const [form, setForm] = useState({ name: "", instagramUsername: "", instagramUrl: "", phone: "", desc: "" });

  // FILES
  const [files, setFiles] = useState([]); // { file, note, blur, name?, url? }
  const [dragOver, setDragOver] = useState(false);

  // UI
  const [step, setStep] = useState(1);
  const [showPopup, setShowPopup] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  // Draft
  const DRAFT_KEY = "reportDraft.v1";

  // Taslak yükle
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.form) setForm(parsed.form);
      if (Array.isArray(parsed.filesMeta)) {
        setFiles(
          parsed.filesMeta.map((m) => ({
            file: null,
            note: m.note || "",
            blur: !!m.blur,
            name: m.name || "",
            url: "",
          }))
        );
      }
    } catch {}
  }, []);

  // Taslak kaydet
  useEffect(() => {
    const id = setTimeout(() => {
      const filesMeta = files.map((f) => ({ name: f.file?.name || f.name || "", note: f.note, blur: !!f.blur }));
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, filesMeta }));
    }, 350);
    return () => clearTimeout(id);
  }, [form, files]);

  // Yapıştırılan görseli/pdfi al (Ctrl/Cmd+V)
  const onPaste = useCallback((e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const pasted = items
      .filter((it) => it.kind === "file")
      .map((it) => it.getAsFile())
      .filter(Boolean);
    if (pasted.length) onPickFiles(pasted);
  }, []); // eslint-disable-line
  useEffect(() => {
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onPaste]);

  // Sayfadan ayrılmadan uyar (taslak/dosya varsa)
  const hasUnsaved = useMemo(() => {
    const f = form;
    const nonEmpty = [f.name, f.instagramUsername, f.instagramUrl, f.phone, f.desc].some((x) => (x || "").trim().length > 0);
    return nonEmpty || files.length > 0;
  }, [form, files]);
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!hasUnsaved) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsaved]);

  // Çıkarımlar
  const signals = useMemo(() => {
    const fromDesc = extractSignals(form.desc);
    const phones = new Set(fromDesc.phones);
    if (form.phone) phones.add(prettyPhone(form.phone));
    const instas = new Set(fromDesc.instagrams);
    if (form.instagramUsername) instas.add(normIgHandle(form.instagramUsername));
    if (form.instagramUrl) {
      const m = /instagram\.com\/([A-Za-z0-9._]{2,30})/i.exec(form.instagramUrl);
      if (m?.[1]) instas.add(m[1]);
    }
    return {
      ibans: fromDesc.ibans,
      phones: Array.from(phones).filter(Boolean),
      instagrams: Array.from(instas).filter(Boolean),
      amounts: fromDesc.amounts,
      dates: fromDesc.dates,
    };
  }, [form.desc, form.instagramUrl, form.instagramUsername, form.phone]);

  // Validasyon
  const v = {
    name: form.name.trim().length >= 2,
    ig: normIgHandle(form.instagramUsername).length >= 2 || /instagram\.com\//i.test(form.instagramUrl),
    phone: form.phone.replace(/\D/g, "").length >= 10,
    desc: form.desc.trim().length >= 20,
  };
  const canNextFrom1 = v.name && v.ig && v.phone && v.desc;
  const canSubmit = canNextFrom1;

  /* ---------- Files ---------- */
  const revokeAll = (arr) => arr.forEach((x) => x.url && URL.revokeObjectURL(x.url));
  const fileKey = (f) => `${f?.name || ""}-${f?.size || 0}-${f?.lastModified || 0}`;

  const onPickFiles = (list) => {
    const arr = Array.from(list || []);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => fileKey(f.file) || `${f.name}-0-0`));
      const next = [];
      for (const f of arr) {
        if (!f) continue;
        if (existing.has(fileKey(f))) continue; // kopya engelle
        const okType = ALLOWED_MIME.includes(f.type);
        const okSize = f.size <= MAX_SIZE;
        if (okType && okSize) next.push({ file: f, note: "", blur: false, name: f.name, url: URL.createObjectURL(f) });
      }
      return [...prev, ...next].slice(0, MAX_FILES);
    });
  };

  const removeFile = (i) =>
    setFiles((prev) => {
      const c = [...prev];
      const [rm] = c.splice(i, 1);
      if (rm?.url) URL.revokeObjectURL(rm.url);
      return c;
    });

  const move = (i, dir) => {
    setFiles((prev) => {
      const c = [...prev];
      const j = i + dir;
      if (j < 0 || j >= c.length) return c;
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  };

  // unmount cleanup
  useEffect(() => () => revokeAll(files), [files]);

  /* ---------- Submit ---------- */
  const handleSubmit = async () => {
    setError("");
    setProgress(0);
    if (!canSubmit) return setError("Lütfen zorunlu alanları doldurun.");

    const token = getVerifyToken();
    if (!token) {
      const target = `/verify-email?redirect=${encodeURIComponent(location.pathname || "/report")}`;
      return navigate(target, { replace: true });
    }

    try {
      setSubmitting(true);

      const fd = new FormData();
      fd.append("name", form.name.trim());
      fd.append("instagramUsername", normIgHandle(form.instagramUsername));
      fd.append("instagramUrl", form.instagramUrl.trim());
      fd.append("phone", form.phone.trim());
      fd.append("desc", form.desc.trim());

      const notes = [];
      files.forEach((f, idx) => {
        if (f.file) fd.append("evidence", f.file);
        notes.push({ index: idx, note: f.note || "", blur: !!f.blur, name: f.file?.name || f.name || "" });
      });
      fd.append("evidenceNotes", JSON.stringify(notes)); // backend ignore edebilir

      const res = await AX.post("/api/report", fd, {
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          const pct = Math.round((evt.loaded * 100) / evt.total);
          setProgress(pct);
        },
      });

      // İsteğe bağlı referans kodu/id yakala (panel eşleme için faydalı)
      const refId = res?.data?.id || res?.data?.report?._id || res?.data?._id || null;
      console.info("📨 Report submitted", { refId });

      setShowPopup(true);
      setForm({ name: "", instagramUsername: "", instagramUrl: "", phone: "", desc: "" });
      revokeAll(files);
      setFiles([]);
      localStorage.removeItem(DRAFT_KEY);

      setTimeout(() => setShowPopup(false), 10000);
      setStep(1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) {
        setError("Oturum doğrulaması gerekli. Lütfen e-posta doğrulaması yapın.");
        const target = `/verify-email?redirect=${encodeURIComponent(location.pathname || "/report")}`;
        navigate(target, { replace: true });
      } else if (status === 413) {
        setError("Dosya boyutu çok büyük. Lütfen 10MB altı dosyalar yükleyin.");
      } else if (status === 429) {
        setError("Çok sık denediniz. Lütfen biraz sonra tekrar deneyin.");
      } else if (err?.code === "ERR_NETWORK" || err.message?.includes("Network Error")) {
        setError("Ağ hatası. Sunucuya erişilemiyor veya CORS engeli var.");
      } else {
        setError(err?.response?.data?.message || "❌ İhbar gönderilirken bir hata oluştu.");
      }
    } finally {
      setSubmitting(false);
      setProgress(0);
    }
  };

  /* ===================== Render ===================== */
  return (
    <div style={{ padding: 28, maxWidth: 960, margin: "0 auto", fontFamily: "Inter, Segoe UI, system-ui, sans-serif" }}>
      {/* Başlık + Stepper */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: "#111827", fontWeight: 800 }}>Dolandırıcılık İhbarı</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={stepDot(step === 1, step > 1)} />
          <div style={{ width: 50, height: 2, background: step > 1 ? "#6b7280" : "#e5e7eb" }} />
          <div style={stepDot(step === 2, step > 2)} />
          <div style={{ width: 50, height: 2, background: step > 2 ? "#6b7280" : "#e5e7eb" }} />
          <div style={stepDot(step === 3, false)} />
        </div>
      </div>

      {/* Uyarı */}
      <div style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16, background: "#fffdf6" }}>
        <div style={{ fontSize: 20 }}>⚠️</div>
        <div style={{ fontSize: 14, color: "#374151" }}>
          Lütfen yalnızca gerçeği yansıtan bilgiler girin. İftira, kişisel veri ihlali veya yasa dışı içerik paylaşımı hukuki sorumluluk doğurur.
          Delil yüklerken gizlemek istediğiniz veriler varsa önizlemede <b>“Blur”</b>’ı kullanabilirsiniz (önizleme içindir).
        </div>
      </div>

      {/* Adım 1 */}
      {step === 1 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={labelStyle}>İşletme Adı *</div>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={inputStyle(v.name)}
                placeholder="Örn: Tatil Evi Şubesi"
              />
            </div>
            <div>
              <div style={labelStyle}>Telefon *</div>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: prettyPhone(e.target.value) })}
                style={inputStyle(v.phone)}
                placeholder="0XXX XXX XX XX"
              />
            </div>
            <div>
              <div style={labelStyle}>Instagram Kullanıcı Adı</div>
              <input
                value={form.instagramUsername}
                onChange={(e) => setForm({ ...form, instagramUsername: e.target.value.replace(/\s/g, "") })}
                style={inputStyle(true)}
                placeholder="@kullanici"
              />
            </div>
            <div>
              <div style={labelStyle}>Instagram URL</div>
              <input
                value={form.instagramUrl}
                onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })}
                style={inputStyle(true)}
                placeholder="https://instagram.com/hesap"
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={labelStyle}>İhbar Açıklaması *</div>
              <textarea
                value={form.desc}
                onChange={(e) => setForm({ ...form, desc: e.target.value })}
                style={{ ...inputStyle(v.desc), minHeight: 120 }}
                placeholder="Ne oldu? Kim, ne zaman, hangi tutar? IBAN/WhatsApp konuşma özeti ve kanıtın kısa açıklaması…"
              />
              <div style={{ fontSize: 12, color: "#6b7280", textAlign: "right" }}>{form.desc.length} karakter</div>
            </div>
          </div>

          {/* Çıkarımlar */}
          <div style={{ marginTop: 8 }}>
            {!!signals.instagrams.length && (
              <div style={{ marginTop: 6 }}>
                <div style={labelStyle}>Önerilen Instagram</div>
                {signals.instagrams.slice(0, 5).map((h, i) => (
                  <span
                    key={`ig-${i}`}
                    style={chip}
                    title="Alana doldur"
                    onClick={() => setForm({ ...form, instagramUsername: h.startsWith("@") ? h : "@" + h })}
                  >
                    @{h}
                  </span>
                ))}
              </div>
            )}
            {!!signals.phones.length && (
              <div style={{ marginTop: 6 }}>
                <div style={labelStyle}>Önerilen Telefon</div>
                {signals.phones.slice(0, 3).map((p, i) => (
                  <span
                    key={`ph-${i}`}
                    style={{ ...chip, background: "#ecfdf5", borderColor: "#bbf7d0" }}
                    onClick={() => setForm({ ...form, phone: prettyPhone(p) })}
                  >
                    {prettyPhone(p)}
                  </span>
                ))}
              </div>
            )}
            {!!signals.ibans.length && (
              <div style={{ marginTop: 6 }}>
                <div style={labelStyle}>Tespit edilen IBAN</div>
                {signals.ibans.slice(0, 2).map((t, i) => (
                  <span key={`ib-${i}`} style={{ ...chip, background: "#fff1f2", borderColor: "#fecdd3", cursor: "default" }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
            {(signals.amounts.length > 0 || signals.dates.length > 0) && (
              <div style={{ marginTop: 6, display: "flex", gap: 24, flexWrap: "wrap" }}>
                {!!signals.amounts.length && (
                  <div>
                    <div style={labelStyle}>Tutarlar</div>
                    {signals.amounts.slice(0, 4).map((a, i) => (
                      <span key={`am-${i}`} style={{ ...chip, background: "#f0f9ff", borderColor: "#bae6fd", cursor: "default" }}>
                        {a}
                      </span>
                    ))}
                  </div>
                )}
                {!!signals.dates.length && (
                  <div>
                    <div style={labelStyle}>Tarihler</div>
                    {signals.dates.slice(0, 4).map((d, i) => (
                      <span key={`dt-${i}`} style={{ ...chip, background: "#fdf4ff", borderColor: "#f5d0fe", cursor: "default" }}>
                        {d}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <button
              onClick={() => {
                setForm({ name: "", instagramUsername: "", instagramUrl: "", phone: "", desc: "" });
                revokeAll(files);
                setFiles([]);
                localStorage.removeItem(DRAFT_KEY);
              }}
              style={subtleBtn}
              title="Taslağı temizle"
            >
              Taslağı Temizle
            </button>
            <button disabled={!canNextFrom1} onClick={() => setStep(2)} style={{ ...btn, opacity: canNextFrom1 ? 1 : 0.5 }} aria-disabled={!canNextFrom1}>
              Devam Et ➜
            </button>
          </div>
        </div>
      )}

      {/* Adım 2: Deliller */}
      {step === 2 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onPickFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "#10b981" : "#d1d5db"}`,
              borderRadius: 14,
              padding: 20,
              textAlign: "center",
              background: dragOver ? "rgba(16,185,129,0.06)" : "transparent",
              cursor: "pointer",
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 700, color: "#111827" }}>Delil yükle (sürükle-bırak, tıkla ya da Ctrl+V)</div>
            <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
              JPG/PNG/WEBP/PDF – max {MAX_FILES} dosya, {Math.round(MAX_SIZE / (1024 * 1024))}MB (kopya dosyalar otomatik elenir)
            </div>
            <input
              ref={fileInputRef}
              style={{ display: "none" }}
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={(e) => onPickFiles(e.target.files)}
            />
          </div>

          {!!files.length && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
              {files.map((item, idx) => {
                const isPDF =
                  item.file?.type === "application/pdf" || (!item.file && (item.name || "").toLowerCase().endsWith(".pdf"));
                const url = item.url || (item.file ? URL.createObjectURL(item.file) : "");
                if (url && !item.url) item.url = url;
                return (
                  <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                    <div
                      style={{
                        position: "relative",
                        height: 140,
                        background: "#f8fafc",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isPDF ? (
                        <div style={{ fontSize: 28 }}>📄</div>
                      ) : url ? (
                        <img
                          src={url}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            filter: item.blur ? "blur(6px)" : "none",
                            transition: "filter .2s ease",
                          }}
                        />
                      ) : (
                        <div style={{ color: "#9ca3af", fontSize: 13 }}>Önizleme yok</div>
                      )}
                      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
                        <button onClick={() => move(idx, -1)} style={subtleBtn} title="Yukarı taşı">↑</button>
                        <button onClick={() => move(idx, +1)} style={subtleBtn} title="Aşağı taşı">↓</button>
                        <button
                          onClick={() => setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, blur: !f.blur } : f)))}
                          style={subtleBtn}
                          title="Blur (sadece önizleme)"
                        >
                          Blur
                        </button>
                        <button
                          onClick={() => removeFile(idx)}
                          style={{ ...subtleBtn, background: "#fff1f2", borderColor: "#fecdd3" }}
                          title="Kaldır"
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                    <div style={{ padding: 10 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{item.file?.name || item.name || "Delil"}</div>
                      <textarea
                        placeholder="Kısa not (örn. 'Kapora IBAN ekran görüntüsü')"
                        value={item.note}
                        onChange={(e) => setFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, note: e.target.value } : f)))}
                        style={{ ...inputStyle(true), minHeight: 70, marginBottom: 0 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <button onClick={() => setStep(1)} style={subtleBtn}>⟵ Geri</button>
            <button onClick={() => setStep(3)} style={btn}>Devam Et ➜</button>
          </div>
        </div>
      )}

      {/* Adım 3: Önizleme & Gönder */}
      {step === 3 && (
        <div style={{ ...card }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
            <div>
              <div style={{ ...card, padding: 16, border: "1px dashed #e5e7eb", background: "#fbfbff" }}>
                <div style={{ fontWeight: 800, marginBottom: 8, color: "#111827" }}>Özet</div>
                <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                  <b>İşletme:</b> {form.name || "-"} <br />
                  <b>Telefon:</b> {form.phone || "-"} <br />
                  <b>Instagram:</b> {form.instagramUsername || form.instagramUrl || "-"} <br />
                  <b>Tespitler:</b>{" "}
                  {[
                    signals.ibans.length ? `${signals.ibans.length} IBAN` : null,
                    signals.amounts.length ? `${signals.amounts.length} tutar` : null,
                    signals.dates.length ? `${signals.dates.length} tarih` : null,
                  ]
                    .filter(Boolean)
                    .join(", ") || "-"}
                  <br />
                  <b>Açıklama:</b> {form.desc?.slice(0, 240) || "-"}
                  {form.desc?.length > 240 ? "…" : ""}
                </div>
              </div>
            </div>
            <div>
              <div style={{ ...card, padding: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Son Kontrol</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: "#374151", fontSize: 14 }}>
                  <li>Bilgiler doğru ve gerçeği yansıtıyor.</li>
                  <li>Delillerde kişisel veriler (TC no, adres vb.) gerekliyse <b>bulanıklaştırıldı</b>.</li>
                  <li>Yasal uyarıları okudum ve kabul ediyorum.</li>
                </ul>

                {/* Upload Progress */}
                {submitting && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ height: 8, background: "#e5e7eb", borderRadius: 999 }}>
                      <div
                        style={{ width: `${progress}%`, height: 8, borderRadius: 999, background: "#10b981", transition: "width .2s ease" }}
                      />
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{progress}%</div>
                  </div>
                )}

                {error && <p style={{ color: "red", marginTop: 12 }}>{error}</p>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                  <button onClick={() => setStep(2)} style={subtleBtn}>⟵ Delillere Dön</button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !canSubmit}
                    aria-disabled={submitting || !canSubmit}
                    style={{ ...btn, background: submitting ? "#9ca3af" : "#c0392b" }}
                  >
                    {submitting ? "Gönderiliyor…" : "İhbarı Gönder"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Teşekkür Popup */}
      {showPopup && (
        <div style={popupOverlay}>
          <div style={popupBox}>
            <h3>İhbarınız İçin Teşekkür Ederiz</h3>
            <p>
              İhbarınız için gerekli incelemeleri başlatıyoruz. <br />
              <b>“Duyarlı vatandaş, güvenli toplum”</b> ilkemizi benimsediğiniz için teşekkür ederiz.
            </p>
            <button onClick={() => setShowPopup(false)} style={{ ...btn, background: "#16a34a", padding: "10px 16px" }}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
