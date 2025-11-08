// src/pages/admin/Businesses.jsx — Ultra Pro Admin List
import React, { useEffect, useMemo, useRef, useState } from "react";
import apiDefault, { api as apiNamed } from "@/api/axios-boot";
import { ensureAccess } from "@/lib/admin/ensureAccess";

// SmartTable opsiyonel. Kullanmadan da kendi tablomuzu çiziyoruz.
// import SmartTable from "@/components/admin/SmartTable";

const api = apiNamed || apiDefault;

/* ========================================================
   Küçük yardımcılar
   ======================================================== */
function cls(...xs) { return xs.filter(Boolean).join(" "); }
function useDebounced(value, delay = 400) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}
const STATUSES = ["all", "approved", "pending", "rejected", "archived"];
const VERIFIEDS = ["all", "true", "false"];

function fmtDate(d) { try { return new Date(d).toLocaleString(); } catch { return "-"; } }

/* ========================================================
   Ana sayfa bileşeni
   ======================================================== */
export default function Businesses() {
  const [adminOK, setAdminOK] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  // filtreler
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 450);
  const [status, setStatus] = useState("all");
  const [verified, setVerified] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("-createdAt");

  const basePath = adminOK ? "/admin/businesses" : "/businesses";

  // ilk erişim + her parametre değişiminde listeyi getir
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      const ok = await ensureAccess().catch(() => false);
      if (!cancelled) setAdminOK(Boolean(ok));

      try {
        const params = { page, limit, sort };
        if (dq) params.q = dq;
        if (status && status !== "all") params.status = status;
        if (verified && verified !== "all") params.verified = verified;
        if (from) params.from = from;
        if (to) params.to = to;

        // Önce paginated endpointi dene
        let res;
        try {
          res = await api.get(`${ok ? "/admin" : ""}/businesses`, { params, _quiet: true });
        } catch (e) {
          // Fallback: /all (kısıtlı ama çalışır)
          res = await api.get(`${ok ? "/admin" : ""}/businesses/all`, { _quiet: true });
        }

        const data = res?.data || {};
        const list = Array.isArray(data.businesses)
          ? data.businesses
          : Array.isArray(data.items)
            ? data.items
            : Array.isArray(data)
              ? data
              : [];
        if (!cancelled) {
          setRows(list);
          setTotal(Number(data.total || list.length || 0));
          setPages(Number(data.pages || Math.max(1, Math.ceil((data.total || list.length || 0) / limit))));
          setSelected(new Set());
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.message || err?.message || "Liste yüklenemedi");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [page, limit, dq, status, verified, from, to, sort]);

  /* =================== Actions =================== */
  const refresh = () => setPage((p) => p); // tetikle

  async function onDeleteOne(row) {
    if (!row?._id) return;
    if (!window.confirm(`Silinsin mi?\n${row.name || row.title || row.slug || row._id}`)) return;
    await api.delete(`${basePath}/${row._id}`, { _quiet: false }).catch(() => {});
    refresh();
  }

  async function onBulk(op, value) {
    if (!selected.size) return alert("Seçili kayıt yok.");
    const ids = Array.from(selected);
    await api.post(`${basePath}/bulk`, { ids, op, value }, { _quiet: false }).catch(() => {});
    refresh();
  }

  async function onExportCsv() {
    const p = new URLSearchParams();
    if (dq) p.set("q", dq);
    if (status !== "all") p.set("status", status);
    if (verified !== "all") p.set("verified", verified);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const url = `${basePath}/export.csv?${p.toString()}`;
    window.open(url, "_blank");
  }

  /* =================== Create / Edit =================== */
  const [editing, setEditing] = useState(null); // null = kapalı, {} = create, {...row} = edit

  const emptyBiz = {
    name: "",
    slug: "",
    phone: "",
    phoneMobile: "",
    email: "",
    instagramUsername: "",
    instagramUrl: "",
    website: "",
    address: "",
    desc: "",
    status: "pending",
    verified: false,
    featured: false,
  };

  function openCreate() { setEditing({ ...emptyBiz, _isNew: true }); }
  function openEdit(row) { setEditing({ ...row, _isNew: false }); }
  function closeEdit() { setEditing(null); }

  async function saveEdit(data) {
    try {
      if (data._isNew) {
        // Admin endpoint yoksa public /businesses'a POST dene
        let ok = true;
        try {
          await api.post(`${adminOK ? "/admin" : ""}/businesses`, data, { _quiet: false });
        } catch (e) {
          ok = false;
        }
        if (!ok) {
          await api.post(`/businesses`, data, { _quiet: false });
        }
      } else {
        await api.patch(`${basePath}/${data._id || data.slug}`, data, { _quiet: false });
      }
      closeEdit();
      refresh();
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || "Kaydedilemedi");
    }
  }

  /* =================== Table helpers =================== */
  function toggleSelect(id, v) {
    setSelected((s) => { const nx = new Set(s); v ? nx.add(id) : nx.delete(id); return nx; });
  }
  function toggleSelectAllOnPage(v) {
    if (v) setSelected(new Set(rows.map((r) => r._id).filter(Boolean)));
    else setSelected(new Set());
  }

  function toggleSort(field) {
    setSort((cur) => {
      if (!cur || cur.replace("-", "") !== field) return field; // asc
      if (!cur.startsWith("-")) return `-${field}`; // desc
      return field; // asc ↺
    });
  }

  const allSelectedOnPage = useMemo(() => rows.length && rows.every((r) => selected.has(r._id)), [rows, selected]);

  /* =================== UI =================== */
  return (
    <section style={{ paddingBottom: 24 }}>
      {/* Header */}
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12}}>
        <h2 style={{margin:0}}>İşletmeler <small style={{color:"#64748b"}}>({total || rows.length})</small></h2>
        <div style={{display:"flex", gap:8}}>
          <button onClick={openCreate} className="btn">+ Yeni İşletme</button>
          <button onClick={() => setPage(1) || refresh()} className="btn" title="Yenile">↻ Yenile</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{display:"grid", gridTemplateColumns:"1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.6fr", gap:8, marginBottom:10}}>
        <input placeholder="Ara (ad, slug, telefon, instagram, e‑posta...)" value={q} onChange={(e)=>setQ(e.target.value)} />
        <select value={status} onChange={(e)=>{setStatus(e.target.value); setPage(1);}}>
          {STATUSES.map((s)=> <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={verified} onChange={(e)=>{setVerified(e.target.value); setPage(1);}}>
          {VERIFIEDS.map((s)=> <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={from} onChange={(e)=>{setFrom(e.target.value); setPage(1);}} />
        <input type="date" value={to} onChange={(e)=>{setTo(e.target.value); setPage(1);}} />
        <div style={{display:"flex", gap:6}}>
          <button onClick={onExportCsv} className="btn" title="CSV indir">CSV</button>
          <button onClick={()=>{setQ(""); setStatus("all"); setVerified("all"); setFrom(""); setTo(""); setSort("-createdAt"); setPage(1);}} className="btn btn-light">Sıfırla</button>
        </div>
      </div>

      {/* Bulk actions */}
      <div style={{display:"flex", gap:8, marginBottom:10}}>
        <button onClick={()=>onBulk("verify")} disabled={!selected.size} className="btn">Doğrula</button>
        <button onClick={()=>onBulk("unverify")} disabled={!selected.size} className="btn btn-light">Doğrulamayı Kaldır</button>
        <button onClick={()=>onBulk("feature")} disabled={!selected.size} className="btn">Öne Çıkar</button>
        <button onClick={()=>onBulk("unfeature")} disabled={!selected.size} className="btn btn-light">Öne Çıkarmayı Kaldır</button>
        <button onClick={()=>onBulk("status", "approved")} disabled={!selected.size} className="btn">Onayla</button>
        <button onClick={()=>onBulk("status", "rejected")} disabled={!selected.size} className="btn btn-light">Reddet</button>
        <button onClick={()=>onBulk("delete")} disabled={!selected.size} className="btn btn-danger">Sil</button>
      </div>

      {/* Table */}
      <div className={cls("card")}
           style={{border:"1px solid #e5e7eb", borderRadius:12, overflow:"hidden"}}>
        <table style={{width:"100%", borderCollapse:"collapse"}}>
          <thead style={{background:"#f8fafc"}}>
            <tr>
              <th style={th}><input type="checkbox" checked={!!allSelectedOnPage} onChange={(e)=>toggleSelectAllOnPage(e.target.checked)} /></th>
              <ThSort label="#" onClick={()=>toggleSort("createdAt")} active={sort.replace("-","")==="createdAt"} desc={sort.startsWith("-") && sort.includes("createdAt")} />
              <th style={th}>Ad</th>
              <th style={th}>Durum</th>
              <th style={th}>Doğrulama</th>
              <th style={th}>Telefon</th>
              <th style={th}>Instagram</th>
              <th style={th}>Güncellenme</th>
              <th style={th}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{padding:16, textAlign:"center"}}>Yükleniyor…</td></tr>
            ) : rows.length ? (
              rows.map((r) => (
                <tr key={r._id} style={{borderTop:"1px solid #eef2f7"}}>
                  <td style={td}><input type="checkbox" checked={selected.has(r._id)} onChange={(e)=>toggleSelect(r._id, e.target.checked)} /></td>
                  <td style={td} title={r._id}>{r._id?.slice(-6)}</td>
                  <td style={td}>
                    <div style={{display:"flex", flexDirection:"column"}}>
                      <b>{r.name || r.title || "-"}</b>
                      <small style={{color:"#6b7280"}}>{r.slug || "-"}</small>
                    </div>
                  </td>
                  <td style={td}><StatusBadge value={r.status} /></td>
                  <td style={td}>{r.verified ? "✔︎" : "—"}</td>
                  <td style={td}>{r.phone || r.phoneMobile || "-"}</td>
                  <td style={td}>
                    {r.instagramUrl ? (
                      <a href={r.instagramUrl} target="_blank" rel="noreferrer noopener">{r.instagramUsername || r.instagramUrl}</a>
                    ) : (r.instagramUsername || "-")}
                  </td>
                  <td style={td}>{fmtDate(r.updatedAt || r.createdAt)}</td>
                  <td style={td}>
                    <div style={{display:"flex", gap:6}}>
                      <button className="btn btn-ghost" onClick={()=>openEdit(r)}>Düzenle</button>
                      <button className="btn btn-danger" onClick={()=>onDeleteOne(r)}>Sil</button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={9} style={{padding:16, textAlign:"center"}}>{error || "Kayıt yok"}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:10}}>
        <div style={{color:"#64748b"}}>Toplam: {total} • Sayfa {page}/{pages}</div>
        <div style={{display:"flex", gap:6}}>
          <button className="btn" onClick={()=>setPage((p)=>Math.max(1, p-1))} disabled={page<=1}>‹ Önceki</button>
          <select value={page} onChange={(e)=>setPage(parseInt(e.target.value,10))}>
            {Array.from({length: pages || 1}).map((_,i)=> <option key={i} value={i+1}>{i+1}</option>)}
          </select>
          <button className="btn" onClick={()=>setPage((p)=>Math.min(pages, p+1))} disabled={page>=pages}>Sonraki ›</button>
          <select value={limit} onChange={(e)=>{setLimit(parseInt(e.target.value,10)); setPage(1);}}>
            {[10,20,50,100,200].map((n)=> <option key={n} value={n}>{n}/sayfa</option>)}
          </select>
        </div>
      </div>

      {/* Edit/Create Modal */}
      {editing && (
        <EditModal data={editing} onClose={closeEdit} onSave={saveEdit} />
      )}

      <style>{css}</style>
    </section>
  );
}

/* ========================================================
   Küçük sunum bileşenleri
   ======================================================== */
const th = { textAlign: "left", padding: "10px 12px", fontSize: 12, color: "#475569", letterSpacing: 0.2, borderBottom: "1px solid #e5e7eb" };
const td = { padding: "10px 12px", verticalAlign: "top" };

function ThSort({ label, onClick, active, desc }) {
  return (
    <th style={th}>
      <button onClick={onClick} className="btn btn-ghost" title="Sırala">
        {label} {active ? (desc ? "▼" : "▲") : ""}
      </button>
    </th>
  );
}

function StatusBadge({ value }) {
  const map = {
    approved: { bg: "#ecfdf5", fg: "#065f46", text: "Onaylı" },
    pending: { bg: "#fff7ed", fg: "#9a3412", text: "Beklemede" },
    rejected: { bg: "#fef2f2", fg: "#991b1b", text: "Reddedildi" },
    archived: { bg: "#f1f5f9", fg: "#334155", text: "Arşiv" },
  };
  const v = map[value] || { bg: "#eef2ff", fg: "#3730a3", text: value || "-" };
  return (
    <span style={{background:v.bg, color:v.fg, padding:"4px 8px", borderRadius:999, fontSize:12}}>{v.text}</span>
  );
}

function EditModal({ data, onClose, onSave }) {
  const [form, setForm] = useState({ ...data });
  const [saving, setSaving] = useState(false);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e?.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e)=>e.stopPropagation()}>
        <h3 style={{marginTop:0}}>{form._isNew ? "Yeni İşletme" : "İşletmeyi Düzenle"}</h3>
        <form onSubmit={submit} className="form-grid">
          <label>Ad<input value={form.name||""} onChange={(e)=>set("name", e.target.value)} required /></label>
          <label>Slug<input value={form.slug||""} onChange={(e)=>set("slug", e.target.value)} /></label>
          <label>Telefon<input value={form.phone||""} onChange={(e)=>set("phone", e.target.value)} /></label>
          <label>Mobil<input value={form.phoneMobile||""} onChange={(e)=>set("phoneMobile", e.target.value)} /></label>
          <label>E‑posta<input type="email" value={form.email||""} onChange={(e)=>set("email", e.target.value)} /></label>
          <label>Instagram Kullanıcı<input value={form.instagramUsername||""} onChange={(e)=>set("instagramUsername", e.target.value)} /></label>
          <label>Instagram URL<input value={form.instagramUrl||""} onChange={(e)=>set("instagramUrl", e.target.value)} /></label>
          <label>Web Sitesi<input value={form.website||""} onChange={(e)=>set("website", e.target.value)} /></label>
          <label className="span2">Adres<textarea value={form.address||""} onChange={(e)=>set("address", e.target.value)} rows={2} /></label>
          <label className="span2">Açıklama<textarea value={form.desc||""} onChange={(e)=>set("desc", e.target.value)} rows={3} /></label>
          <label>Durum<select value={form.status||"pending"} onChange={(e)=>set("status", e.target.value)}>{STATUSES.filter(s=>s!=="all").map((s)=>(<option key={s} value={s}>{s}</option>))}</select></label>
          <label>Doğrulandı mı?<select value={String(!!form.verified)} onChange={(e)=>set("verified", e.target.value === "true")}>{["true","false"].map((s)=>(<option key={s} value={s}>{s}</option>))}</select></label>
          <label>Öne çıkar?<select value={String(!!form.featured)} onChange={(e)=>set("featured", e.target.value === "true")}>{["true","false"].map((s)=>(<option key={s} value={s}>{s}</option>))}</select></label>
          <div className="actions span2">
            <button type="button" className="btn btn-light" onClick={onClose}>İptal</button>
            <button type="submit" className="btn" disabled={saving}>{saving?"Kaydediliyor…":"Kaydet"}</button>
          </div>
        </form>
      </div>
      <style>{modalCss}</style>
    </div>
  );
}

/* ========================================================
   Basit stiller (Tailwind yoksa sorun çıkmasın diye)
   ======================================================== */
const css = `
  .btn { padding:8px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:600; }
  .btn:hover { background:#f8fafc; }
  .btn-ghost { background:transparent; border:1px dashed #e5e7eb; }
  .btn-light { background:#f8fafc; }
  .btn-danger { background:#fee2e2; border-color:#fecaca; color:#991b1b; }
  input, select, textarea { width:100%; padding:8px 10px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; }
  .card { background:#fff; }
`;

const modalCss = `
  .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; padding:20px; z-index:1000; }
  .modal { background:#fff; border-radius:16px; padding:18px; width:min(980px, 96vw); max-height:90vh; overflow:auto; border:1px solid #e5e7eb; }
  .form-grid { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
  .form-grid .span2 { grid-column: span 2; }
  .actions { display:flex; justify-content:flex-end; gap:10px; }
`;
