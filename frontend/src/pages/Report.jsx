import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";

/** ---------- Mini yardımcılar (AI-like regex çıkarımları) ---------- */
const REGEX = {
  iban: /\bTR\d{24}\b/gi,
  phone: /(\+90\s?)?0?\s?5\d{2}\s?\d{3}\s?\d{2}\s?\d{2}\b/g,
  instagram: /(?:@|instagram\.com\/)([A-Za-z0-9._]{2,30})/gi,
  amount: /(?:₺|TL|TRY)\s?([0-9]{1,3}(\.[0-9]{3})*(,[0-9]{1,2})?|[0-9]+([.,][0-9]{1,2})?)/gi,
  date: /\b(0?[1-9]|[12][0-9]|3[01])[./-](0?[1-9]|1[0-2])[./-](20\d{2})\b/g,
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
  // instagram handle'larını özel toparla (sadece kullanıcı adı)
  {
    const r = new RegExp(REGEX.instagram.source, REGEX.instagram.flags);
    let m;
    while ((m = r.exec(lower))) {
      igHandles.push(m[1]?.startsWith("@") ? m[1].slice(1) : m[1]);
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
  p
    .replace(/\D/g, "")
    .replace(/^0?(\d{3})(\d{3})(\d{2})(\d{2}).*/, "0$1 $2 $3 $4");

/** ---------- Stil yardımcıları ---------- */
const card = {
  background: "#fff",
  border: "1px solid #eaeaea",
  borderRadius: 14,
  boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
  padding: 20,
};

const inputStyle = (ok) => ({
  display: "block",
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1.5px solid ${ok ? "#2ecc71" : "#d0d7de"}`,
  outline: "none",
  fontSize: 15,
  marginBottom: 12,
});

const labelStyle = { fontSize: 13, color: "#6b7280", marginBottom: 6 };

const btn = {
  padding: "12px 18px",
  background: "#c0392b",
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

const stepDot = (active, done) => ({
  width: 10,
  height: 10,
  borderRadius: 999,
  background: active ? "#111827" : done ? "#6b7280" : "#d1d5db",
});

/** ---------- Bileşen ---------- */
export default function Report() {
  const navigate = useNavigate();
  const location = useLocation();

  // FORM DURUMU
  const [form, setForm] = useState({
    name: "",
    instagramUsername: "",
    instagramUrl: "",
    phone: "",
    desc: "",
  });

  // DELİLLER
  const [files, setFiles] = useState([]); // { file: File, note: string, blur: boolean }
  const [dragOver, setDragOver] = useState(false);

  // UI
  const [step, setStep] = useState(1); // 1: Bilgiler, 2: Deliller, 3: Önizleme & Gönder
  const [showPopup, setShowPopup] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Taslak
  const DRAFT_KEY = "reportDraft.v1";
  const fileInputRef = useRef(null);

  // ✅ Girişte doğrulama kontrolü (token veya bayrak)
  useEffect(() => {
    const token = localStorage.getItem("emailVerifyToken");
    const flag = localStorage.getItem("isVerifiedEmail");
    if (!token && !flag) {
      navigate("/verify-email?redirect=/report", { replace: true, state: { from: location.pathname } });
    }
  }, [navigate, location]);

  // ✅ Taslağı yükle
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.form) setForm(parsed.form);
        if (Array.isArray(parsed.filesMeta)) {
          // sadece metalar, gerçek File yeniden seçilmek zorunda (tarayıcı kısıtı)
          setFiles(parsed.filesMeta.map(m => ({ file: null, note: m.note || "", blur: !!m.blur, name: m.name || "" })));
        }
      }
    } catch {}
  }, []);

  // ✅ Taslağı kaydet (debounced basit)
  useEffect(() => {
    const id = setTimeout(() => {
      const filesMeta = files.map(f => ({ name: f.file?.name || f.name || "", note: f.note, blur: !!f.blur }));
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, filesMeta }));
    }, 400);
    return () => clearTimeout(id);
  }, [form, files]);

  // 🔎 Akıllı çıkarımlar (desc + ig url + phone)
  const signals = useMemo(() => {
    const fromDesc = extractSignals(form.desc);
    // phone alanında yazan numarayı da normalize et
    const phones = new Set(fromDesc.phones);
    if (form.phone) phones.add(prettyPhone(form.phone));
    // instagram alanlarından al
    const instas = new Set(fromDesc.instagrams);
    if (form.instagramUsername) instas.add(form.instagramUsername.replace(/^@/, ""));
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

  // 🚦 Validasyonlar
  const v = {
    name: form.name.trim().length >= 2,
    ig: form.instagramUsername.trim().length >= 2 || /instagram\.com\//i.test(form.instagramUrl),
    phone: form.phone.trim().length >= 10,
    desc: form.desc.trim().length >= 20,
  };
  const canNextFrom1 = v.name && v.ig && v.phone && v.desc;
  const canSubmit = canNextFrom1; // + dosya opsiyonel

  /** ---------- Dosyalar ---------- */
  const onPickFiles = (list) => {
    const arr = Array.from(list);
    const next = [];
    for (const f of arr) {
      const okType = ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(f.type);
      const okSize = f.size <= 10 * 1024 * 1024;
      if (okType && okSize) {
        next.push({ file: f, note: "", blur: false });
      }
    }
    const merged = [...files, ...next].slice(0, 10);
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

  /** ---------- Gönder ---------- */
  const handleSubmit = async () => {
    setError("");
    if (!canSubmit) return setError("Lütfen zorunlu alanları doldurun.");
    try {
      setSubmitting(true);
      const token = localStorage.getItem("emailVerifyToken");

      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("instagramUsername", form.instagramUsername);
      fd.append("instagramUrl", form.instagramUrl);
      fd.append("phone", form.phone);
      fd.append("desc", form.desc);

      const notes = [];
      files.forEach((f, idx) => {
        if (f.file) {
          fd.append("evidence", f.file); // backend: upload.array("evidence")
        }
        notes.push({ index: idx, note: f.note || "", blur: !!f.blur, name: f.file?.name || f.name || "" });
      });
      fd.append("evidenceNotes", JSON.stringify(notes));

      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/report`,
        fd,
        {
          headers: {
            ...(token ? { "x-verify-token": token } : {}), // token zorunlu backend’e göre
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setShowPopup(true);
      setForm({ name: "", instagramUsername: "", instagramUrl: "", phone: "", desc: "" });
      setFiles([]);
      localStorage.removeItem(DRAFT_KEY);
      // 10 sn popup sonra kapansın
      setTimeout(() => setShowPopup(false), 10000);
      setStep(1);
    } catch (err) {
      if (err?.response?.status === 401) {
        navigate("/verify-email?redirect=/report", { replace: true });
      } else {
        setError(err?.response?.data?.message || "❌ İhbar gönderilirken bir hata oluştu.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  /** ---------- Render ---------- */
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
          Delil yüklerken gizlemek istediğiniz kişisel veriler varsa önizlemede <b>“Blur”</b> kullanabilirsiniz (sadece önizleme içindir).
        </div>
      </div>

      {/* Adım 1: Bilgiler */}
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
              <div style={{ fontSize: 12, color: "#6b7280", textAlign: "right" }}>
                {form.desc.length} karakter
              </div>
            </div>
          </div>

          {/* Akıllı çıkarım çipleri */}
          <div style={{ marginTop: 8 }}>
            {!!signals.instagrams.length && (
              <div style={{ marginTop: 6 }}>
                <div style={labelStyle}>Önerilen Instagram</div>
                {signals.instagrams.slice(0, 5).map((h, i) => (
                  <span
                    key={`ig-${i}`}
                    style={chip}
                    title="Alan doldur"
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
                setFiles([]);
                localStorage.removeItem(DRAFT_KEY);
              }}
              style={subtleBtn}
              title="Taslağı temizle"
            >
              Taslağı Temizle
            </button>
            <button
              disabled={!canNextFrom1}
              onClick={() => setStep(2)}
              style={{ ...btn, opacity: canNextFrom1 ? 1 : 0.5 }}
            >
              Devam Et ➜
            </button>
          </div>
        </div>
      )}

      {/* Adım 2: Deliller */}
      {step === 2 && (
        <div style={{ ...card, marginBottom: 16 }}>
          {/* Drop Alanı */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); onPickFiles(e.dataTransfer.files); }}
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
            <div style={{ fontWeight: 700, color: "#111827" }}>Delil yükle (sürükle-bırak veya tıkla)</div>
            <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
              JPG/PNG/WEBP/PDF – max 10 dosya, 10MB
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

          {/* Dosya Kartları */}
          {!!files.length && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
              {files.map((item, idx) => {
                const isPDF = item.file?.type === "application/pdf" || (!item.file && (item.name || "").toLowerCase().endsWith(".pdf"));
                const url = item.file ? URL.createObjectURL(item.file) : "";
                return (
                  <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                    <div style={{ position: "relative", height: 140, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
                        <button onClick={() => setFiles(prev => prev.map((f, i) => i === idx ? { ...f, blur: !f.blur } : f))} style={subtleBtn} title="Blur (sadece önizleme)">Blur</button>
                        <button onClick={() => removeFile(idx)} style={{ ...subtleBtn, background: "#fff1f2", borderColor: "#fecdd3" }} title="Kaldır">Sil</button>
                      </div>
                    </div>
                    <div style={{ padding: 10 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{item.file?.name || item.name || "Delil"}</div>
                      <textarea
                        placeholder="Kısa not (örn. 'Kapora IBAN ekran görüntüsü')"
                        value={item.note}
                        onChange={(e) => setFiles(prev => prev.map((f, i) => i === idx ? { ...f, note: e.target.value } : f))}
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
                  <b>Tespitler:</b> {[
                    signals.ibans.length ? `${signals.ibans.length} IBAN` : null,
                    signals.amounts.length ? `${signals.amounts.length} tutar` : null,
                    signals.dates.length ? `${signals.dates.length} tarih` : null,
                  ].filter(Boolean).join(", ") || "-"}
                  <br />
                  <b>Açıklama:</b> {form.desc?.slice(0, 240) || "-"}{form.desc?.length > 240 ? "…" : ""}
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
                {error && <p style={{ color: "red", marginTop: 12 }}>{error}</p>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                  <button onClick={() => setStep(2)} style={subtleBtn}>⟵ Delillere Dön</button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !canSubmit}
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
            <button
              onClick={() => setShowPopup(false)}
              style={{ ...btn, background: "#16a34a", padding: "10px 16px" }}
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** ---------- Popup stilleri ---------- */
const popupOverlay = {
  position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)",
  display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000
};
const popupBox = {
  backgroundColor: "#fff", padding: 24, borderRadius: 14,
  maxWidth: 520, textAlign: "center",
  boxShadow: "0px 10px 28px rgba(0,0,0,0.25)"
};
