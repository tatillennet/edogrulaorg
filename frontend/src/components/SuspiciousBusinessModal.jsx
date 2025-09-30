// frontend/src/components/SuspiciousBusinessModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

/**
 * Props:
 * - open, onClose
 * - business: {_id, name, phones?:string[], instagram?:string, website?:string, slug?:string}
 * - topReport: {_id, title?, createdAt?, supportCount?}
 * - apiBase: string
 */
export default function SuspiciousBusinessModal({ open, onClose, business, topReport, apiBase }) {
  const nav = useNavigate();

  /* -------------------- Derived -------------------- */
  const mainPhone = useMemo(
    () => (Array.isArray(business?.phones) && business.phones[0]) || "",
    [business?.phones]
  );
  const insta = (business?.instagram || "").replace(/^@/, "");
  const instaUrl = insta ? `https://instagram.com/${insta}` : null;
  const websiteUrl = toHttpsOrNull(business?.website);
  const slugOrId = business?.slug || business?.instagram || business?._id;

  const [supporting, setSupporting] = useState(false);
  const [supportCount, setSupportCount] = useState(topReport?.supportCount || 0);
  const [toast, setToast] = useState(null);
  const [mounted, setMounted] = useState(false);

  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  const alreadySupported = useMemo(() => {
    try {
      const arr = JSON.parse(localStorage.getItem("supportedReports") || "[]");
      return topReport?._id && arr.includes(topReport._id);
    } catch {
      return false;
    }
  }, [topReport?._id]);

  /* -------------------- Lifecycle -------------------- */
  useEffect(() => {
    if (!open) return;
    setMounted(true);
    // body scroll lock + remember focus
    previouslyFocused.current = document.activeElement;
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    // focus the close button
    setTimeout(() => {
      const btn = dialogRef.current?.querySelector("[data-autofocus]");
      btn?.focus();
    }, 0);

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        safeClose();
      } else if (e.key === "Tab") {
        trapFocus(e, dialogRef.current);
      }
    };
    document.addEventListener("keydown", onKey, true);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.documentElement.style.overflow = prevOverflow;
      setMounted(false);
      // restore focus
      previouslyFocused.current && previouslyFocused.current.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  /* -------------------- Actions -------------------- */
  const safeClose = () => {
    onClose?.();
  };

  const goProfile = () => {
    if (!slugOrId) return;
    nav(`/isletme/${encodeURIComponent(slugOrId)}`);
    safeClose();
  };

  const callPhone = () => {
    if (!mainPhone) return;
    window.location.href = `tel:${digitsOnly(mainPhone)}`;
  };

  const openWhatsApp = () => {
    if (!mainPhone) return;
    const msg = `Merhaba, E-Doğrula üzerinden yazıyorum. Bilgi almak istiyorum.`;
    window.open(toWa(mainPhone, msg), "_blank", "noopener,noreferrer");
  };

  const openExternal = (url) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const shareBiz = async () => {
    const title = business?.name || "İşletme";
    const text = "Bu işletme için topluluk uyarısı var. Göz atın.";
    const url = slugOrId ? `${location.origin}/isletme/${encodeURIComponent(slugOrId)}` : location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast("Kopyalandı.", "success");
      }
    } catch {
      // kullanıcı iptal etti
    }
  };

  const supportReport = async () => {
    if (!topReport?._id || supporting || alreadySupported) return;
    setSupporting(true);
    try {
      // fingerprint (dayanıklı / fallback’li)
      const fp = await getFingerprint();

      // İyimser güncelleme
      setSupportCount((x) => (Number.isFinite(x) ? x + 1 : 1));

      const { data } = await axios.post(
        `${apiBase.replace(/\/+$/, "")}/api/reports/${topReport._id}/support`,
        { fingerprint: fp },
        { withCredentials: true }
      );

      setSupportCount(
        Number.isFinite(Number(data?.supportCount)) ? Number(data.supportCount) : (prev) => prev
      );

      persistSupported(topReport._id);
      showToast("İhbarı desteklediniz. Teşekkürler!", "success");
    } catch {
      // İyimserliği geri al
      setSupportCount((x) => Math.max(0, x - 1));
      showToast("İşlem yapılamadı. Lütfen daha sonra tekrar deneyin.", "error");
    } finally {
      setSupporting(false);
    }
  };

  /* -------------------- Render -------------------- */
  const titleId = "suspicious-title";
  const descId = "suspicious-desc";

  return (
    <div
      style={{ ...S.backdrop, opacity: mounted ? 1 : 0, backdropFilter: "saturate(140%) blur(6px)" }}
      onMouseDown={(e) => {
        // backdrop tıklaması
        if (e.target === e.currentTarget) safeClose();
      }}
      aria-hidden={!open}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        style={{
          ...S.modal,
          transform: mounted ? "translateY(0) scale(1)" : "translateY(12px) scale(.98)",
          opacity: mounted ? 1 : 0,
        }}
        onMouseDown={(e) => {
          // içerik tıklamalarında bubbling’i kes (backdrop kapanmasın)
          e.stopPropagation();
        }}
      >
        {/* Close */}
        <button
          onClick={safeClose}
          aria-label="Kapat"
          data-autofocus
          style={S.close}
        >
          ×
        </button>

        {/* Header icon */}
        <div style={S.iconWrap}>
          <div style={S.icon}>⚠️</div>
        </div>

        <h2 id={titleId} style={S.title}>Olası Dolandırıcı İşletme</h2>

        {/* Body */}
        <div style={S.contentRow}>
          {/* LEFT */}
          <div style={S.leftCol}>
            <div style={S.infoList}>
              <div style={S.infoRow}>
                🏷️ <b>{business?.name || "—"}</b>
              </div>

              {mainPhone ? (
                <div style={S.infoRow}>
                  📱{" "}
                  <a href={`tel:${digitsOnly(mainPhone)}`} style={S.link}>
                    {formatPhone(mainPhone)}
                  </a>
                </div>
              ) : null}

              {insta ? (
                <div style={S.infoRow}>
                  📷{" "}
                  <a href={instaUrl} target="_blank" rel="noopener noreferrer" style={S.link}>
                    @{insta}
                  </a>
                </div>
              ) : null}

              {websiteUrl ? (
                <div style={S.infoRow}>
                  🌐{" "}
                  <a href={websiteUrl} target="_blank" rel="noopener noreferrer" style={S.link}>
                    {stripProtocol(websiteUrl)}
                  </a>
                </div>
              ) : null}
            </div>

            <div id={descId} style={S.alert}>
              <b>Dikkat:</b> Bu işletme kara listede. İşlem yapmadan önce dikkatli olun.
            </div>

            {topReport ? (
              <div style={S.reportCard}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Son ihbar</div>
                <div style={{ opacity: 0.9 }}>
                  {topReport.title || "Mağdur bildirimine bakın…"}
                </div>

                <div style={S.metaRow}>
                  <div style={S.badges}>
                    <span style={S.badge}>Destek: <b>{Number(supportCount) || 0}</b></span>
                    {topReport.createdAt ? (
                      <span style={S.badgeMuted}>{fromNow(topReport.createdAt)}</span>
                    ) : null}
                  </div>

                  <button
                    onClick={supportReport}
                    disabled={supporting || alreadySupported}
                    style={{
                      ...S.supportBtn,
                      cursor: (supporting || alreadySupported) ? "not-allowed" : "pointer",
                      opacity: (supporting || alreadySupported) ? 0.75 : 1,
                    }}
                    title={alreadySupported ? "Zaten desteklediniz" : "Bu ihbarı destekle"}
                  >
                    {alreadySupported ? "Desteklendi ✓" : (supporting ? "Gönderiliyor…" : "İhbarı Destekle")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* RIGHT CTA */}
          <div style={S.rightCol}>
            <div style={S.ctaCard}>
              <div>
                <div style={S.ctaTitle}>İşletmeyi İncele</div>
                <p style={S.ctaText}>
                  Profil sayfasında belgeler, yorumlar ve tüm detayları görün.
                </p>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <button onClick={goProfile} style={S.ctaBtnPrimary}>İşletmeyi İncele</button>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button onClick={callPhone} style={S.ctaBtnGhost} disabled={!mainPhone} title="Ara">
                    Ara
                  </button>
                  <button onClick={openWhatsApp} style={S.ctaBtnGhost} disabled={!mainPhone} title="WhatsApp">
                    WhatsApp
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button onClick={() => openExternal(instaUrl)} style={S.ctaBtnGhost} disabled={!instaUrl} title="Instagram">
                    Instagram
                  </button>
                  <button onClick={() => openExternal(websiteUrl)} style={S.ctaBtnGhost} disabled={!websiteUrl} title="Web">
                    Web
                  </button>
                </div>

                <button onClick={shareBiz} style={S.ctaBtnGhost}>
                  Paylaş
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div style={S.actions}>
          <button onClick={goProfile} style={S.primary}>Profili Aç</button>
          <button onClick={safeClose} style={S.secondary}>Kapat</button>
        </div>

        {/* Toast */}
        <div aria-live="polite" aria-atomic="true" style={S.toastWrap}>
          {toast ? (
            <div
              style={{
                ...S.toast,
                background: toast.type === "success" ? "#14b8a6" : "#ef4444",
              }}
            >
              {toast.msg}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  /* -------------------- helpers -------------------- */
  function showToast(msg, type) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2800);
  }
}

/* ============================ Styles ============================ */
const T = {
  card: "#ffffff",
  border: "#e5e7eb",
  text: "#0f172a",
  danger: "#e11d48",
  dangerSoft: "#ffe7ea",
  brand: "#22c55e",
  brandSoft: "#ecfdf5",
  muted: "#f1f5f9",
  shadow: "0 30px 80px rgba(2,6,23,.28)",
};
const S = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(3,7,18,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    transition: "opacity .18s ease",
  },
  modal: {
    width: "min(760px, 94vw)",
    background: T.card,
    borderRadius: 16,
    padding: "22px 24px 26px",
    position: "relative",
    boxShadow: T.shadow,
    border: `1px solid ${T.border}`,
    transition: "transform .18s ease, opacity .18s ease",
  },
  close: {
    position: "absolute",
    right: 12,
    top: 10,
    border: "none",
    background: "transparent",
    fontSize: 26,
    cursor: "pointer",
    lineHeight: 1,
    opacity: 0.65,
  },
  iconWrap: { display: "flex", justifyContent: "center", marginTop: 6 },
  icon: {
    width: 80,
    height: 80,
    display: "grid",
    placeItems: "center",
    fontSize: 38,
    color: "#fff",
    borderRadius: "50%",
    background: "radial-gradient(closest-side, #FB415C 0%, #e11d48 70%)",
    boxShadow: "0 0 44px rgba(251,65,92,.35)",
  },
  title: { textAlign: "center", margin: "14px 0 12px", fontSize: 22, fontWeight: 800 },

  contentRow: { display: "flex", gap: 16, alignItems: "stretch", flexWrap: "wrap", marginTop: 6 },
  leftCol: { flex: "1 1 380px", minWidth: 300 },
  rightCol: { flex: "0 0 300px", minWidth: 260 },

  infoList: { margin: "6px 0 8px", display: "grid", gap: 6 },
  infoRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 15 },
  link: { color: T.text, fontWeight: 700, textDecoration: "none" },

  alert: {
    background: "#fee2e2",
    color: "#7f1d1d",
    border: "1px solid #fecaca",
    borderRadius: 10,
    padding: "10px 12px",
    margin: "10px 0 12px",
    fontSize: 14.5,
  },

  reportCard: {
    background: "#f9fafb",
    border: "1px solid #eef2f7",
    borderRadius: 12,
    padding: "12px 14px",
    marginBottom: 10,
  },
  metaRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 10 },
  badges: { display: "flex", gap: 8, flexWrap: "wrap" },
  badge: { background: T.brandSoft, color: "#065f46", border: "1px solid #bbf7d0", borderRadius: 999, padding: "4px 8px", fontSize: 12, fontWeight: 800 },
  badgeMuted: { background: T.muted, color: "#334155", border: `1px solid ${T.border}`, borderRadius: 999, padding: "4px 8px", fontSize: 12, fontWeight: 700 },

  supportBtn: { border: "none", padding: "8px 12px", borderRadius: 10, background: T.dangerSoft, color: "#b91c1c", fontWeight: 800 },

  ctaCard: {
    background: "#f8fafc",
    border: `1px solid ${T.border}`,
    borderRadius: 12,
    padding: 14,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: 12,
  },
  ctaTitle: { fontWeight: 900, fontSize: 16 },
  ctaText: { fontSize: 14, opacity: 0.9, margin: 0 },
  ctaBtnPrimary: { background: T.brand, color: "#fff", border: "none", padding: "10px 12px", borderRadius: 12, fontWeight: 900, cursor: "pointer" },
  ctaBtnGhost: { background: "#fff", color: T.text, border: `1px solid ${T.border}`, padding: "10px 12px", borderRadius: 12, fontWeight: 800, cursor: "pointer" },

  actions: { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 },
  primary: { background: "#FB415C", color: "#fff", border: "none", padding: "10px 14px", borderRadius: 12, fontWeight: 800, cursor: "pointer" },
  secondary: { background: T.muted, color: T.text, border: `1px solid ${T.border}`, padding: "10px 14px", borderRadius: 12, fontWeight: 700, cursor: "pointer" },

  toastWrap: { position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 12, pointerEvents: "none" },
  toast: { color: "#fff", padding: "8px 12px", borderRadius: 10, fontWeight: 700, boxShadow: "0 10px 24px rgba(0,0,0,.18)" },
};

/* ============================ Utils ============================ */
function toHttpsOrNull(u) {
  if (!u) return null;
  const s = String(u).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}
function stripProtocol(u = "") {
  return u.replace(/^https?:\/\//i, "");
}
function digitsOnly(p = "") {
  return String(p).replace(/\D/g, "");
}
function formatPhone(p = "") {
  const d = digitsOnly(p);
  if (d.length < 10) return p;
  // 0xxx xxx xx xx
  return d.replace(/^0?(\d{3})(\d{3})(\d{2})(\d{2})$/, "0$1 $2 $3 $4");
}
function toWa(phone, text) {
  const digits = digitsOnly(phone);
  let intl = digits;
  if (digits.startsWith("0")) intl = "90" + digits.slice(1);
  if (digits.startsWith("90")) intl = digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text || "")}`;
}
function fromNow(d) {
  const t = new Date(d).getTime();
  if (!isFinite(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "az önce";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} gün önce`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} ay önce`;
  const y = Math.floor(mo / 12);
  return `${y} yıl önce`;
}
/** Focus trap for dialog */
function trapFocus(e, root) {
  const FOCUSABLE =
    'a[href], button, textarea, input, select, summary, [tabindex]:not([tabindex="-1"])';
  const nodes = Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden")
  );
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const isShift = e.shiftKey;

  if (isShift && document.activeElement === first) {
    last.focus();
    e.preventDefault();
  } else if (!isShift && document.activeElement === last) {
    first.focus();
    e.preventDefault();
  }
}
/** Persist supported report id to localStorage */
function persistSupported(id) {
  try {
    const arr = JSON.parse(localStorage.getItem("supportedReports") || "[]");
    if (!arr.includes(id)) {
      arr.push(id);
      localStorage.setItem("supportedReports", JSON.stringify(arr));
    }
  } catch {}
}
/** Stable fingerprint with fallback when SubtleCrypto is unavailable */
async function getFingerprint() {
  try {
    const fpRaw = (localStorage.getItem("uid") || "") + (navigator.language || "tr") + (navigator.userAgent || "");
    if (crypto?.subtle?.digest) {
      const buf = new TextEncoder().encode(fpRaw);
      const hash = await crypto.subtle.digest("SHA-256", buf);
      return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    // Fallback: djb2
    let h = 5381;
    for (let i = 0; i < fpRaw.length; i++) h = (h * 33) ^ fpRaw.charCodeAt(i);
    return (h >>> 0).toString(16);
  } catch {
    return Math.random().toString(16).slice(2);
  }
}
