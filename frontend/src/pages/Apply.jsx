// frontend/src/pages/Apply.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";

/* ========== Helpers ========== */
const PHONE_RE = /(\+90\s?)?0?\s?5\d{2}\s?\d{3}\s?\d{2}\s?\d{2}\b/g;
const prettyPhone = (p = "") =>
  String(p).replace(/\D/g, "").replace(/^0?(\d{3})(\d{3})(\d{2})(\d{2}).*/, "0$1 $2 $3 $4");
const digitsOnly = (p = "") => String(p).replace(/\D/g, "");
const usernameFromUrl = (url = "") => {
  const m = /instagram\.com\/([A-Za-z0-9._]{2,30})/i.exec(url);
  return m?.[1] || "";
};
const validEmail = (e = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || "").trim());

// **Sunucu görsel yolu**
const imgSrc = (requestId, name) =>
  `/uploads/apply/${encodeURIComponent(requestId)}/${name}`;

/* UI helpers */
const card = {
  background: "#fff",
  border: "1px solid #eaeaea",
  borderRadius: 14,
  boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
  padding: 20,
};
const label = { fontSize: 13, color: "#6b7280", marginBottom: 6 };
const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  background: "#eef6ff",
  border: "1px solid #cfe5ff",
  borderRadius: 999,
  fontSize: 13,
  marginRight: 8,
  marginBottom: 8,
  cursor: "pointer",
};
const btn = {
  padding: "12px 18px",
  background: "#27ae60",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  fontWeight: 700,
  cursor: "pointer",
};
const subtleBtn = {
  padding: "8px 12px",
  background: "#f1f5f9",
  color: "#111827",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  fontWeight: 600,
  cursor: "pointer",
};
const stepDot = (active, done) => ({
  width: 10,
  height: 10,
  borderRadius: 999,
  background: active ? "#111827" : done ? "#6b7280" : "#d1d5db",
});
const inputStyle = (ok = true) => ({
  display: "block",
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1.5px solid ${ok ? "#d0d7de" : "#f87171"}`,
  outline: "none",
  fontSize: 15,
  marginBottom: 12,
});

/* ==== Galeri sınırı ==== */
const MAX_IMAGES = 5;
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default function Apply() {
  const [form, setForm] = useState({
    name: "",
    type: "",
    instagramUsername: "",
    instagramUrl: "",
    phone: "",
    address: "",
    email: "",
    note: "",
  });

  const [biz, setBiz] = useState(null); // {_id, name, slug}

  // Yalnızca GÖRSEL ve max 5
  const [files, setFiles] = useState([]); // { file: File, note: string, blur: boolean, name?: string }
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // UI
  const [step, setStep] = useState(1);
  const [showPopup, setShowPopup] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // **Yeni: Sunucu cevabı (görselleri göstermek için)**
  const [serverReqId, setServerReqId] = useState("");
  const [serverFiles, setServerFiles] = useState([]); // [{path, filename, ...}] – yoksa fallback 01..05

  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const DRAFT_KEY = "applyDraft.v1";
  const API = import.meta.env.VITE_API_URL;

  /* E-posta doğrulama */
  useEffect(() => {
    const token = localStorage.getItem("emailVerifyToken");
    const verified = localStorage.getItem("isVerifiedEmail");
    if (!token && !verified) {
      navigate("/verify-email?redirect=/apply", { state: { from: location.pathname }, replace: true });
    }
  }, [navigate, location]);

  /* Prefill (profil/slug/id ile) */
  useEffect(() => {
    const fromState = location.state?.business;
    const params = new URLSearchParams(location.search);
    const qId = params.get("id");
    const qSlug = params.get("slug");
    const qName = params.get("name");

    const prefillFromBusiness = (b) => {
      if (!b) return;
      setBiz({ _id: b._id, name: b.name || "", slug: b.slug || b.handle || "" });
      const igUser =
        b.instagramUsername ||
        (typeof b.instagram === "string" ? b.instagram.replace(/^@/, "") : "") ||
        "";
      const igUrl = b.instagramUrl || (igUser ? `https://instagram.com/${igUser}` : "") || "";
      const phone = prettyPhone(b.phone || (Array.isArray(b.phones) ? b.phones[0] : "") || "");
      setForm((prev) => ({
        ...prev,
        name: b.name || prev.name,
        type: b.type || b.category || prev.type,
        address: b.address || b.fullAddress || b.location?.address || prev.address,
        phone,
        email: b.email || prev.email,
        instagramUsername: igUser ? `@${igUser}` : prev.instagramUsername,
        instagramUrl: igUrl || prev.instagramUrl,
      }));
    };

    if (fromState) { prefillFromBusiness(fromState); return; }

    (async () => {
      try {
        if (qId) {
          const { data } = await axios.get(`${API}/api/businesses/${encodeURIComponent(qId)}`, { timeout: 12000 });
          const b = data?.business || data || null;
          if (b) prefillFromBusiness(b);
        } else if (qSlug) {
          const tryUrls = [
            `${API}/api/businesses/by-slug/${encodeURIComponent(qSlug)}`,
            `${API}/api/businesses/handle/${encodeURIComponent(qSlug)}`,
            `${API}/api/businesses/search?q=${encodeURIComponent(qSlug)}`
          ];
          for (const u of tryUrls) {
            try {
              const { data } = await axios.get(u, { timeout: 12000 });
              const b = data?.business || data?.result || data?.businesses?.[0] || (data?._id ? data : null);
              if (b) { prefillFromBusiness(b); break; }
            } catch {}
          }
        } else if (qName) {
          const { data } = await axios.get(`${API}/api/businesses/search?q=${encodeURIComponent(qName)}`, { timeout: 12000 });
          const b = data?.businesses?.[0];
          if (b) prefillFromBusiness(b);
        }
      } catch {}
    })();
  }, [location, API]);

  /* Taslak yükle */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.form) setForm(parsed.form);
        if (Array.isArray(parsed.filesMeta)) {
          setFiles(parsed.filesMeta.map(m => ({ file: null, note: m.note || "", blur: !!m.blur, name: m.name || "" })));
        }
        if (parsed.biz) setBiz(parsed.biz);
      }
    } catch {}
  }, []);

  /* Taslak kaydet */
  useEffect(() => {
    const id = setTimeout(() => {
      const filesMeta = files.map(f => ({ name: f.file?.name || f.name || "", note: f.note, blur: !!f.blur }));
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, filesMeta, biz }));
    }, 400);
    return () => clearTimeout(id);
  }, [form, files, biz]);

  /* Öneriler */
  const igSuggestion = useMemo(() => usernameFromUrl(form.instagramUrl), [form.instagramUrl]);
  const phoneSuggestions = useMemo(() => {
    const fromAddr = (form.address || "").match(PHONE_RE) || [];
    const all = new Set(fromAddr.map(prettyPhone).concat(form.phone ? [prettyPhone(form.phone)] : []));
    return [...all].filter(Boolean).slice(0, 3);
  }, [form.address, form.phone]);

  /* Validasyon */
  const v = {
    name: (form.name || "").trim().length >= 2,
    type: (form.type || "").trim().length >= 2,
    phone: digitsOnly(form.phone || "").length >= 10,
    email: validEmail(form.email || ""),
    ig: Boolean((form.instagramUsername || "").trim()) || /instagram\.com\//i.test(form.instagramUrl || ""),
    address: (form.address || "").trim().length >= 5,
  };
  const canNext1 = v.name && v.type;
  const canNext2 = v.phone && v.email && v.ig && v.address;
  const canSubmit = canNext1 && canNext2;

  /* --------- GÖRSEL seçimi (yalnızca image/* ve en fazla 5) ---------- */
  const onPickFiles = (list) => {
    setUploadError("");
    const incoming = Array.from(list || []);
    const next = [];
    let rejectedType = false;
    for (const f of incoming) {
      if (!f.type.startsWith("image/")) { rejectedType = true; continue; }
      if (f.size > MAX_SIZE) { rejectedType = true; continue; }
      next.push({ file: f, note: "", blur: false });
    }
    let merged = [...files, ...next];
    if (merged.length > MAX_IMAGES) {
      merged = merged.slice(0, MAX_IMAGES);
      setUploadError(`En fazla ${MAX_IMAGES} görsel ekleyebilirsiniz. Fazlası otomatik çıkarıldı.`);
    } else if (rejectedType) {
      setUploadError("Sadece görsel dosyalar (JPG/PNG/WEBP) kabul ediliyor ve her biri 10MB'ı geçmemeli.");
    }
    setFiles(merged);
  };
  const removeFile = (i) => setFiles(prev => prev.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    setFiles(prev => {
      const c = [...prev];
      const j = i + dir;
      if (j < 0 || j >= c.length) return c;
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  };

  /* -------- Gönder -------- */
  const handleSubmit = async () => {
    try {
      setError("");

      if (!canSubmit) {
        setError("Lütfen zorunlu alanları tamamlayın.");
        return;
      }
      if (files.length > MAX_IMAGES) {
        setError(`En fazla ${MAX_IMAGES} görsel yükleyebilirsiniz.`);
        return;
      }

      setSubmitting(true);

      const token = localStorage.getItem("emailVerifyToken");
      const headers = token ? { "x-verify-token": token } : {};

      // Payload'ı normalize et
      const norm = {
        ...form,
        instagramUsername: (form.instagramUsername || "").replace(/^@/, ""),
        phone: digitsOnly(form.phone || ""),
      };

      // **cevap**
      let resp;

      if (files.length > 0) {
        const fd = new FormData();
        Object.entries(norm).forEach(([k, v]) => fd.append(k, v || ""));
        if (biz?._id) fd.append("business", biz._id);

        const notes = [];
        files.forEach((f, idx) => {
          if (f.file) fd.append("documents", f.file); // backend alan adı
          notes.push({ index: idx, note: f.note || "", blur: !!f.blur, name: f.file?.name || f.name || "" });
        });
        fd.append("documentNotes", JSON.stringify(notes)); // boş bile olsa gönder

        resp = await axios.post(`${API}/api/apply`, fd, {
          headers: { ...headers, "Content-Type": "multipart/form-data" },
        });
      } else {
        const payload = { ...norm };
        if (biz?._id) payload.business = biz._id;
        payload.documentNotes = [];
        resp = await axios.post(`${API}/api/apply`, payload, { headers });
      }

      // **Yeni: requestId ve dosya yollarını al**
      const rid =
        resp?.data?.requestId ||
        resp?.data?._id ||
        resp?.data?.id ||
        "";

      const returnedFiles = Array.isArray(resp?.data?.files) ? resp.data.files : [];

      setServerReqId(rid);
      setServerFiles(returnedFiles);

      setShowPopup(true);
      setStep(4); // Son sayfada göster
      // İstersen formu temizle; görsel grid'i server'dan geldiği için sorun olmaz
      setForm({
        name: "", type: "", instagramUsername: "", instagramUrl: "",
        phone: "", address: "", email: "", note: "",
      });
      setFiles([]);
      setBiz(null);
      localStorage.removeItem(DRAFT_KEY);

      const t = setTimeout(() => setShowPopup(false), 8000);
      return () => clearTimeout(t);
    } catch (err) {
      // Backend mesajını yansıt
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        (err?.response ? `Sunucu hatası (${err.response.status})` : "Ağ/istemci hatası");
      setError(msg);
      console.error("[apply] submit error:", err);
      if (err?.response?.status === 401) {
        navigate("/verify-email?redirect=/apply", { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* -------- Render -------- */
  return (
    <div style={{ padding: 28, maxWidth: 960, margin: "0 auto", fontFamily: "Inter, Segoe UI, system-ui, sans-serif" }}>
      {/* Başlık + Stepper */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: "#111827", fontWeight: 800 }}>İşletme Doğrulama Başvurusu</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={stepDot(step === 1, step > 1)} />
          <div style={{ width: 50, height: 2, background: step > 1 ? "#6b7280" : "#e5e7eb" }} />
          <div style={stepDot(step === 2, step > 2)} />
          <div style={{ width: 50, height: 2, background: step > 2 ? "#6b7280" : "#e5e7eb" }} />
          <div style={stepDot(step === 3, step > 3)} />
          <div style={{ width: 50, height: 2, background: step > 3 ? "#6b7280" : "#e5e7eb" }} />
          <div style={stepDot(step === 4, false)} />
        </div>
      </div>

      {/* Prefill bilgi çubuğu */}
      {biz && (
        <div style={{ ...card, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fffb" }}>
          <div>
            <b>Seçili İşletme:</b> {biz.name || "-"} {biz.slug ? <span style={{ opacity: .7 }}>({biz.slug})</span> : null}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {biz.slug && (
              <a href={`/isletme/${biz.slug}`} className="lnk" style={{ ...subtleBtn, textDecoration: "none" }}>
                Profili Aç
              </a>
            )}
            <button style={{ ...subtleBtn, background: "#fff1f2", borderColor: "#fecdd3" }} onClick={() => setBiz(null)}>
              Bağı Kaldır
            </button>
          </div>
        </div>
      )}

      {/* Yasal mini uyarı */}
      <div style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16, background: "#f8fffb" }}>
        <div style={{ fontSize: 20 }}>ℹ️</div>
        <div style={{ fontSize: 14, color: "#374151" }}>
          Lütfen doğru ve güncel bilgiler girin. Gönderdiğiniz görseller yalnızca doğrulama amacıyla incelenir ve gizlilik ilkelerine uygun şekilde saklanır.
        </div>
      </div>

      {/* Adım 1: İşletme Bilgileri */}
      {step === 1 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={label}>İşletme Adı *</div>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={inputStyle(v.name)}
                placeholder="Örn: Kule Sapanca"
              />
            </div>
            <div>
              <div style={label}>İşletme Türü *</div>
              <input
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                style={inputStyle(v.type)}
                placeholder="Örn: Otel, Kafe, Mağaza"
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={label}>Adres *</div>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                style={inputStyle(v.address)}
                placeholder="Açık adres"
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={label}>Başvuru Notu (opsiyonel)</div>
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                style={{ ...inputStyle(true), minHeight: 90 }}
                placeholder="Kısaca ek bilgi/bağlam ekleyebilirsiniz."
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <button
              onClick={() => {
                setForm({ name: "", type: "", instagramUsername: "", instagramUrl: "", phone: "", address: "", email: "", note: "" });
                setFiles([]); setBiz(null); localStorage.removeItem(DRAFT_KEY);
              }}
              style={subtleBtn}
            >
              Taslağı Temizle
            </button>
            <button disabled={!canNext1} onClick={() => setStep(2)} style={{ ...btn, opacity: canNext1 ? 1 : 0.5 }}>
              Devam Et ➜
            </button>
          </div>
        </div>
      )}

      {/* Adım 2: İletişim & Sosyal */}
      {step === 2 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={label}>Telefon *</div>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: prettyPhone(e.target.value) })}
                style={inputStyle(v.phone)}
                placeholder="0XXX XXX XX XX"
              />
              {!!phoneSuggestions.length && (
                <div>
                  <div style={{ ...label, marginTop: 4 }}>Önerilen</div>
                  {phoneSuggestions.map((p, i) => (
                    <span key={i} style={{ ...chip, background: "#ecfdf5", borderColor: "#bbf7d0" }} onClick={() => setForm({ ...form, phone: prettyPhone(p) })}>
                      {prettyPhone(p)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div style={label}>E-posta *</div>
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                style={inputStyle(v.email)}
                placeholder="iletisim@ornek.com"
              />
            </div>

            <div>
              <div style={label}>Instagram Kullanıcı Adı</div>
              <input
                value={form.instagramUsername}
                onChange={(e) => setForm({ ...form, instagramUsername: e.target.value.replace(/\s/g, "") })}
                style={inputStyle(true)}
                placeholder="@kullanici"
              />
            </div>
            <div>
              <div style={label}>Instagram URL</div>
              <input
                value={form.instagramUrl}
                onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })}
                style={inputStyle(true)}
                placeholder="https://instagram.com/hesap"
              />
              {!!igSuggestion && (
                <div style={{ marginTop: 6 }}>
                  <span
                    style={chip}
                    title="Kullanıcı adını doldur"
                    onClick={() => setForm({ ...form, instagramUsername: "@" + igSuggestion })}
                  >
                    @{igSuggestion}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <button onClick={() => setStep(1)} style={subtleBtn}>⟵ Geri</button>
            <button disabled={!canNext2} onClick={() => setStep(3)} style={{ ...btn, opacity: canNext2 ? 1 : 0.5 }}>
              Devam Et ➜
            </button>
          </div>
        </div>
      )}

      {/* Adım 3: Galeri (opsiyonel) */}
      {step === 3 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); onPickFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "#10b981" : "#d1d5db"}`,
              borderRadius: 14, padding: 20, textAlign: "center",
              background: dragOver ? "rgba(16,185,129,0.06)" : "transparent",
              cursor: "pointer", marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 700, color: "#111827" }}>Görsel yükle (sürükle-bırak veya tıkla)</div>
            <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
              JPG/PNG/WEBP – <b>en fazla {MAX_IMAGES} görsel</b>, her biri maks 10MB
            </div>
            <input
              ref={fileInputRef}
              style={{ display: "none" }}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => onPickFiles(e.target.files)}
            />
          </div>

          {uploadError && <div style={{ color: "#b91c1c", marginBottom: 8, fontWeight: 600 }}>{uploadError}</div>}

          {!!files.length && (
            <>
              <div style={{ marginBottom: 6, fontSize: 13, color: "#374151" }}>
                Seçilen görseller: {files.length}/{MAX_IMAGES}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
                {files.map((item, idx) => {
                  const url = item.file ? URL.createObjectURL(item.file) : "";
                  return (
                    <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                      <div style={{ position: "relative", height: 140, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {url ? (
                          <img
                            src={url}
                            alt=""
                            style={{
                              width: "100%", height: "100%", objectFit: "cover",
                              filter: item.blur ? "blur(6px)" : "none", transition: "filter .2s",
                            }}
                          />
                        ) : (
                          <div style={{ color: "#9ca3af", fontSize: 13 }}>Önizleme yok</div>
                        )}
                        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
                          <button onClick={() => setFiles(p => p.map((f, i) => i === idx ? { ...f, blur: !f.blur } : f))} style={subtleBtn} title="Blur (önizleme)">Blur</button>
                          <button onClick={() => move(idx, -1)} style={subtleBtn} title="Yukarı taşı">↑</button>
                          <button onClick={() => move(idx, +1)} style={subtleBtn} title="Aşağı taşı">↓</button>
                          <button onClick={() => removeFile(idx)} style={{ ...subtleBtn, background: "#fff1f2", borderColor: "#fecdd3" }} title="Kaldır">Sil</button>
                        </div>
                      </div>
                      <div style={{ padding: 10 }}>
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{item.file?.name || item.name || "Görsel"}</div>
                        <textarea
                          placeholder="Kısa not (örn. 'Ön cephe')"
                          value={item.note}
                          onChange={(e) => setFiles(prev => prev.map((f, i) => i === idx ? { ...f, note: e.target.value } : f))}
                          style={{ ...inputStyle(true), minHeight: 70, marginBottom: 0 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <button onClick={() => setStep(2)} style={subtleBtn}>⟵ Geri</button>
            <button onClick={() => setStep(4)} style={btn}>Devam Et ➜</button>
          </div>
        </div>
      )}

      {/* Adım 4: Önizleme & Gönder */}
      {step === 4 && (
        <div style={{ ...card }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
            <div>
              <div style={{ ...card, padding: 16, border: "1px dashed #e5e7eb", background: "#fbfbff" }}>
                <div style={{ fontWeight: 800, marginBottom: 8, color: "#111827" }}>Özet</div>
                <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                  {biz && (<><b>İşletme Kaydı:</b> {biz.name} {biz.slug ? `(${biz.slug})` : ""}<br/></>)}
                  <b>İşletme:</b> {form.name || "-"} <br />
                  <b>Tür:</b> {form.type || "-"} <br />
                  <b>Adres:</b> {form.address || "-"} <br />
                  <b>Telefon:</b> {form.phone || "-"} <br />
                  <b>E-posta:</b> {form.email || "-"} <br />
                  <b>Instagram:</b> {form.instagramUsername || form.instagramUrl || "-"} <br />
                  {!!form.note && (<><b>Not:</b> {form.note}</>)}
                </div>
              </div>

              {/* Yeni: Sunucuya yüklenen belgeler (hemen göster) */}
              {serverReqId && (
                <div style={{ ...card, padding: 16, marginTop: 16 }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>Sunucuya Yüklenen Belgeler</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {(
                      serverFiles.length
                        ? serverFiles.map(f => f.path?.startsWith("/") ? f.path : `/${f.path}`)
                        : ["01.jpg","02.jpg","03.jpg","04.jpg","05.jpg"].map(n => imgSrc(serverReqId, n))
                    ).map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt={`doc-${i+1}`}
                        loading="lazy"
                        decoding="async"
                        onError={(e)=>{ e.currentTarget.style.display = "none"; }}
                        className="w-full h-28 object-cover rounded"
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
                    Klasör: <code>/uploads/apply/{serverReqId}</code>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div style={{ ...card, padding: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Son Kontrol</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: "#374151", fontSize: 14 }}>
                  <li>Bilgiler doğru ve günceldir.</li>
                  <li>Görsellerde gerekliyse <b>bulanıklaştırma</b> uygulanmıştır.</li>
                  <li>Gizlilik ve kullanım şartlarını kabul ediyorum.</li>
                </ul>
                {error && <p style={{ color: "#b91c1c", marginTop: 12, fontWeight: 700 }}>{error}</p>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                  <button onClick={() => setStep(3)} style={subtleBtn}>⟵ Galeriye Dön</button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !canSubmit}
                    style={{ ...btn, background: submitting ? "#9ca3af" : "#27ae60" }}
                  >
                    {submitting ? "Gönderiliyor…" : "Başvuruyu Gönder"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Başarı Popup */}
      {showPopup && (
        <div style={popupOverlay}>
          <div style={popupBox}>
            <h3>Başvurunuz Değerlendirmeye Alınmıştır</h3>
            <p>En kısa sürede değerlendirilip size e-posta üzerinden bilgi verilecektir.</p>
            <button onClick={() => setShowPopup(false)} style={{ ...btn, padding: "10px 16px" }}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Popup styles */
const popupOverlay = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};
const popupBox = {
  backgroundColor: "#fff",
  padding: 24,
  borderRadius: 14,
  maxWidth: 520,
  textAlign: "center",
  boxShadow: "0px 10px 28px rgba(0,0,0,0.25)",
};
