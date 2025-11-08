// src/pages/Blacklist.jsx — Admin Kara Liste (İhbar + Destek Odaklı Ultra Pro)
import React, { useEffect, useMemo, useState, useCallback } from "react";
import apiDefault, { api as apiNamed } from "@/api/axios-boot";
import { ensureAccess } from "@/lib/admin/ensureAccess";

const api = apiNamed || apiDefault;

/* ============================ Helpers ============================ */
function useDebounced(v, ms = 400) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}
function fmtDate(x) {
  if (!x) return "-";
  try {
    return new Date(x).toLocaleString();
  } catch {
    return String(x);
  }
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
const STATUS = ["all", "active", "removed", "expired", "pending"];
const SEVERITY = ["all", "low", "medium", "high", "critical"];

// axios-boot baseURL -> /api ==> burada sadece /blacklist kullanıyoruz
const basePath = "/blacklist";

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const maskName = (full) => {
  const s = String(full || "").trim();
  if (!s) return "-";
  const parts = s.split(/\s+/g);
  return parts
    .map((p) => {
      const first = p.charAt(0).toLowerCase();
      const rest = p.slice(1);
      const stars = rest.replace(/./g, "*");
      const take = clamp(stars.length, 2, 6);
      return `${first}${stars.slice(0, take)}`;
    })
    .join(" ");
};

/* ============================ Page ============================ */
export default function Blacklist() {
  const [adminOK, setAdminOK] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  // filters
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 450);
  const [status, setStatus] = useState("active");
  const [severity, setSeverity] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("-createdAt");
  const [onlyWithReports, setOnlyWithReports] = useState(false);

  /* Auth check */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ok = await ensureAccess().catch(() => false);
        if (!cancelled) setAdminOK(Boolean(ok));
      } catch {
        if (!cancelled) setAdminOK(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Fetch list */
  useEffect(() => {
    if (!adminOK) return; // yetki yoksa uğraşma
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const params = { page, limit, sort };

      if (dq) params.q = dq;
      if (status !== "all") params.status = status;
      if (severity !== "all") params.severity = severity;
      if (from) params.from = from;
      if (to) params.to = to;
      if (onlyWithReports) params.onlyWithReports = true;

      try {
        const res = await api.get(basePath, {
          params,
          _quiet: true,
        });
        const data = res?.data || {};
        const list =
          data.blacklist || data.items || data.rows || data.data || [];
        if (!cancelled) {
          setRows(list);
          const t = Number(data.total || list.length || 0);
          setTotal(t);
          const pg = Number(
            data.pages || Math.max(1, Math.ceil(t / (params.limit || 20)))
          );
          setPages(pg);
          setSelected(new Set());
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e?.response?.data?.message ||
              e?.message ||
              "Liste yüklenemedi"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminOK, page, limit, dq, status, severity, from, to, sort, onlyWithReports]);

  /* Actions */
  const refresh = () => setPage((p) => p);
  const allSelectedOnPage = useMemo(
    () => rows.length && rows.every((r) => selected.has(r._id)),
    [rows, selected]
  );
  const toggleSelect = (id, v) =>
    setSelected((s) => {
      const nx = new Set(s);
      v ? nx.add(id) : nx.delete(id);
      return nx;
    });
  const toggleSelectAll = (v) =>
    v
      ? setSelected(new Set(rows.map((r) => r._id)))
      : setSelected(new Set());
  const toggleSort = (field) =>
    setSort((cur) => {
      if (!cur || cur.replace("-", "") !== field) return field;
      return cur.startsWith("-") ? field : `-${field}`;
    });

  async function bulk(op, extra) {
    if (!selected.size) {
      alert("Seçili kayıt yok.");
      return;
    }
    const body = { ids: Array.from(selected), op, ...extra };
    try {
      await api.post(`${basePath}/bulk`, body, {
        params: { admin: 1 },
        _quiet: false,
      });
      refresh();
    } catch {
      // hata gösterimini sade bırakıyoruz
    }
  }

  async function patchOne(id, body) {
    try {
      await api.patch(`${basePath}/${id}`, body, {
        params: { admin: 1 },
        _quiet: false,
      });
      refresh();
    } catch {}
  }

  async function delOne(id) {
    if (!window.confirm("Kalıcı olarak silinsin mi?")) return;
    try {
      await api.delete(`${basePath}/${id}`, {
        params: { admin: 1 },
        _quiet: false,
      });
      refresh();
    } catch {}
  }

  function exportCsv() {
    const qs = new URLSearchParams();
    if (dq) qs.set("q", dq);
    if (status !== "all") qs.set("status", status);
    if (severity !== "all") qs.set("severity", severity);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (onlyWithReports) qs.set("onlyWithReports", "1");
    const url = `${basePath}/export.csv?${qs.toString()}`;
    window.open(url, "_blank");
  }

  /* Create/Edit modal */
  const [editing, setEditing] = useState(null); // null | {_isNew:true} | {...row}
  const empty = {
    businessName: "",
    businessSlug: "",
    businessId: "",
    reason: "",
    notes: "",
    severity: "medium",
    status: "active",
    evidenceUrls: "",
    reportIds: "",
    expiresAt: "",
  };
  const openCreate = () =>
    setEditing({ ...empty, _isNew: true });
  const openEdit = (row) =>
    setEditing({
      ...row,
      evidenceUrls:
        (row.evidenceUrls || [])
          .join?.("\n") || row.evidenceUrls || "",
      reportIds:
        (row.reportIds || [])
          .join?.(",") || row.reportIds || "",
      _isNew: false,
    });
  const closeEdit = () => setEditing(null);

  async function saveEdit(data) {
    const payload = { ...data };
    if (typeof payload.evidenceUrls === "string") {
      payload.evidenceUrls = payload.evidenceUrls
        .split(/\n|\r|\t|,/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof payload.reportIds === "string") {
      payload.reportIds = payload.reportIds
        .split(/\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    try {
      if (payload._isNew) {
        await api.post(basePath, payload, {
          params: { admin: 1 },
          _quiet: false,
        });
      } else {
        await patchOne(payload._id, payload);
      }
      closeEdit();
      refresh();
    } catch (e) {
      alert(
        e?.response?.data?.message ||
          e?.message ||
          "Kaydedilemedi"
      );
    }
  }

  /* ============================ UI ============================ */
  return (
    <section style={{ paddingBottom: 24 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>
          Kara Liste{" "}
          <small style={{ color: "#64748b" }}>
            ({total})
          </small>
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={openCreate}
          >
            + Kara Listeye Ekle
          </button>
          <button
            className="btn"
            onClick={() => setPage(1) || refresh()}
          >
            ↻ Yenile
          </button>
          <button
            className="btn"
            onClick={exportCsv}
          >
            CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "1.4fr 0.9fr 0.9fr 0.9fr 0.9fr 0.8fr",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <input
          placeholder="Ara (işletme adı, slug, sebep, id, telefon, e-posta, instagram)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {STATUS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={severity}
          onChange={(e) => {
            setSeverity(e.target.value);
            setPage(1);
          }}
        >
          {SEVERITY.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
        />
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
        />
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <label
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            <input
              type="checkbox"
              checked={onlyWithReports}
              onChange={(e) => {
                setOnlyWithReports(
                  e.target.checked
                );
                setPage(1);
              }}
            />
            <span
              style={{
                fontSize: 12,
                color: "#475569",
              }}
            >
              Sadece ihbarlı
            </span>
          </label>
          <button
            className="btn btn-light"
            onClick={() => {
              setQ("");
              setStatus("active");
              setSeverity("all");
              setFrom("");
              setTo("");
              setOnlyWithReports(false);
              setSort("-createdAt");
              setPage(1);
            }}
          >
            Sıfırla
          </button>
        </div>
      </div>

      {/* Bulk actions */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          className="btn"
          disabled={!selected.size}
          onClick={() =>
            bulk("status", {
              value: "active",
            })
          }
        >
          Aktif Yap
        </button>
        <button
          className="btn btn-light"
          disabled={!selected.size}
          onClick={() =>
            bulk("status", {
              value: "removed",
            })
          }
        >
          Kaldır (Pasif)
        </button>
        <button
          className="btn btn-light"
          disabled={!selected.size}
          onClick={() =>
            bulk("severity", {
              value: "high",
            })
          }
        >
          High
        </button>
        <button
          className="btn btn-light"
          disabled={!selected.size}
          onClick={() =>
            bulk("severity", {
              value: "critical",
            })
          }
        >
          Critical
        </button>
        <button
          className="btn btn-danger"
          disabled={!selected.size}
          onClick={() => bulk("delete")}
        >
          Sil
        </button>
      </div>

      {/* Table */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
          }}
        >
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <th style={th}>
                <input
                  type="checkbox"
                  checked={!!allSelectedOnPage}
                  onChange={(e) =>
                    toggleSelectAll(
                      e.target.checked
                    )
                  }
                />
              </th>
              <th style={th}>İşletme</th>
              <th style={th}>Sebep / Not</th>
              <th style={th}>İhbar</th>
              <th style={th}>Önem</th>
              <th style={th}>Durum</th>
              <th style={th}>Tarih</th>
              <th style={th}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: 16,
                    textAlign: "center",
                  }}
                >
                  Yükleniyor…
                </td>
              </tr>
            ) : rows?.length ? (
              rows.map((r) => (
                <tr
                  key={r._id}
                  style={{
                    borderTop:
                      "1px solid #eef2f7",
                  }}
                >
                  <td style={td}>
                    <input
                      type="checkbox"
                      checked={selected.has(
                        r._id
                      )}
                      onChange={(e) =>
                        toggleSelect(
                          r._id,
                          e.target.checked
                        )
                      }
                    />
                  </td>
                  <td style={td}>
                    <div
                      style={{
                        display:
                          "flex",
                        flexDirection:
                          "column",
                      }}
                    >
                      <b>
                        {r.businessName ||
                          r.name ||
                          "-"}
                      </b>
                      <small
                        style={{
                          color:
                            "#6b7280",
                        }}
                      >
                        {r.businessSlug ||
                          r.slug ||
                          ""}
                      </small>
                      {r.businessId && (
                        <small
                          style={{
                            color:
                              "#94a3b8",
                          }}
                        >
                          {String(
                            r.businessId
                          ).slice(-6)}
                        </small>
                      )}
                    </div>
                  </td>
                  <td style={td}>
                    <div
                      style={{
                        display:
                          "flex",
                        flexDirection:
                          "column",
                      }}
                    >
                      <span>
                        {r.reason ||
                          r.title ||
                          "-"}
                      </span>
                      {r.notes && (
                        <small
                          style={{
                            color:
                              "#6b7280",
                          }}
                        >
                          {String(
                            r.notes
                          ).slice(
                            0,
                            120
                          )}
                        </small>
                      )}
                    </div>
                  </td>
                  <td style={td}>
                    <div
                      style={{
                        display:
                          "flex",
                        flexDirection:
                          "column",
                      }}
                    >
                      <span>
                        {(r.reportIds ||
                          r.reports ||
                          []).length ||
                          0}{" "}
                        ihbar
                      </span>
                    </div>
                  </td>
                  <td style={td}>
                    <SeverityBadge
                      value={r.severity}
                    />
                  </td>
                  <td style={td}>
                    <StatusBadge
                      value={r.status}
                    />
                  </td>
                  <td style={td}>
                    <div
                      style={{
                        display:
                          "flex",
                        flexDirection:
                          "column",
                      }}
                    >
                      <span>
                        {fmtDate(
                          r.createdAt
                        )}
                      </span>
                      {r.expiresAt && (
                        <small
                          style={{
                            color:
                              "#6b7280",
                          }}
                        >
                          Bitiş:{" "}
                          {fmtDate(
                            r.expiresAt
                          )}
                        </small>
                      )}
                    </div>
                  </td>
                  <td style={td}>
                    <div
                      style={{
                        display:
                          "flex",
                        gap: 6,
                        flexWrap:
                          "wrap",
                      }}
                    >
                      <button
                        className="btn btn-ghost"
                        onClick={() =>
                          openEdit(r)
                        }
                      >
                        Detay
                      </button>
                      {r.status !==
                      "removed" ? (
                        <button
                          className="btn btn-light"
                          onClick={() =>
                            patchOne(
                              r._id,
                              {
                                status:
                                  "removed",
                              }
                            )
                          }
                        >
                          Kaldır
                        </button>
                      ) : (
                        <button
                          className="btn"
                          onClick={() =>
                            patchOne(
                              r._id,
                              {
                                status:
                                  "active",
                              }
                            )
                          }
                        >
                          Aktif Et
                        </button>
                      )}
                      <button
                        className="btn btn-danger"
                        onClick={() =>
                          delOne(
                            r._id
                          )
                        }
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: 16,
                    textAlign: "center",
                    color: "#6b7280",
                  }}
                >
                  {error || "Kayıt yok"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 10,
        }}
      >
        <div style={{ color: "#64748b" }}>
          Toplam: {total} • Sayfa {page}/
          {pages}
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
          }}
        >
          <button
            className="btn"
            onClick={() =>
              setPage((p) =>
                Math.max(1, p - 1)
              )
            }
            disabled={page <= 1}
          >
            ‹ Önceki
          </button>
          <select
            value={page}
            onChange={(e) =>
              setPage(
                parseInt(
                  e.target.value,
                  10
                )
              )
            }
          >
            {Array.from({
              length:
                pages || 1,
            }).map((_, i) => (
              <option
                key={i}
                value={i + 1}
              >
                {i + 1}
              </option>
            ))}
          </select>
          <button
            className="btn"
            onClick={() =>
              setPage((p) =>
                Math.min(
                  pages,
                  p + 1
                )
              )
            }
            disabled={page >= pages}
          >
            Sonraki ›
          </button>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(
                parseInt(
                  e.target.value,
                  10
                )
              );
              setPage(1);
            }}
          >
            {[10, 20, 50, 100, 200].map(
              (n) => (
                <option
                  key={n}
                  value={n}
                >
                  {n}/sayfa
                </option>
              )
            )}
          </select>
        </div>
      </div>

      {editing && (
        <EditModal
          data={editing}
          onClose={closeEdit}
          onSave={saveEdit}
        />
      )}

      <style>{styles}</style>
    </section>
  );
}

/* ============================ Small Components ============================ */
function StatusBadge({ value }) {
  const map = {
    active: {
      bg: "#fee2e2",
      fg: "#991b1b",
      text: "Aktif",
    },
    removed: {
      bg: "#f1f5f9",
      fg: "#334155",
      text: "Kaldırıldı",
    },
    expired: {
      bg: "#e2e8f0",
      fg: "#475569",
      text: "Süresi bitti",
    },
    pending: {
      bg: "#fff7ed",
      fg: "#9a3412",
      text: "Beklemede",
    },
  };
  const v =
    map[value] || {
      bg: "#e5e7eb",
      fg: "#374151",
      text: value || "-",
    };
  return (
    <span
      style={{
        background: v.bg,
        color: v.fg,
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 12,
      }}
    >
      {v.text}
    </span>
  );
}
function SeverityBadge({ value }) {
  const map = {
    low: {
      bg: "#ecfeff",
      fg: "#155e75",
      text: "Low",
    },
    medium: {
      bg: "#fefce8",
      fg: "#854d0e",
      text: "Medium",
    },
    high: {
      bg: "#fff1f2",
      fg: "#9f1239",
      text: "High",
    },
    critical: {
      bg: "#fee2e2",
      fg: "#991b1b",
      text: "Critical",
    },
  };
  const v =
    map[value] || {
      bg: "#e5e7eb",
      fg: "#374151",
      text: value || "-",
    };
  return (
    <span
      style={{
        background: v.bg,
        color: v.fg,
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 12,
      }}
    >
      {v.text}
    </span>
  );
}

/* ============================ Edit Modal (detay + delil + destek + ihbar) ============================ */
function EditModal({ data, onClose, onSave }) {
  const [form, setForm] = useState({ ...data });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("detay"); // detay | delil | destek | ihbar

  const [supports, setSupports] = useState([]);
  const [supportsLoading, setSupportsLoading] =
    useState(false);
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] =
    useState(false);

  const set = (k, v) =>
    setForm((f) => ({ ...f, [k]: v }));

  const evidence =
    Array.isArray(form.evidenceUrls) &&
    form.evidenceUrls.length
      ? form.evidenceUrls
      : String(form.evidenceUrls || "")
          .split(/\n|\r|\t|,/)
          .map((s) => s.trim())
          .filter(Boolean);

  const loadSupports = useCallback(async () => {
    setSupportsLoading(true);
    try {
      const res = await api.get(
        `${basePath}/${form._id}/supports`,
        { params: { admin: 1 }, _quiet: true }
      );
      const arr =
        res?.data?.supports ||
        res?.data?.items ||
        res?.data ||
        [];
      setSupports(Array.isArray(arr) ? arr : []);
    } catch {
      setSupports([]);
    } finally {
      setSupportsLoading(false);
    }
  }, [form._id]);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      // Tercihen blacklistId ile; yoksa q ile
      let res = await api.get("/report", {
        params: {
          blacklistId: form._id,
          admin: 1,
          limit: 100,
        },
        _quiet: true,
      });
      let items =
        res?.data?.items ||
        res?.data?.reports ||
        res?.data?.rows ||
        [];
      if (!Array.isArray(items) || !items.length) {
        const q =
          form.businessSlug ||
          form.businessName ||
          form.name ||
          "";
        if (q) {
          res = await api.get("/report", {
            params: { q, admin: 1, limit: 100 },
            _quiet: true,
          });
          items =
            res?.data?.items ||
            res?.data?.reports ||
            res?.data?.rows ||
            [];
        }
      }
      setReports(Array.isArray(items) ? items : []);
    } catch {
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, [
    form._id,
    form.businessSlug,
    form.businessName,
    form.name,
  ]);

  useEffect(() => {
    if (!form._isNew) {
      loadSupports();
      loadReports();
    }
  }, [form._id]);

  async function submit(e) {
    e?.preventDefault();
    setSaving(true);
    await onSave({
      ...form,
      evidenceUrls: evidence,
    });
    setSaving(false);
  }

  const patchSupport = async (sid, body) => {
    try {
      await api.patch(
        `${basePath}/${form._id}/supports/${sid}`,
        body,
        { params: { admin: 1 }, _quiet: false }
      );
      await loadSupports();
    } catch {}
  };

  const delSupport = async (sid) => {
    if (
      !window.confirm(
        "Bu destek kaydı silinsin mi?"
      )
    )
      return;
    try {
      await api.delete(
        `${basePath}/${form._id}/supports/${sid}`,
        { params: { admin: 1 }, _quiet: false }
      );
      await loadSupports();
    } catch {}
  };

  const firstReporterMasked = useMemo(() => {
    if (!reports?.length) return "-";
    const sorted = [...reports].sort(
      (a, b) =>
        new Date(a.createdAt) -
        new Date(b.createdAt)
    );
    const r = sorted[0];
    return maskName(
      r?.reporterName ||
        r?.reporterEmail ||
        "-"
    );
  }, [reports]);

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
    >
      <div
        className="modal"
        onClick={(e) =>
          e.stopPropagation()
        }
      >
        <h3 style={{ marginTop: 0 }}>
          {form._isNew
            ? "Kara Listeye Ekle"
            : "Kayıt Detayı"}
        </h3>

        {!form._isNew && (
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 10,
            }}
          >
            {["detay", "delil", "destek", "ihbar"].map(
              (t) => (
                <button
                  key={t}
                  className={
                    "btn " +
                    (tab === t
                      ? ""
                      : "btn-light")
                  }
                  onClick={() =>
                    setTab(t)
                  }
                >
                  {t === "detay"
                    ? "Detay"
                    : t === "delil"
                    ? "Deliller"
                    : t === "destek"
                    ? "Destekler"
                    : "İhbarlar"}
                </button>
              )
            )}
          </div>
        )}

        {/* DETAY */}
        {(tab === "detay" || form._isNew) && (
          <form
            className="grid"
            onSubmit={submit}
          >
            <label>
              İşletme Adı
              <input
                value={
                  form.businessName ||
                  form.name ||
                  ""
                }
                onChange={(e) =>
                  set(
                    "businessName",
                    e.target.value
                  )
                }
                required
              />
            </label>
            <label>
              İşletme Slug
              <input
                value={
                  form.businessSlug ||
                  ""
                }
                onChange={(e) =>
                  set(
                    "businessSlug",
                    e.target.value
                  )
                }
              />
            </label>
            <label>
              İşletme ID
              <input
                value={
                  form.businessId || ""
                }
                onChange={(e) =>
                  set(
                    "businessId",
                    e.target.value
                  )
                }
              />
            </label>
            <label>
              Önem
              <select
                value={
                  form.severity ||
                  "medium"
                }
                onChange={(e) =>
                  set(
                    "severity",
                    e.target.value
                  )
                }
              >
                {["low",
                  "medium",
                  "high",
                  "critical"].map(
                  (s) => (
                    <option
                      key={s}
                      value={s}
                    >
                      {s}
                    </option>
                  )
                )}
              </select>
            </label>
            <label>
              Durum
              <select
                value={
                  form.status ||
                  "active"
                }
                onChange={(e) =>
                  set(
                    "status",
                    e.target.value
                  )
                }
              >
                {["active",
                  "removed",
                  "expired",
                  "pending"].map(
                  (s) => (
                    <option
                      key={s}
                      value={s}
                    >
                      {s}
                    </option>
                  )
                )}
              </select>
            </label>
            <label className="span2">
              Sebep
              <input
                value={
                  form.reason || ""
                }
                onChange={(e) =>
                  set(
                    "reason",
                    e.target.value
                  )
                }
                placeholder="örn. Onaylanmış dolandırıcılık vakaları"
              />
            </label>
            <label className="span2">
              Not / Detay
              <textarea
                rows={3}
                value={
                  form.notes || ""
                }
                onChange={(e) =>
                  set(
                    "notes",
                    e.target.value
                  )
                }
              />
            </label>
            <label>
              Bitiş (ops.)
              <input
                type="datetime-local"
                value={
                  form.expiresAt
                    ? new Date(
                        form.expiresAt
                      )
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
                onChange={(e) =>
                  set(
                    "expiresAt",
                    e.target.value
                      ? new Date(
                          e.target.value
                        ).toISOString()
                      : ""
                  )
                }
              />
            </label>

            <div className="actions span2">
              <div
                style={{
                  color: "#64748b",
                  fontSize: 12,
                }}
              >
                İlk rapor eden:{" "}
                <b>
                  {
                    firstReporterMasked
                  }
                </b>
              </div>
              <div
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-light"
                onClick={onClose}
              >
                Kapat
              </button>
              <button
                type="submit"
                className="btn"
                disabled={saving}
              >
                {saving
                  ? "Kaydediliyor…"
                  : "Kaydet"}
              </button>
            </div>
          </form>
        )}

        {/* DELİLLER */}
        {tab === "delil" && !form._isNew && (
          <div className="grid">
            <div className="span2">
              <strong>
                Delil URL'leri
              </strong>
            </div>
            {evidence.length ? (
              <div
                className="span2"
                style={{
                  display:
                    "flex",
                  flexWrap:
                    "wrap",
                  gap: 8,
                }}
              >
                {evidence.map(
                  (u, i) => (
                    <a
                      key={i}
                      href={u}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="pill"
                    >
                      Ek {i + 1}
                    </a>
                  )
                )}
              </div>
            ) : (
              <div
                className="span2 muted"
              >
                Delil yok.
              </div>
            )}
          </div>
        )}

        {/* DESTEKLER */}
        {tab === "destek" && !form._isNew && (
          <div>
            {supportsLoading ? (
              <div className="muted">
                Yükleniyor…
              </div>
            ) : supports.length ? (
              <div
                style={{
                  display:
                    "grid",
                  gap: 8,
                }}
              >
                {supports.map(
                  (s) => (
                    <div
                      key={
                        s._id ||
                        s.id
                      }
                      style={{
                        border:
                          "1px solid #eef2f7",
                        borderRadius: 10,
                        padding: 10,
                        background:
                          "#fbfbfb",
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          justifyContent:
                            "space-between",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            display:
                              "flex",
                            flexDirection:
                              "column",
                          }}
                        >
                          <b>
                            {maskName(
                              s.name ||
                                s.fullName ||
                                s.email ||
                                "destekçi"
                            )}
                          </b>
                          <small className="muted">
                            {fmtDate(
                              s.createdAt ||
                                s.date ||
                                s.supportedAt
                            )}{" "}
                            {s.status
                              ? `• ${s.status}`
                              : ""}
                          </small>
                        </div>
                        <div
                          style={{
                            display:
                              "flex",
                            gap: 6,
                          }}
                        >
                          {s.status !==
                            "approved" && (
                            <button
                              className="btn"
                              onClick={() =>
                                patchSupport(
                                  s._id ||
                                    s.id,
                                  {
                                    status:
                                      "approved",
                                  }
                                )
                              }
                            >
                              Onayla
                            </button>
                          )}
                          {s.status !==
                            "rejected" && (
                            <button
                              className="btn btn-light"
                              onClick={() =>
                                patchSupport(
                                  s._id ||
                                    s.id,
                                  {
                                    status:
                                      "rejected",
                                  }
                                )
                              }
                            >
                              Reddet
                            </button>
                          )}
                          <button
                            className="btn btn-danger"
                            onClick={() =>
                              delSupport(
                                s._id ||
                                  s.id
                              )
                            }
                          >
                            Sil
                          </button>
                        </div>
                      </div>
                      {(s.comment ||
                        s.note) && (
                        <div
                          style={{
                            marginTop: 6,
                            color:
                              "#111",
                          }}
                        >
                          {s.comment ||
                            s.note}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="muted">
                Henüz destek kaydı
                yok.
              </div>
            )}
          </div>
        )}

        {/* İHBARLAR */}
        {tab === "ihbar" && !form._isNew && (
          <div>
            {reportsLoading ? (
              <div className="muted">
                Yükleniyor…
              </div>
            ) : reports.length ? (
              <div
                style={{
                  border:
                    "1px solid #e5e7eb",
                  borderRadius: 12,
                  overflow:
                    "hidden",
                  background:
                    "#fff",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse:
                      "collapse",
                  }}
                >
                  <thead
                    style={{
                      background:
                        "#f8fafc",
                    }}
                  >
                    <tr>
                      <th style={th}>
                        İhbar
                      </th>
                      <th style={th}>
                        Mağdur
                      </th>
                      <th style={th}>
                        Durum
                      </th>
                      <th style={th}>
                        Tarih
                      </th>
                      <th style={th}>
                        Delil
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map(
                      (r) => (
                        <tr
                          key={
                            r._id
                          }
                        >
                          <td style={td}>
                            <div
                              style={{
                                display:
                                  "flex",
                                flexDirection:
                                  "column",
                              }}
                            >
                              <b>
                                {r.name ||
                                  "İhbar"}
                              </b>
                              <small
                                style={{
                                  color:
                                    "#6b7280",
                                }}
                              >
                                {(r.desc ||
                                  "")
                                  .slice(
                                    0,
                                    120
                                  )}
                              </small>
                            </div>
                          </td>
                          <td style={td}>
                            {maskName(
                              r.reporterName ||
                                r.reporterEmail ||
                                "-"
                            )}
                          </td>
                          <td style={td}>
                            <span className="pill">
                              {r.status}
                            </span>
                          </td>
                          <td style={td}>
                            {fmtDate(
                              r.createdAt
                            )}
                          </td>
                          <td style={td}>
                            {Array.isArray(
                              r.evidenceFiles
                            ) &&
                            r
                              .evidenceFiles
                              .length ? (
                              <div
                                style={{
                                  display:
                                    "flex",
                                  gap: 6,
                                  flexWrap:
                                    "wrap",
                                }}
                              >
                                {r.evidenceFiles
                                  .slice(
                                    0,
                                    3
                                  )
                                  .map(
                                    (
                                      u,
                                      i
                                    ) => (
                                      <a
                                        key={
                                          i
                                        }
                                        className="pill"
                                        href={
                                          u
                                        }
                                        target="_blank"
                                        rel="noreferrer noopener"
                                      >
                                        Ek{" "}
                                        {i +
                                          1}
                                      </a>
                                    )
                                  )}
                              </div>
                            ) : (
                              <span className="muted">
                                yok
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="muted">
                İlişkili ihbar
                bulunamadı.
              </div>
            )}
          </div>
        )}

        <style>{modalCss}</style>
      </div>
    </div>
  );
}

/* ============================ Styles ============================ */
const styles = `
  .btn{ padding:8px 12px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; cursor:pointer; font-weight:600; }
  .btn:hover{ background:#f8fafc; }
  .btn-light{ background:#f8fafc; }
  .btn-ghost{ background:transparent; border:1px dashed #e5e7eb; }
  .btn-danger{ background:#fee2e2; border-color:#fecaca; color:#991b1b; }
  input,select,textarea{ width:100%; padding:8px 10px; border-radius:10px; border:1px solid #e5e7eb; background:#fff; font-size:12px; }
  .pill{ display:inline-block; padding:4px 8px; border-radius:999px; border:1px solid #e5e7eb; font-size:11px; color:#2563eb; text-decoration:none; }
  .pill:hover{ background:#eff6ff; }
  .muted{ color:#64748b; }
`;
const modalCss = `
  .modal-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; padding:20px; z-index:1000; }
  .modal{ background:#fff; border-radius:16px; padding:18px; width:min(1100px,96vw); max-height:92vh; overflow:auto; border:1px solid #e5e7eb; }
  .grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .grid .span2{ grid-column:span 2; }
  .actions{ display:flex; align-items:center; gap:10px; justify-content:flex-end; }
`;

