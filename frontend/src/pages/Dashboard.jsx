// frontend/src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

/**
 * Yönetim Paneli — Pro UI
 * - Cam efektli sticky üst bar + istatistik kartları
 * - Arama, filtre, sıralama, CSV dışa aktarma
 * - Detay çekmecesi (galeri ekle/sil, kanıt/ek önizleme)
 * - Eski API uçları için graceful fallback
 * - Sade, bağımsız: harici UI kütüphanesi yok
 */

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("businesses");

  // data
  const [businesses, setBusinesses] = useState([]);
  const [pending, setPending] = useState([]);
  const [archived, setArchived] = useState([]);
  const [reports, setReports] = useState([]);
  const [blacklist, setBlacklist] = useState([]);

  // form & edit
  const [form, setForm] = useState({
    name: "",
    type: "",
    instagramUsername: "",
    instagramUrl: "",
    phone: "",
    address: "",
  });
  const [editId, setEditId] = useState(null);

  // ui
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState({ key: "", dir: "asc" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState(null); // {type, data}

  const API = import.meta.env.VITE_API_URL;

  // theme tokens
  const T = {
    radius: 12,
    card: "#ffffff",
    border: "#e5e7eb",
    text: "#0f172a",
    sub: "#64748b",
    glass: "rgba(255,255,255,.7)",
    glassBorder: "rgba(148,163,184,.35)",
    shadow: "0 10px 30px rgba(2,6,23,.06)",
    blue: "#1e40af",
    blueSoft: "#eff6ff",
    green: "#27ae60",
    red: "#e74c3c",
    orange: "#f39c12",
  };

  // ---- auth helpers
  const token = () =>
    localStorage.getItem("adminToken") ||
    localStorage.getItem("token") ||
    "";
  const auth = () => ({ headers: { Authorization: `Bearer ${token()}` } });
  const guard = async (fn) => {
    try {
      return await fn();
    } catch (e) {
      if (e?.response?.status === 401) {
        window.location.href = "/admin/login";
      }
      throw e;
    }
  };

  /* ---------------------------- API ---------------------------- */
  const fetchBusinesses = async () => {
    await guard(async () => {
      try {
        const { data } = await axios.get(`${API}/api/admin/businesses`, auth());
        setBusinesses(data.items || data.businesses || []);
      } catch {
        const { data } = await axios.get(`${API}/api/businesses`, auth());
        setBusinesses(data.items || data.businesses || []);
      }
    });
  };

  const fetchRequests = async () => {
    await guard(async () => {
      try {
        const { data } = await axios.get(`${API}/api/admin/requests`, auth());
        setPending(data.pending || []);
        setArchived([...(data.approved || []), ...(data.rejected || [])]);
      } catch {
        const { data } = await axios.get(`${API}/api/apply`, auth());
        setPending(data.pending || []);
        setArchived([...(data.approved || []), ...(data.rejected || [])]);
      }
    });
  };

  const fetchReports = async () => {
    await guard(async () => {
      const { data } = await axios.get(`${API}/api/report`, auth());
      setReports(data.reports || []);
    });
  };

  const fetchBlacklist = async () => {
    await guard(async () => {
      const { data } = await axios.get(
        `${API}/api/report/blacklist/all`,
        auth()
      );
      setBlacklist(data.blacklist || []);
    });
  };

  const refreshAll = async () => {
    try {
      setLoading(true);
      setErrMsg("");
      await Promise.all([
        fetchBusinesses(),
        fetchRequests(),
        fetchReports(),
        fetchBlacklist(),
      ]);
    } catch (e) {
      setErrMsg(e?.response?.data?.message || "Veriler alınamadı.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line
  }, []);

  /* ----------------------- İşletme CRUD ------------------------ */
  const handleSave = async () => {
    try {
      if (!form.name.trim()) return alert("İşletme adı zorunlu");
      await guard(async () => {
        if (editId) {
          try {
            await axios.put(
              `${API}/api/admin/businesses/${editId}`,
              form,
              auth()
            );
          } catch {
            await axios.put(`${API}/api/businesses/${editId}`, form, auth());
          }
          setEditId(null);
        } else {
          try {
            await axios.post(`${API}/api/admin/businesses`, form, auth());
          } catch {
            await axios.post(`${API}/api/businesses`, form, auth());
          }
        }
      });
      setForm({
        name: "",
        type: "",
        instagramUsername: "",
        instagramUrl: "",
        phone: "",
        address: "",
      });
      fetchBusinesses();
    } catch (e) {
      alert(e?.response?.data?.message || "Kaydetme hatası");
    }
  };

  const handleEdit = (b) => {
    setForm({
      name: b.name || "",
      type: b.type || "",
      instagramUsername: b.instagramUsername || "",
      instagramUrl: b.instagramUrl || "",
      phone: b.phone || "",
      address: b.address || "",
    });
    setEditId(b._id);
    setActiveTab("businesses");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Bu işletmeyi silmek istediğinizden emin misiniz?"))
      return;
    await guard(async () => {
      try {
        await axios.delete(`${API}/api/admin/businesses/${id}`, auth());
      } catch {
        await axios.delete(`${API}/api/businesses/${id}`, auth());
      }
    });
    fetchBusinesses();
  };

  /* --------------- İşletme GALERİ (max 5) --------------------- */
  const uploadGallery = async (id, fileList) => {
    if (!fileList || !fileList.length) return;
    const fd = new FormData();
    Array.from(fileList).forEach((f) => fd.append("images", f));
    const doUpload = () =>
      axios.post(`${API}/api/admin/businesses/${id}/gallery`, fd, {
        ...auth(),
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: auth().headers.Authorization,
        },
      });
    const doUploadFallback = () =>
      axios.post(`${API}/api/businesses/${id}/gallery`, fd, {
        ...auth(),
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: auth().headers.Authorization,
        },
      });

    const { data } = await guard(async () => {
      try {
        return await doUpload();
      } catch {
        return await doUploadFallback();
      }
    });

    setDrawerItem((prev) =>
      prev && prev.data && prev.data._id === id
        ? { ...prev, data: { ...prev.data, gallery: data.gallery || [] } }
        : prev
    );
    fetchBusinesses();
  };

  const removeGalleryItem = async (id, index) => {
    const doDel = () =>
      axios.delete(`${API}/api/admin/businesses/${id}/gallery/${index}`, auth());
    const doDelFallback = () =>
      axios.delete(`${API}/api/businesses/${id}/gallery/${index}`, auth());

    const { data } = await guard(async () => {
      try {
        return await doDel();
      } catch {
        return await doDelFallback();
      }
    });

    setDrawerItem((prev) =>
      prev && prev.data && prev.data._id === id
        ? { ...prev, data: { ...prev.data, gallery: data.gallery || [] } }
        : prev
    );
    fetchBusinesses();
  };

  /* --------------- Başvuru (Apply) Onay/Reddet ----------------- */
  const handleApprove = async (id) => {
    await guard(async () => {
      try {
        await axios.post(
          `${API}/api/admin/requests/${id}/approve`,
          {},
          auth()
        );
      } catch {
        await axios.post(`${API}/api/apply/${id}/approve`, {}, auth());
      }
    });
    await Promise.all([fetchBusinesses(), fetchRequests()]);
    closeDrawer();
  };

  const handleReject = async (id) => {
    await guard(async () => {
      try {
        await axios.post(
          `${API}/api/admin/requests/${id}/reject`,
          {},
          auth()
        );
      } catch {
        await axios.post(`${API}/api/apply/${id}/reject`, {}, auth());
      }
    });
    await fetchRequests();
    closeDrawer();
  };

  /* --------------------- İhbar (Report) işlemleri --------------- */
  const handleReportApprove = async (id) => {
    await guard(async () => {
      await axios.post(`${API}/api/report/${id}/approve`, {}, auth());
    });
    await Promise.all([fetchReports(), fetchBlacklist()]);
    closeDrawer();
  };

  const handleReportReject = async (id) => {
    await guard(async () => {
      await axios.post(`${API}/api/report/${id}/reject`, {}, auth());
    });
    await fetchReports();
    closeDrawer();
  };

  const handleReportDelete = async (id) => {
    if (!window.confirm("Bu ihbarı silmek istediğinizden emin misiniz?")) return;
    await guard(async () => {
      await axios.delete(`${API}/api/report/${id}`, auth());
    });
    await fetchReports();
    closeDrawer();
  };

  /* --------------------- Blacklist işlemleri -------------------- */
  const handleBlacklistEdit = async (b) => {
    const newName = prompt("Yeni Ad:", b.name);
    if (!newName) return;
    await guard(async () => {
      await axios.put(
        `${API}/api/report/blacklist/${b._id}`,
        { ...b, name: newName },
        auth()
      );
    });
    await fetchBlacklist();
  };

  const handleBlacklistDelete = async (id) => {
    if (
      !window.confirm(
        "Bu işletmeyi kara listeden silmek istediğinizden emin misiniz?"
      )
    )
      return;
    await guard(async () => {
      await axios.delete(`${API}/api/report/blacklist/${id}`, auth());
    });
    await fetchBlacklist();
  };

  /* ----------------------- Tablolar Ortak ----------------------- */
  const lowerIncludes = (hay = "", needle = "") =>
    (hay + "").toLowerCase().includes((needle + "").toLowerCase());

  const filterSort = (rows, keys = []) => {
    let r = rows;
    if (statusFilter !== "all") {
      r = r.filter((x) => (x.status || "pending") === statusFilter);
    }
    if (search.trim()) {
      r = r.filter((row) => keys.some((k) => lowerIncludes(row[k] ?? "", search)));
    }
    if (sort.key) {
      const dir = sort.dir === "asc" ? 1 : -1;
      r = [...r].sort((a, b) => {
        const va = (a[sort.key] ?? "").toString().toLowerCase();
        const vb = (b[sort.key] ?? "").toString().toLowerCase();
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    }
    return r;
  };

  const businessesView = useMemo(
    () =>
      filterSort(businesses, [
        "name",
        "type",
        "phone",
        "instagramUsername",
        "instagramUrl",
        "address",
      ]),
    [businesses, search, sort, statusFilter]
  );
  const pendingView = useMemo(
    () =>
      filterSort(pending, [
        "name",
        "type",
        "instagramUsername",
        "instagramUrl",
        "phone",
        "address",
        "email",
        "status",
      ]),
    [pending, search, sort, statusFilter]
  );
  const archivedView = useMemo(
    () =>
      filterSort(archived, [
        "name",
        "type",
        "instagramUsername",
        "instagramUrl",
        "phone",
        "address",
        "email",
        "status",
      ]),
    [archived, search, sort, statusFilter]
  );
  const reportsView = useMemo(
    () =>
      filterSort(reports, [
        "name",
        "instagramUsername",
        "instagramUrl",
        "phone",
        "desc",
        "status",
      ]),
    [reports, search, sort, statusFilter]
  );
  const blacklistView = useMemo(
    () =>
      filterSort(blacklist, [
        "name",
        "instagramUsername",
        "instagramUrl",
        "phone",
        "desc",
      ]),
    [blacklist, search, sort, statusFilter]
  );

  /* --------------------------- CSV ----------------------------- */
  const toCSV = (rows, cols) => {
    const head = cols.map((c) => `"${c.label}"`).join(",");
    const body = rows
      .map((r) =>
        cols
          .map((c) => {
            const v =
              (typeof c.accessor === "function"
                ? c.accessor(r)
                : r[c.accessor]) ?? "";
            return `"${(v + "").replace(/"/g, '""')}"`;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([head + "\n" + body], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export-${activeTab}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ------------------------- Drawer ---------------------------- */
  const openDrawer = (type, data) => {
    setDrawerItem({ type, data });
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => setDrawerItem(null), 200);
  };

  /* -------------------------- UI ------------------------------- */
  const stats = [
    { label: "İşletme", value: businesses.length, tone: "#06b6d4" },
    { label: "Bekleyen Başvuru", value: pending.length, tone: "#f59e0b" },
    { label: "İhbar", value: reports.length, tone: "#8b5cf6" },
    { label: "Blacklist", value: blacklist.length, tone: "#ef4444" },
  ];

  return (
    <div
      style={{
        padding: 18,
        fontFamily: "Inter, Segoe UI, system-ui, sans-serif",
        color: T.text,
      }}
    >
      {/* Sticky glass header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          padding: 12,
          margin: "-12px -12px 16px",
          backdropFilter: "saturate(180%) blur(8px)",
          background: T.glass,
          borderBottom: `1px solid ${T.glassBorder}`,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              background: T.card,
              padding: 6,
              border: `1px solid ${T.border}`,
              borderRadius: T.radius,
              boxShadow: T.shadow,
            }}
          >
            <Tab
              label="📋 İşletmeler"
              id="businesses"
              active={activeTab}
              onClick={setActiveTab}
            />
            <Tab
              label="📝 Başvurular"
              id="requests"
              active={activeTab}
              onClick={setActiveTab}
            />
            <Tab
              label="📂 Arşiv"
              id="archived"
              active={activeTab}
              onClick={setActiveTab}
            />
            <Tab
              label="⚠️ İhbarlar"
              id="reports"
              active={activeTab}
              onClick={setActiveTab}
            />
            <Tab
              label="⛔ Blacklist"
              id="blacklist"
              active={activeTab}
              onClick={setActiveTab}
            />
          </div>

          <div style={{ flex: 1 }} />

          <input
            placeholder="Ara: ad / instagram / telefon / e-posta…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "10px 12px",
              minWidth: 260,
              borderRadius: T.radius,
              border: `1px solid ${T.border}`,
              outline: "none",
              background: T.card,
              boxShadow: T.shadow,
            }}
          />

          {(activeTab === "requests" || activeTab === "reports") && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: "10px 12px",
                borderRadius: T.radius,
                border: `1px solid ${T.border}`,
                outline: "none",
                background: T.card,
                boxShadow: T.shadow,
              }}
              title="Durum filtresi"
            >
              <option value="all">Tümü</option>
              <option value="pending">Beklemede</option>
              <option value="approved">Onaylandı</option>
              <option value="rejected">Reddedildi</option>
            </select>
          )}

          <button type="button" onClick={refreshAll} style={btnNeutral(T)}>
            ↻ Yenile
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeTab === "businesses") {
                toCSV(businessesView, [
                  { label: "Ad", accessor: "name" },
                  { label: "Tür", accessor: "type" },
                  { label: "Telefon", accessor: "phone" },
                  { label: "Instagram Kullanıcı", accessor: "instagramUsername" },
                  { label: "Instagram URL", accessor: "instagramUrl" },
                  { label: "Adres", accessor: "address" },
                ]);
              } else if (activeTab === "requests") {
                toCSV(pendingView, [
                  { label: "Ad", accessor: "name" },
                  { label: "Tür", accessor: "type" },
                  { label: "Telefon", accessor: "phone" },
                  { label: "E-posta", accessor: "email" },
                  { label: "IG Kullanıcı", accessor: "instagramUsername" },
                  { label: "IG URL", accessor: "instagramUrl" },
                  { label: "Durum", accessor: (r) => r.status || "pending" },
                ]);
              } else if (activeTab === "archived") {
                toCSV(archivedView, [
                  { label: "Ad", accessor: "name" },
                  { label: "Tür", accessor: "type" },
                  { label: "Telefon", accessor: "phone" },
                  { label: "E-posta", accessor: "email" },
                  { label: "IG Kullanıcı", accessor: "instagramUsername" },
                  { label: "IG URL", accessor: "instagramUrl" },
                  { label: "Durum", accessor: "status" },
                ]);
              } else if (activeTab === "reports") {
                toCSV(reportsView, [
                  { label: "Ad", accessor: "name" },
                  { label: "IG Kullanıcı", accessor: "instagramUsername" },
                  { label: "IG URL", accessor: "instagramUrl" },
                  { label: "Telefon", accessor: "phone" },
                  { label: "Açıklama", accessor: "desc" },
                  { label: "Durum", accessor: (r) => r.status || "pending" },
                ]);
              } else {
                toCSV(blacklistView, [
                  { label: "Ad", accessor: "name" },
                  { label: "IG Kullanıcı", accessor: "instagramUsername" },
                  { label: "IG URL", accessor: "instagramUrl" },
                  { label: "Telefon", accessor: "phone" },
                  { label: "Açıklama", accessor: "desc" },
                ]);
              }
            }}
            style={btnBlue(T)}
          >
            ⤓ CSV
          </button>
        </div>

        {/* Stat cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,minmax(160px,1fr))",
            gap: 10,
            marginTop: 12,
          }}
        >
          {stats.map((s, i) => (
            <div
              key={i}
              style={{
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: T.radius,
                padding: 12,
                boxShadow: T.shadow,
              }}
            >
              <div style={{ fontSize: 12, color: T.sub }}>{s.label}</div>
              <div
                style={{
                  marginTop: 6,
                  fontWeight: 900,
                  fontSize: 22,
                  lineHeight: 1,
                  color: s.tone,
                }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {errMsg && (
        <div
          style={{
            ...alert(T),
            background: "#fef2f2",
            borderColor: "#fecaca",
            color: "#991b1b",
          }}
        >
          {errMsg}
        </div>
      )}

      {/* SEKMELER */}
      {activeTab === "businesses" && (
        <section>
          {editId && (
            <p style={{ color: T.orange, fontWeight: "bold", marginBottom: 8 }}>
              ✏️ Düzenleme Modu
            </p>
          )}
          <div
            className="form-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 10,
              background: T.card,
              padding: 12,
              border: `1px solid ${T.border}`,
              borderRadius: T.radius,
              boxShadow: T.shadow,
            }}
          >
            <input
              placeholder="İşletme Adı"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={input(T)}
            />
            <input
              placeholder="Tür"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              style={input(T)}
            />
            <input
              placeholder="Instagram Kullanıcı Adı"
              value={form.instagramUsername}
              onChange={(e) =>
                setForm({ ...form, instagramUsername: e.target.value })
              }
              style={input(T)}
            />
            <input
              placeholder="Instagram Profil URL"
              value={form.instagramUrl}
              onChange={(e) =>
                setForm({ ...form, instagramUrl: e.target.value })
              }
              style={input(T)}
            />
            <input
              placeholder="Telefon"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              style={input(T)}
            />
            <input
              placeholder="Adres"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              style={input(T)}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <button type="button" style={btnGreen(T)} onClick={handleSave}>
              {editId ? "✏️ Güncelle" : "+ İşletme Ekle"}
            </button>
          </div>

          <SmartTable
            loading={loading}
            sort={sort}
            setSort={setSort}
            columns={[
              { key: "name", label: "Ad", width: 180 },
              { key: "type", label: "Tür", width: 120 },
              { key: "phone", label: "Telefon", width: 120 },
              {
                key: "instagramUsername",
                label: "Instagram Kullanıcı",
                width: 160,
              },
              {
                key: "instagramUrl",
                label: "Instagram URL",
                width: 220,
                render: (v) =>
                  v ? (
                    <a href={v} target="_blank" rel="noreferrer">
                      {v}
                    </a>
                  ) : (
                    "-"
                  ),
              },
              { key: "address", label: "Adres", flex: 1 },
              {
                key: "_actions",
                label: "İşlem",
                width: 230,
                sortable: false,
                render: (_, row) => (
                  <>
                    <button
                      type="button"
                      onClick={() => openDrawer("business", row)}
                      style={btnNeutralSm(T)}
                    >
                      🔍 Detay
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEdit(row)}
                      style={btnOrangeSm(T)}
                    >
                      ✏️ Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(row._id)}
                      style={btnDeleteSm(T)}
                    >
                      🗑️ Sil
                    </button>
                  </>
                ),
              },
            ]}
            rows={businessesView}
            onRowClick={(r) => openDrawer("business", r)}
            T={T}
          />
        </section>
      )}

      {activeTab === "requests" && (
        <section>
          <SmartTable
            loading={loading}
            sort={sort}
            setSort={setSort}
            columns={[
              { key: "name", label: "Ad", width: 180 },
              { key: "type", label: "Tür", width: 120 },
              { key: "instagramUsername", label: "IG Kullanıcı", width: 160 },
              {
                key: "instagramUrl",
                label: "IG URL",
                width: 220,
                render: (v) =>
                  v ? (
                    <a href={v} target="_blank" rel="noreferrer">
                      {v}
                    </a>
                  ) : (
                    "-"
                  ),
              },
              { key: "phone", label: "Telefon", width: 130 },
              { key: "address", label: "Adres", flex: 1 },
              { key: "email", label: "E-posta", width: 200 },
              {
                key: "status",
                label: "Durum",
                width: 120,
                render: (v) => <StatusPill v={v || "pending"} />,
              },
              {
                key: "_actions",
                label: "İşlem",
                width: 260,
                sortable: false,
                render: (_, r) => (
                  <>
                    <button
                      type="button"
                      onClick={() => openDrawer("apply", r)}
                      style={btnNeutralSm(T)}
                    >
                      🔍 Detay
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(r._id)}
                      style={btnGreenSm(T)}
                    >
                      ✅ Onayla
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(r._id)}
                      style={btnDeleteSm(T)}
                    >
                      ❌ Reddet
                    </button>
                  </>
                ),
              },
            ]}
            rows={pendingView}
            onRowClick={(r) => openDrawer("apply", r)}
            T={T}
          />
        </section>
      )}

      {activeTab === "archived" && (
        <section>
          <SmartTable
            loading={loading}
            sort={sort}
            setSort={setSort}
            columns={[
              { key: "name", label: "Ad", width: 180 },
              { key: "type", label: "Tür", width: 120 },
              { key: "instagramUsername", label: "IG Kullanıcı", width: 160 },
              {
                key: "instagramUrl",
                label: "IG URL",
                width: 220,
                render: (v) =>
                  v ? (
                    <a href={v} target="_blank" rel="noreferrer">
                      {v}
                    </a>
                  ) : (
                    "-"
                  ),
              },
              { key: "phone", label: "Telefon", width: 130 },
              { key: "address", label: "Adres", flex: 1 },
              { key: "email", label: "E-posta", width: 200 },
              {
                key: "status",
                label: "Durum",
                width: 120,
                render: (v) => <StatusPill v={v} />,
              },
            ]}
            rows={archivedView}
            onRowClick={(r) => openDrawer("apply", r)}
            T={T}
          />
        </section>
      )}

      {activeTab === "reports" && (
        <section>
          <SmartTable
            loading={loading}
            sort={sort}
            setSort={setSort}
            columns={[
              { key: "name", label: "İşletme Adı", width: 180 },
              { key: "instagramUsername", label: "IG Kullanıcı", width: 160 },
              {
                key: "instagramUrl",
                label: "IG URL",
                width: 220,
                render: (v) =>
                  v ? (
                    <a href={v} target="_blank" rel="noreferrer">
                      {v}
                    </a>
                  ) : (
                    "-"
                  ),
              },
              { key: "phone", label: "Telefon", width: 130 },
              {
                key: "desc",
                label: "Açıklama",
                flex: 1,
                render: (v) =>
                  (v || "").slice(0, 120) + ((v || "").length > 120 ? "…" : ""),
              },
              {
                key: "status",
                label: "Durum",
                width: 120,
                render: (v) => <StatusPill v={v || "pending"} />,
              },
              {
                key: "_actions",
                label: "İşlem",
                width: 300,
                sortable: false,
                render: (_, r) => (
                  <>
                    <button
                      type="button"
                      onClick={() => openDrawer("report", r)}
                      style={btnNeutralSm(T)}
                    >
                      🔍 Detay
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReportApprove(r._id)}
                      style={btnGreenSm(T)}
                    >
                      ✅ Onayla
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReportReject(r._id)}
                      style={btnDeleteSm(T)}
                    >
                      ❌ Reddet
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReportDelete(r._id)}
                      style={btnDeleteSm(T)}
                    >
                      🗑️ Sil
                    </button>
                  </>
                ),
              },
            ]}
            rows={reportsView}
            onRowClick={(r) => openDrawer("report", r)}
            T={T}
          />
        </section>
      )}

      {activeTab === "blacklist" && (
        <section>
          <SmartTable
            loading={loading}
            sort={sort}
            setSort={setSort}
            columns={[
              { key: "name", label: "Ad", width: 180 },
              { key: "instagramUsername", label: "IG Kullanıcı", width: 160 },
              {
                key: "instagramUrl",
                label: "IG URL",
                width: 220,
                render: (v) =>
                  v ? (
                    <a href={v} target="_blank" rel="noreferrer">
                      {v}
                    </a>
                  ) : (
                    "-"
                  ),
              },
              { key: "phone", label: "Telefon", width: 130 },
              { key: "desc", label: "Açıklama", flex: 1 },
              {
                key: "_actions",
                label: "İşlem",
                width: 220,
                sortable: false,
                render: (_, b) => (
                  <>
                    <button
                      type="button"
                      onClick={() => openDrawer("blacklist", b)}
                      style={btnNeutralSm(T)}
                    >
                      🔍 Detay
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBlacklistEdit(b)}
                      style={btnOrangeSm(T)}
                    >
                      ✏️ Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBlacklistDelete(b._id)}
                      style={btnDeleteSm(T)}
                    >
                      🗑️ Sil
                    </button>
                  </>
                ),
              },
            ]}
            rows={blacklistView}
            onRowClick={(r) => openDrawer("blacklist", r)}
            T={T}
          />
        </section>
      )}

      {/* Sağ Detay Çekmecesi */}
      {drawerItem && (
        <DetailsDrawer
          open={drawerOpen}
          onClose={closeDrawer}
          type={drawerItem.type}
          data={drawerItem.data}
          actions={{
            approve: handleApprove,
            reject: handleReject,
            reportApprove: handleReportApprove,
            reportReject: handleReportReject,
            reportDelete: handleReportDelete,
            uploadGallery,
            removeGalleryItem,
          }}
          T={T}
        />
      )}
    </div>
  );
}

/* ========================= Alt Bileşenler ========================= */

function Tab({ label, id, active, onClick }) {
  const isActive = active === id;
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      style={{
        padding: "8px 12px",
        borderRadius: 10,
        border: `1px solid ${isActive ? "#111827" : "#e5e7eb"}`,
        background: isActive ? "#111827" : "#fff",
        color: isActive ? "#fff" : "#111827",
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function StatusPill({ v }) {
  const map = { pending: "#fde68a", approved: "#bbf7d0", rejected: "#fecaca" };
  const text = { pending: "#92400e", approved: "#065f46", rejected: "#991b1b" };
  return (
    <span
      style={{
        padding: "4px 8px",
        borderRadius: 999,
        background: map[v] || "#e5e7eb",
        color: text[v] || "#111827",
        fontWeight: 800,
        fontSize: 12,
      }}
    >
      {v}
    </span>
  );
}

function SmartTable({ loading, sort, setSort, columns, rows, onRowClick, T }) {
  const onSort = (col) => {
    if (col.sortable === false) return;
    if (sort.key === col.key)
      setSort({ key: col.key, dir: sort.dir === "asc" ? "desc" : "asc" });
    else setSort({ key: col.key, dir: "asc" });
  };
  return (
    <div
      style={{
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        overflow: "hidden",
        background: T.card,
        boxShadow: T.shadow,
        marginTop: 12,
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead
            style={{
              position: "sticky",
              top: 0,
              background: "#f8fafc",
              zIndex: 1,
            }}
          >
            <tr>
              {columns.map((c, i) => (
                <th
                  key={i}
                  onClick={() => onSort(c)}
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    borderBottom: `1px solid ${T.border}`,
                    whiteSpace: "nowrap",
                    cursor: c.sortable === false ? "default" : "pointer",
                    width: c.width,
                    fontSize: 12,
                    color: "#334155",
                    userSelect: "none",
                  }}
                >
                  {c.label}{" "}
                  {sort.key === c.key && (sort.dir === "asc" ? "▲" : "▼")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={columns.length} style={{ padding: 12 }}>
                    <div
                      style={{ height: 12, background: "#f3f4f6", borderRadius: 6 }}
                    />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ padding: 16, textAlign: "center", color: "#6b7280" }}
                >
                  Veri bulunamadı
                </td>
              </tr>
            ) : (
              rows.map((row, ri) => (
                <tr
                  key={ri}
                  onClick={(e) => {
                    const tag = (e.target.tagName || "").toLowerCase();
                    if (tag === "button" || tag === "a" || e.target.closest("button"))
                      return;
                    onRowClick?.(row);
                  }}
                  style={{
                    borderBottom: `1px solid #f3f4f6`,
                    cursor: "pointer",
                    background: ri % 2 ? "#fcfcfd" : "#fff",
                  }}
                >
                  {columns.map((c, ci) => {
                    const raw = row[c.key];
                    const content = c.render ? c.render(raw, row) : raw ?? "-";
                    return (
                      <td
                        key={ci}
                        style={{
                          padding: "10px 12px",
                          whiteSpace: c.flex ? "normal" : "nowrap",
                          fontSize: 13,
                        }}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DetailsDrawer({ open, onClose, type, data, actions, T }) {
  const files =
    data?.documents ||
    data?.documentUrls ||
    data?.evidences ||
    data?.attachments ||
    [];

  const isApply = type === "apply";
  const isReport = type === "report";
  const isBusiness = type === "business";
  const isBlacklist = type === "blacklist";

  const Row = ({ k, v, copyable }) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: `1px dashed ${T.border}`,
        alignItems: "center",
      }}
    >
      <div style={{ color: T.sub, minWidth: 160, fontSize: 12 }}>{k}</div>
      <div style={{ flex: 1, textAlign: "right", wordBreak: "break-word" }}>
        {typeof v === "string" && v.startsWith("http") ? (
          <a href={v} target="_blank" rel="noreferrer">
            {v}
          </a>
        ) : (
          v ?? "-"
        )}
      </div>
      {copyable && (
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(v || "")}
          style={btnNeutralSm(T)}
          title="Kopyala"
        >
          📋
        </button>
      )}
    </div>
  );

  const gallery = data?.gallery || [];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        pointerEvents: open ? "auto" : "none",
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          opacity: open ? 1 : 0,
          transition: ".2s",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: "min(560px, 92vw)",
          background: "#fff",
          borderLeft: `1px solid ${T.border}`,
          boxShadow: "-10px 0 30px rgba(0,0,0,.1)",
          transform: open ? "translateX(0)" : "translateX(110%)",
          transition: "transform .25s",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: `1px solid ${T.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontWeight: 900,
          }}
        >
          <div>
            {isApply && "Başvuru Detayı"}
            {isReport && "İhbar Detayı"}
            {isBusiness && "İşletme Detayı"}
            {isBlacklist && "Blacklist Kaydı"}
          </div>
          <button type="button" onClick={onClose} style={btnNeutralSm(T)}>
            ✖
          </button>
        </div>

        <div style={{ padding: 16, overflowY: "auto" }}>
          {/* Bilgiler */}
          {isBusiness && (
            <>
              <Row k="İşletme" v={data?.name} copyable />
              <Row k="Tür" v={data?.type} />
              <Row k="Telefon" v={data?.phone} copyable />
              <Row k="Instagram Kullanıcı" v={data?.instagramUsername} copyable />
              <Row k="Instagram URL" v={data?.instagramUrl} />
              <Row k="Adres" v={data?.address} />

              {/* Galeri (max 5) */}
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 10,
                  borderTop: `1px solid ${T.border}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <b>Galeri (max 5)</b>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) =>
                      actions.uploadGallery(data._id, e.target.files)
                    }
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginTop: 8,
                  }}
                >
                  {gallery.length === 0 && (
                    <div style={{ opacity: 0.7 }}>Görsel yok.</div>
                  )}
                  {gallery.map((u, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img
                        src={u}
                        alt=""
                        style={{
                          width: 120,
                          height: 90,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: `1px solid ${T.border}`,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => actions.removeGalleryItem(data._id, i)}
                        style={{
                          ...btnDeleteSm(T),
                          position: "absolute",
                          right: 4,
                          bottom: 4,
                        }}
                      >
                        Sil
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {isApply && (
            <>
              <Row k="İşletme" v={data?.name} copyable />
              <Row k="Tür" v={data?.type} />
              <Row k="Telefon" v={data?.phone} copyable />
              <Row k="E-posta" v={data?.email} copyable />
              <Row k="Instagram Kullanıcı" v={data?.instagramUsername} copyable />
              <Row k="Instagram URL" v={data?.instagramUrl} />
              <Row k="Adres" v={data?.address} />
              <Row k="Durum" v={data?.status || "pending"} />
              {!!data?.note && <Row k="Not" v={data?.note} />}
            </>
          )}

          {isReport && (
            <>
              <Row k="İşletme" v={data?.name} copyable />
              <Row k="Instagram Kullanıcı" v={data?.instagramUsername} copyable />
              <Row k="Instagram URL" v={data?.instagramUrl} />
              <Row k="Telefon" v={data?.phone} copyable />
              <Row k="Durum" v={data?.status || "pending"} />
              {!!data?.desc && <Row k="Açıklama" v={data?.desc} />}
            </>
          )}

          {isBlacklist && (
            <>
              <Row k="İşletme" v={data?.name} />
              <Row k="Instagram Kullanıcı" v={data?.instagramUsername} />
              <Row k="Instagram URL" v={data?.instagramUrl} />
              <Row k="Telefon" v={data?.phone} />
              {!!data?.desc && <Row k="Açıklama" v={data?.desc} />}
            </>
          )}

          {/* Dosyalar / Kanıtlar */}
          {!!files?.length && (
            <>
              <div style={{ margin: "14px 0 8px", fontWeight: 900 }}>
                Ekler / Kanıtlar
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))",
                  gap: 10,
                }}
              >
                {files.map((f, i) => {
                  const url = f?.url || f;
                  const name =
                    f?.name || (typeof f === "string" ? f.split("/").pop() : "");
                  const mime = f?.mime || "";
                  const isPDF =
                    (mime || name).toLowerCase().includes("pdf") ||
                    name.toLowerCase().endsWith(".pdf");
                  return (
                    <div
                      key={i}
                      style={{
                        border: `1px solid ${T.border}`,
                        borderRadius: 10,
                        overflow: "hidden",
                        background: "#fff",
                      }}
                    >
                      <div
                        style={{
                          height: 120,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "#f8fafc",
                        }}
                      >
                        {isPDF ? (
                          <div style={{ fontSize: 30 }}>📄</div>
                        ) : (
                          <img
                            src={url}
                            alt=""
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              filter: f.blur ? "blur(6px)" : "none",
                            }}
                          />
                        )}
                      </div>
                      <div
                        style={{
                          padding: 8,
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {name || "dosya"}
                        </span>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          style={btnNeutralTiny(T)}
                        >
                          Aç
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: 12,
            borderTop: `1px solid ${T.border}`,
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
          }}
        >
          {isApply && data?._id && (
            <>
              <button
                type="button"
                onClick={() => actions.approve(data._id)}
                style={btnGreenSm(T)}
              >
                ✅ Onayla
              </button>
              <button
                type="button"
                onClick={() => actions.reject(data._id)}
                style={btnDeleteSm(T)}
              >
                ❌ Reddet
              </button>
            </>
          )}
          {isReport && data?._id && (
            <>
              <button
                type="button"
                onClick={() => actions.reportApprove(data._id)}
                style={btnGreenSm(T)}
              >
                ✅ Onayla
              </button>
              <button
                type="button"
                onClick={() => actions.reportReject(data._id)}
                style={btnDeleteSm(T)}
              >
                ❌ Reddet
              </button>
              <button
                type="button"
                onClick={() => actions.reportDelete(data._id)}
                style={btnDeleteSm(T)}
              >
                🗑️ Sil
              </button>
            </>
          )}
          <button type="button" onClick={onClose} style={btnNeutral(T)}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================= Stiller ========================= */
const btnGreen = (T) => ({
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  backgroundColor: T.green,
  color: "#fff",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
});
const btnNeutral = (T) => ({
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${T.border}`,
  background: "#fff",
  color: "#111827",
  fontWeight: 800,
  cursor: "pointer",
});
const btnBlue = (T) => ({
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #93c5fd",
  background: T.blueSoft,
  color: T.blue,
  fontWeight: 900,
  cursor: "pointer",
});
const btnNeutralSm = (T) => ({
  ...btnNeutral(T),
  padding: "6px 10px",
  borderRadius: 8,
  fontWeight: 700,
});
const btnNeutralTiny = (T) => ({
  ...btnNeutralSm(T),
  padding: "4px 8px",
  fontWeight: 700,
});
const btnGreenSm = (T) => ({
  ...btnGreen(T),
  padding: "6px 10px",
  borderRadius: 8,
  fontWeight: 800,
});
const btnDeleteSm = (T) => ({
  ...btnGreenSm(T),
  backgroundColor: T.red,
});
const btnOrangeSm = (T) => ({
  ...btnGreenSm(T),
  backgroundColor: T.orange,
});
const alert = (T) => ({
  padding: 10,
  borderRadius: 10,
  border: `1px solid ${T.border}`,
  marginBottom: 10,
});
const input = (T) => ({
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${T.border}`,
  outline: "none",
  background: "#fff",
});
