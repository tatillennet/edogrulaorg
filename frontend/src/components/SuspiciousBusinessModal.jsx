import React, { useMemo, useState } from "react";
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
  const [supporting, setSupporting] = useState(false);
  const [supportCount, setSupportCount] = useState(topReport?.supportCount || 0);
  const [toast, setToast] = useState(null);

  const alreadySupported = useMemo(() => {
    try {
      const arr = JSON.parse(localStorage.getItem("supportedReports") || "[]");
      return topReport?._id && arr.includes(topReport._id);
    } catch { return false; }
  }, [topReport?._id]);

  if (!open) return null;

  const goProfile = () => {
    const slugOrId = business?.slug || business?.instagram || business?._id;
    if (!slugOrId) return;
    nav(`/isletme/${encodeURIComponent(slugOrId)}`);
    onClose?.();
  };

  const supportReport = async () => {
    if (!topReport?._id || supporting || alreadySupported) return;
    setSupporting(true);
    try {
      const fpRaw = (localStorage.getItem("uid")||"") + (navigator.language||"tr") + navigator.userAgent;
      const buf = new TextEncoder().encode(fpRaw);
      const hash = await crypto.subtle.digest("SHA-256", buf);
      const fpHex = Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");

      const res = await axios.post(`${apiBase}/api/reports/${topReport._id}/support`,
        { fingerprint: fpHex }, { withCredentials: true });

      setSupportCount(res?.data?.supportCount ?? (supportCount+1));
      try {
        const arr = JSON.parse(localStorage.getItem("supportedReports") || "[]");
        if (!arr.includes(topReport._id)) {
          arr.push(topReport._id);
          localStorage.setItem("supportedReports", JSON.stringify(arr));
        }
      } catch {}
      setToast({ type: "success", msg: "İhbarı desteklediniz. Teşekkürler!" });
    } catch {
      setToast({ type: "error", msg: "İşlem yapılamadı. Lütfen daha sonra tekrar deneyin." });
    } finally {
      setSupporting(false);
      setTimeout(()=>setToast(null), 3000);
    }
  };

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <button onClick={onClose} aria-label="Kapat" style={styles.close}>×</button>

        <div style={styles.iconWrap}>
          <div style={styles.icon}>⚠️</div>
        </div>

        <h2 style={styles.title}>Olası Dolandırıcı İşletme</h2>

        {/* SOL İçerik + SAĞ CTA */}
        <div style={styles.contentRow}>
          <div style={styles.leftCol}>
            <div style={styles.infoList}>
              <div style={styles.infoRow}>🏷️ <b>{business?.name || "—"}</b></div>
              {business?.phones?.length ? (
                <div style={styles.infoRow}>📱 {business.phones.join(", ")}</div>
              ) : null}
              {business?.instagram ? <div style={styles.infoRow}>📷 @{business.instagram}</div> : null}
              {business?.website ? <div style={styles.infoRow}>🌐 {business.website}</div> : null}
            </div>

            <div style={styles.alert}>
              <b>Dikkat:</b> Bu işletme kara listede. İşlem yapmadan önce dikkatli olun.
            </div>

            {topReport ? (
              <div style={styles.reportCard}>
                <div style={{fontWeight:600, marginBottom:6}}>Son ihbar</div>
                <div style={{opacity:0.85}}>
                  {topReport.title || "Mağdur bildirimine bakın…"}
                </div>
                <div style={styles.metaRow}>
                  <span>Destek: <b>{supportCount}</b></span>
                  <button
                    onClick={supportReport}
                    disabled={supporting || alreadySupported}
                    style={{...styles.supportBtn, opacity: (supporting||alreadySupported)?0.7:1}}
                    title={alreadySupported ? "Zaten desteklediniz" : "Bu ihbarı destekle"}
                  >
                    {alreadySupported ? "Desteklendi✓" : supporting ? "Gönderiliyor…" : "İhbarı Destekle"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* SAĞ: kırmızı alan yerine CTA kartı */}
          <div style={styles.rightCol}>
            <div style={styles.ctaCard}>
              <div style={styles.ctaTitle}>İşletmeyi İncele</div>
              <p style={styles.ctaText}>
                Profil sayfasında belgeler, yorumlar ve tüm detayları görün.
              </p>
              <button onClick={goProfile} style={styles.ctaBtn}>
                İşletmeyi İncele
              </button>
            </div>
          </div>
        </div>

        {/* Alt aksiyonlar (istersen bırakabiliriz) */}
        <div style={styles.actions}>
          <button onClick={goProfile} style={styles.primary}>Profili Aç</button>
          <button onClick={onClose} style={styles.secondary}>Kapat</button>
        </div>

        {toast ? (
          <div style={{...styles.toast, background: toast.type==="success" ? "#14b8a6" : "#ef4444"}}>
            {toast.msg}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const styles = {
  backdrop: { position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 },
  modal: { width:"min(720px, 92vw)", background:"#fff", borderRadius:16, padding:"22px 24px 26px", position:"relative", boxShadow:"0 30px 80px rgba(0,0,0,0.28)" },
  close: { position:"absolute", right:12, top:10, border:"none", background:"transparent", fontSize:26, cursor:"pointer", lineHeight:1, opacity:0.6 },
  iconWrap: { display:"flex", justifyContent:"center", marginTop:8 },
  icon: { width:80, height:80, display:"grid", placeItems:"center", fontSize:38, color:"#fff", borderRadius:"50%", background:"radial-gradient(closest-side, #FB415C 0%, #e11d48 70%)", boxShadow:"0 0 44px rgba(251,65,92,.35)" },
  title: { textAlign:"center", margin:"14px 0 12px", fontSize:22, fontWeight:800 },

  /* Yeni layout */
  contentRow: { display:"flex", gap:16, alignItems:"stretch", flexWrap:"wrap", marginTop:6 },
  leftCol: { flex:"1 1 360px", minWidth:300 },
  rightCol: { flex:"0 0 280px", minWidth:260 },

  infoList: { margin:"6px 0 8px", display:"grid", gap:6 },
  infoRow: { display:"flex", alignItems:"center", gap:8, fontSize:15 },
  alert: { background:"#fee2e2", color:"#7f1d1d", border:"1px solid #fecaca", borderRadius:10, padding:"10px 12px", margin:"10px 0 12px", fontSize:14.5 },
  reportCard: { background:"#f9fafb", border:"1px solid #eef2f7", borderRadius:12, padding:"12px 14px", marginBottom:10 },
  metaRow: { display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:10 },
  supportBtn: { border:"none", padding:"8px 12px", borderRadius:10, cursor:"pointer", background:"#ffe7ea", color:"#b91c1c", fontWeight:700 },

  /* Sağ CTA */
  ctaCard: { background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:12, padding:"14px", height:"100%", display:"flex", flexDirection:"column", justifyContent:"space-between" },
  ctaTitle: { fontWeight:800, fontSize:16, marginBottom:6 },
  ctaText: { fontSize:14, opacity:0.85, marginBottom:10 },
  ctaBtn: { background:"#22c55e", color:"#fff", border:"none", padding:"10px 12px", borderRadius:12, fontWeight:800, cursor:"pointer" },

  actions: { display:"flex", gap:10, justifyContent:"flex-end", marginTop:12 },
  primary: { background:"#FB415C", color:"#fff", border:"none", padding:"10px 14px", borderRadius:12, fontWeight:700, cursor:"pointer" },
  secondary: { background:"#e5e7eb", color:"#111827", border:"none", padding:"10px 14px", borderRadius:12, fontWeight:600, cursor:"pointer" },

  toast: { position:"absolute", left:"50%", transform:"translateX(-50%)", bottom:12, color:"#fff", padding:"8px 12px", borderRadius:10, fontWeight:600 }
};
