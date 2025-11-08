// src/pages/Applications.jsx — Admin Doğrulama Talepleri (Ultra Pro — city/district + docs gallery)
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiDefault, { api as apiNamed } from "@/api/axios-boot";
import { ensureAccess } from "@/lib/admin/ensureAccess";

const api = apiNamed || apiDefault;

function useDebounced(v, ms = 400) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

const STATUSES = ["all", "pending", "in_review", "approved", "rejected", "archived", "spam"];

export default function Applications() {
  const navigate = useNavigate();

  const [adminOK, setAdminOK] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [busyId, setBusyId] = useState(null);

  // filters
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 450);
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("-createdAt");

  const basePath = "/admin/applications";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const ok = await ensureAccess().catch(() => false);
      setAdminOK(Boolean(ok));
      try {
        const params = { page, limit, sort };
        if (dq) params.q = dq;
        if (status !== "all") params.status = status;
        if (from) params.from = from;
        if (to) params.to = to;

        const res = await api.get(basePath, { params, _quiet: true });
        const data = res?.data || {};
        const list = data.applications || data.items || data.rows || [];
        if (!cancelled) {
          setRows(list);
          const t = Number(data.total || list.length || 0);
          setTotal(t);
          setPages(Number(data.pages || Math.max(1, Math.ceil(t / (params.limit || 20)))));
          setSelected(new Set());
        }
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.message || e?.message || "Liste yüklenemedi");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, limit, dq, status, from, to, sort]);

  const allSelectedOnPage = useMemo(
    () => rows.length && rows.every((r) => selected.has(r._id)),
    [rows, selected]
  );

  const refresh = () => setPage((p) => p);

  function toggleSelect(id, v) {
    setSelected((s) => {
      const nx = new Set(s);
      v ? nx.add(id) : nx.delete(id);
      return nx;
    });
  }
  function toggleSelectAllOnPage(v) {
    v ? setSelected(new Set(rows.map((r) => r._id))) : setSelected(new Set());
  }

  async function bulk(op, extra) {
    if (!selected.size) return alert("Seçili kayıt yok.");
    await api.post(`${basePath}/bulk`, { ids: Array.from(selected), op, ...extra }, { _quiet: false }).catch(() => {});
    refresh();
  }

  async function setStatusOne(row, st) {
    await api.patch(`${basePath}/${row._id}`, { status: st }, { _quiet: false }).catch(() => {});
    refresh();
  }

  async function approveOne(row) {
    try {
      setBusyId(row._id);
      await api.post(`${basePath}/${row._id}/approve`, null, { _quiet: false });
      refresh();
      navigate("/admin/businesses", { replace: true });
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || "Onay sırasında bir hata oluştu");
    } finally {
      setBusyId(null);
    }
  }

  async function delOne(row) {
    if (!window.confirm("Kalıcı olarak silinsin mi?")) return;
    await api.delete(`${basePath}/${row._id}`, { _quiet: false }).catch(() => {});
    refresh();
  }

  function exportCsv() {
    const qs = new URLSearchParams();
    if (dq) qs.set("q", dq);
    if (status !== "all") qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    window.open(`${basePath}/export.csv?${qs.toString()}`, "_blank");
  }

  // create / edit modal
  const [editing, setEditing] = useState(null); // null | {_isNew:true} | {...row}
  const empty = {
    applicantName: "",
    businessName: "",
    phone: "",
    email: "",
    instagram: "",
    city: "",
    district: "",
    address: "",
    note: "",
    status: "pending",
    documents: [],
  };
  const openCreate = () => setEditing({ ...empty, _isNew: true });
  const openEdit = (row) => setEditing({ ...row, _isNew: false });
  const closeEdit = () => setEditing(null);
  async function saveEdit(data) {
    try {
      const payload = { ...data };
      if (payload._isNew) {
        await api.post(basePath, payload, { _quiet: false });
      } else {
        await api.patch(`${basePath}/${payload._id}`, payload, { _quiet: false });
      }
      closeEdit();
      refresh();
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || "Kaydedilemedi");
    }
  }

  return (
    <section style={{ paddingBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>
          Başvurular <small style={{ color: "#64748b" }}>({total})</small>
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={openCreate}>+ Manuel Başvuru</button>
          <button className="btn" onClick={() => setPage(1) || refresh()}>↻ Yenile</button>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.7fr",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <input
          placeholder="Ara (ad, işletme, telefon, e-posta, instagram, slug, id)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="-createdAt">Yeniden → Eskiye</option>
          <option value="createdAt">Eskiden → Yeniye</option>
          <option value="-updatedAt">Son Güncellenen</option>
        </select>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn" onClick={exportCsv}>CSV</button>
          <button
            className="btn btn-light"
            onClick={() => {
              setQ(""); setStatus("all"); setFrom(""); setTo(""); setSort("-createdAt"); setPage(1);
            }}
          >
            Sıfırla
          </button>
        </div>
      </div>

      {/* Bulk */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button className="btn" disabled={!selected.size} onClick={() => bulk("status", { value: "approved" })}>
          Onayla
        </button>
        <button className="btn btn-light" disabled={!selected.size} onClick={() => bulk("status", { value: "rejected" })}>
          Reddet
        </button>
        <button className="btn btn-light" disabled={!selected.size} onClick={() => bulk("status", { value: "archived" })}>
          Arşivle
        </button>
        <button className="btn btn-danger" disabled={!selected.size} onClick={() => bulk("delete")}>
          Sil
        </button>
      </div>

      {/* Table */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <th style={th}>
                <input
                  type="checkbox"
                  checked={!!allSelectedOnPage}
                  onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
                />
              </th>
              <th style={th}>Başvuran</th>
              <th style={th}>İşletme</th>
              <th style={th}>İletişim</th>
              <th style={th}>İl/İlçe</th>
              <th style={th}>Durum</th>
              <th style={th}>Tarih</th>
              <th style={th}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 16, textAlign: "center" }}>Yükleniyor…</td></tr>
            ) : rows?.length ? (
              rows.map((r) => (
                <tr key={r._id} style={{ borderTop: "1px solid #eef2f7" }}>
                  <td style={td}>
                    <input
                      type="checkbox"
                      checked={selected.has(r._id)}
                      onChange={(e) => toggleSelect(r._id, e.target.checked)}
                    />
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <b>{r.applicantName || r.fullName || r.name || "-"}</b>
                      <small style={{ color: "#6b7280" }}>{r.email || "-"}</small>
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span>{r.businessName || r.company || r.name || "-"}</span>
                      <small style={{ color: "#6b7280" }}>{r.tradeTitle || r.legalName || ""}</small>
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span>{r.phone || r.phoneMobile || "-"}</span>
                      {r.instagram || r.instagramUsername || r.instagramUrl ? (
                        <a
                          href={
                            r.instagramUrl ||
                            (r.instagramUsername ? `https://instagram.com/${String(r.instagramUsername).replace(/^@/,"")}` :
                             r.instagram ? `https://instagram.com/${String(r.instagram).replace(/^@/,"")}` : undefined)
                          }
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          {r.instagram || r.instagramUsername || r.instagramUrl}
                        </a>
                      ) : null}
                    </div>
                  </td>
                  <td style={td}>
                    {(r.district || r.city) ? `${r.district || ""}${r.district && r.city ? ", " : ""}${r.city || ""}` : (r.address || "")}
                  </td>
                  <td style={td}><StatusBadge value={r.status} /></td>
                  <td style={td}>
                    {fmt(r.createdAt)}
                    {r.updatedAt ? <small style={{ color: "#94a3b8" }}> • {fmt(r.updatedAt)}</small> : null}
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="btn btn-ghost" onClick={() => openEdit(r)}>Detay</button>
                      <button className="btn" onClick={() => approveOne(r)} disabled={busyId === r._id} title="Onayla ve İşletmeler'e git">
                        {busyId === r._id ? "Onaylanıyor…" : "Onayla"}
                      </button>
                      <button className="btn btn-light" onClick={() => setStatusOne(r, "rejected")}>Reddet</button>
                      <button className="btn btn-light" onClick={() => setStatusOne(r, "archived")}>Arşiv</button>
                      <button className="btn btn-danger" onClick={() => delOne(r)}>Sil</button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={8} style={{ padding: 16, textAlign: "center" }}>{error || "Kayıt yok"}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
        <div style={{ color: "#64748b" }}>Toplam: {total} • Sayfa {page}/{pages}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>‹ Önceki</button>
          <select value={page} onChange={(e) => setPage(parseInt(e.target.value, 10))}>
            {Array.from({ length: pages || 1 }).map((_, i) => (<option key={i} value={i + 1}>{i + 1}</option>))}
          </select>
          <button className="btn" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>Sonraki ›</button>
          <select
            value={limit}
            onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}
          >
            {[10, 20, 50, 100, 200].map((n) => (<option key={n} value={n}>{n}/sayfa</option>))}
          </select>
        </div>
      </div>

      {editing && <EditModal basePath={basePath} data={editing} onClose={() => setEditing(null)} onSave={saveEdit} />}

      <style>{styles}</style>
    </section>
  );
}

function fmt(d) {
  try { return new Date(d).toLocaleString(); } catch { return "-"; }
}

const th = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  color: "#475569",
  letterSpacing: 0.2,
  borderBottom: "1px solid #e5e7eb",
};
const td = { padding: "10px 12px", verticalAlign: "top" };

function StatusBadge({ value }) {
  const map = {
    pending: { bg: "#fff7ed", fg: "#9a3412", text: "Beklemede" },
    in_review: { bg: "#eef2ff", fg: "#3730a3", text: "İncelemede" },
    approved: { bg: "#ecfdf5", fg: "#065f46", text: "Onaylandı" },
    rejected: { bg: "#fef2f2", fg: "#991b1b", text: "Reddedildi" },
    archived: { bg: "#f1f5f9", fg: "#334155", text: "Arşiv" },
    spam: { bg: "#ffe4e6", fg: "#9f1239", text: "Spam" },
  };
  const v = map[value] || { bg: "#e5e7eb", fg: "#374151", text: value || "-" };
  return (
    <span style={{ background: v.bg, color: v.fg, padding: "4px 8px", borderRadius: 999, fontSize: 12 }}>
      {v.text}
    </span>
  );
}

function EditModal({ basePath, data, onClose, onSave }) {
  const [form, setForm] = useState({ ...data });
  const [saving, setSaving] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docs, setDocs] = useState(() => Array.isArray(data.documents) ? data.documents : []);

  // Modal açıldığında, documents yoksa detay çek
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (form._isNew || (docs && docs.length)) return;
      setLoadingDocs(true);
      try {
        const res = await api.get(`${basePath}/${form._id}`, { _quiet: true });
        const item = res?.data?.application || {}; // ✅ backend { application } döndürüyor
        if (!cancelled) {
          setDocs(item.documents || []);
          setForm((f) => ({
            ...f,
            applicantName: item.applicantName || item.fullName || f.applicantName || "",
            businessName: item.businessName || item.name || f.businessName || "",
            phone: item.phone || item.phoneMobile || f.phone || "",
            email: item.email || f.email || "",
            instagram: item.instagramUsername || item.instagramUrl || item.instagram || f.instagram || "",
            city: item.city ?? f.city ?? "",
            district: item.district ?? f.district ?? "",
            address: item.address ?? f.address ?? "",
            note: item.note ?? f.note ?? "",
            status: item.status || f.status || "pending",
            createdAt: item.createdAt || f.createdAt,
          }));
        }
      } finally {
        if (!cancelled) setLoadingDocs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [form._id, docs?.length, basePath]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e?.preventDefault();
    setSaving(true);
    await onSave({ ...form, documents: docs });
    setSaving(false);
  }

  const toHref = (d) => {
    const raw = d?.url || d?.path || "";
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    return raw.startsWith("/") ? raw : `/${raw}`;
  };

  const images = (docs || []).filter((d) =>
    String(d.mimetype || "").startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(d?.url || d?.path || "")
  );
  const pdfs = (docs || []).filter((d) =>
    String(d.mimetype || "").includes("pdf") ||
    /\.pdf$/i.test(d?.url || d?.path || "")
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{form._isNew ? "Manuel Başvuru" : "Başvuru Detayı"}</h3>

        {/* Başvuru Özeti ve Belgeler */}
        <div className="cards">
          <div className="card">
            <div className="card-title">Başvuru Özeti</div>
            <div className="summary">
              <div><b>Başvuran:</b> {form.applicantName || form.fullName || "-"}</div>
              <div><b>İşletme:</b> {form.businessName || "-"}</div>
              <div><b>Telefon:</b> {form.phone || "-"}</div>
              <div><b>E-posta:</b> {form.email || "-"}</div>
              <div><b>Instagram:</b> {form.instagram || form.instagramUsername || form.instagramUrl || "-"}</div>
              <div><b>İl/İlçe:</b> {(form.district || form.city) ? `${form.district || ""}${form.district && form.city ? ", " : ""}${form.city || ""}` : (form.address || "-")}</div>
              <div><b>Durum:</b> {form.status}</div>
              {!form._isNew && <div><b>Oluşturma:</b> {fmt(form.createdAt)}</div>}
            </div>
          </div>

          <div className="card">
            <div className="card-title">Belgeler & Görseller</div>
            {loadingDocs ? (
              <div className="muted">Belgeler yükleniyor…</div>
            ) : (
              <>
                {images?.length ? (
                  <div className="gallery">
                    {images.map((d, i) => {
                      const href = toHref(d);
                      return (
                        <a key={i} href={href} target="_blank" rel="noreferrer noopener" title={d.originalname || "görsel"} className="thumb">
                          <img
                            src={href}
                            alt={d.originalname || `image-${i + 1}`}
                            loading="lazy"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        </a>
                      );
                    })}
                  </div>
                ) : <div className="muted">Görsel yok.</div>}

                {pdfs?.length ? (
                  <div className="pdfs">
                    {pdfs.map((d, i) => {
                      const href = toHref(d);
                      return (
                        <a key={i} className="pdf" href={href} target="_blank" rel="noreferrer noopener">
                          📄 {d.originalname || href.split("/").pop() || `belge-${i + 1}`}{d.size ? ` • ${(d.size/1024/1024).toFixed(2)} MB` : ""}
                        </a>
                      );
                    })}
                  </div>
                ) : <div className="muted">PDF yok.</div>}
              </>
            )}
          </div>
        </div>

        {/* Düzenleme Formu */}
        <form className="grid" onSubmit={submit}>
          <label>
            Başvuran Adı
            <input
              value={form.applicantName || form.fullName || ""}
              onChange={(e) => set("applicantName", e.target.value)}
              required
            />
          </label>
          <label>
            İşletme Adı
            <input value={form.businessName || ""} onChange={(e) => set("businessName", e.target.value)} />
          </label>
          <label>
            Telefon
            <input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
          </label>
          <label>
            E-posta
            <input type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
          </label>
          <label>
            Instagram
            <input
              value={form.instagram || form.instagramUsername || ""}
              onChange={(e) => set("instagram", e.target.value)}
            />
          </label>

          <label>
            İl
            <input value={form.city || ""} onChange={(e) => set("city", e.target.value)} />
          </label>
          <label>
            İlçe
            <input value={form.district || ""} onChange={(e) => set("district", e.target.value)} />
          </label>

          <label className="span2">
            Adres (opsiyonel)
            <textarea rows={2} value={form.address || ""} onChange={(e) => set("address", e.target.value)} />
          </label>

          <label className="span2">
            Not / Açıklama
            <textarea rows={3} value={form.note || ""} onChange={(e) => set("note", e.target.value)} />
          </label>

          <label>
            Durum
            <select value={form.status || "pending"} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.filter((s) => s !== "all").map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          {!form._isNew && (
            <label>
              Oluşturma
              <input value={fmt(form.createdAt)} readOnly />
            </label>
          )}
          <div className="actions span2">
            {!form._isNew && (
              <button
                type="button"
                className="btn btn-light"
                onClick={() => window.open(`${basePath}/${form._id}`, "_blank")}
              >
                JSON
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-light" onClick={onClose}>Kapat</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? "Kaydediliyor…" : "Kaydet"}</button>
          </div>
        </form>
      </div>
      <style>{modalStyles}</style>
    </div>
  );
}

const styles = `
  .btn{ padding:8px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:600; }
  .btn:hover{ background:#f8fafc; }
  .btn-light{ background:#f8fafc; }
  .btn-ghost{ background:transparent; border:1px dashed #e5e7eb; }
  .btn-danger{ background:#fee2e2; border-color:#fecaca; color:#991b1b; }
  input,select,textarea{ width:100%; padding:8px 10px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; }
`;

const modalStyles = `
  .modal-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; padding:20px; z-index:1000; }
  .modal{ background:#fff; border-radius:16px; padding:18px; width:min(1000px,96vw); max-height:90vh; overflow:auto; border:1px solid #e5e7eb; }
  .grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .grid .span2{ grid-column:span 2; }
  .actions{ display:flex; align-items:center; gap:10px; }

  .cards{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
  .card{ border:1px solid #e5e7eb; border-radius:12px; padding:12px; background:#fafafa; }
  .card-title{ font-weight:800; margin-bottom:8px; }
  .summary{ display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; font-size:14px; color:#334155; }

  .gallery{ display:grid; grid-template-columns:repeat(auto-fill, minmax(120px,1fr)); gap:8px; }
  .thumb{ display:block; border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; background:#fff; }
  .thumb img{ width:100%; height:100px; object-fit:cover; display:block; }
  .pdfs{ display:flex; flex-direction:column; gap:6px; margin-top:8px; }
  .pdf{ display:inline-flex; align-items:center; gap:6px; padding:8px 10px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; text-decoration:none; }
  .muted{ color:#6b7280; font-size:13px; }
`;
