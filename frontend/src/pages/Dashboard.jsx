// frontend/src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

/**
 * Yönetim Paneli — Ultra Pro
 * - Tek axios instance, otomatik Authorization & 401 redirect
 * - /api/admin/* ⇒ hata durumunda /api/* fallback (eski backend desteği)
 * - Debounced arama, client-side sıralama & sayfalama
 * - UI tercihlerini saklama (tab, arama, sıralama, sayfa, filtre)
 * - CSV (UTF-8 BOM, Excel dostu), kısayollar (/ odak, r yenile)
 * - Offline uyarısı, toast bildirimleri, detay çekmecesi + galeri yönetimi
 */

export default function Dashboard() {
  /* ==================== Config & HTTP ==================== */
  const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

  const http = useMemo(() => {
    const inst = axios.create({
      baseURL: API_BASE || "",
      withCredentials: true,
      timeout: 30000,
    });
    // Request interceptor: token + opsiyonel ADMIN_KEY
    inst.interceptors.request.use((cfg) => {
      const t =
        localStorage.getItem("adminToken") ||
        localStorage.getItem("token") ||
        "";
      if (t) cfg.headers.Authorization = `Bearer ${t}`;

      // 👇 admin key'i tarayıcıdan ilet (localStorage > ADMIN_KEY)
      const adminKey = localStorage.getItem("ADMIN_KEY");
      if (adminKey) cfg.headers["x-admin-key"] = adminKey;

      return cfg;
    });
    // Response interceptor: 401'de login'e yönlendir
    inst.interceptors.response.use(
      (r) => r,
      (err) => {
        if (err?.response?.status === 401) {
          window.location.href = "/admin/login";
        }
        return Promise.reject(err);
      }
    );
    return inst;
  }, [API_BASE]);

  const url = (p) => `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;

  /* ==================== UI State ==================== */
  const UI_KEY = "dash.ui.v2";
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(UI_KEY) || "{}");
    } catch {
      return {};
    }
  })();

  const [activeTab, setActiveTab] = useState(saved.activeTab || "businesses");
  const [search, setSearch] = useState(saved.search || "");
  const [statusFilter, setStatusFilter] = useState(saved.statusFilter || "all");
  const [sort, setSort] = useState(saved.sort || { key: "", dir: "asc" });
  const [page, setPage] = useState(saved.page || 1);
  const [pageSize, setPageSize] = useState(saved.pageSize || 20);
  const [offline, setOffline] = useState(!navigator.onLine);

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

  // ui ops
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState(null); // {type, data}
  const [toast, setToast] = useState(""); // ephemeral
  const searchRef = useRef(null);

  // persist UI
  useEffect(() => {
    const st = {
      activeTab,
      search,
      statusFilter,
      sort,
      page,
      pageSize,
    };
    localStorage.setItem(UI_KEY, JSON.stringify(st));
  }, [activeTab, search, statusFilter, sort, page, pageSize]);

  // offline/online
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // kısayollar
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (!e.ctrlKey && !e.metaKey && k === "r") {
        // sayfayı yenilemeden veriyi yenile
        e.preventDefault();
        refreshAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1600);
  };

  /* ==================== API helpers ==================== */
  const tryAdminThenPublic = async (adminCall, fallbackCall) => {
    try {
      return await adminCall();
    } catch {
      return await fallbackCall();
    }
  };

  const fetchBusinesses = async () => {
    const { data } = await tryAdminThenPublic(
      () => http.get("/api/admin/businesses"),
      () => http.get("/api/businesses")
    );
    setBusinesses(data.items || data.businesses || []);
  };

  // 👇 Admin ve legacy apply endpointlerinin cevaplarını tek şemaya çevirir
  const normalizeRequests = (data) => {
    // Admin API: { success, requests: [...] }
    const list = data?.requests || data?.items;
    if (Array.isArray(list)) {
      const pending = list.filter((x) => (x.status || "pending") === "pending");
      const archived = list.filter((x) =>
        ["approved", "rejected"].includes(x.status)
      );
      return { pending, archived };
    }
    // Legacy API: { pending:[], approved:[], rejected:[] }
    return {
      pending: data?.pending || [],
      archived: [...(data?.approved || []), ...(data?.rejected || [])],
    };
  };

  const fetchRequests = async () => {
    const { data } = await tryAdminThenPublic(
      () => http.get("/api/admin/requests"),
      () => http.get("/api/apply")
    );
    const norm = normalizeRequests(data);
    setPending(norm.pending);
    setArchived(norm.archived);
  };

  const fetchReports = async () => {
    const { data } = await http.get("/api/report");
    setReports(data.reports || []);
  };

  const fetchBlacklist = async () => {
    const { data } = await http.get("/api/report/blacklist/all");
    setBlacklist(data.blacklist || []);
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
      flash("✓ Güncellendi");
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

  /* ==================== CRUD: Businesses ==================== */
  const handleSave = async () => {
    try {
      if (!form.name.trim()) return alert("İşletme adı zorunlu");
      if (editId) {
        await tryAdminThenPublic(
          () => http.put(`/api/admin/businesses/${editId}`, form),
          () => http.put(`/api/businesses/${editId}`, form)
        );
        flash("✓ İşletme güncellendi");
      } else {
        await tryAdminThenPublic(
          () => http.post(`/api/admin/businesses`, form),
          () => http.post(`/api/businesses`, form)
        );
        flash("✓ İşletme eklendi");
      }
      setForm({
        name: "",
        type: "",
        instagramUsername: "",
        instagramUrl: "",
        phone: "",
        address: "",
      });
      setEditId(null);
      await fetchBusinesses();
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
    await tryAdminThenPublic(
      () => http.delete(`/api/admin/businesses/${id}`),
      () => http.delete(`/api/businesses/${id}`)
    );
    flash("✓ Silindi");
    await fetchBusinesses();
  };

  /* =========== Business Gallery (tip/limit guard) ============ */
  const uploadGallery = async (id, fileList) => {
    if (!fileList || !fileList.length) return;
    const allow = ["image/jpeg", "image/png", "image/webp"];
    const files = Array.from(fileList).filter((f) => allow.includes(f.type));
    if (!files.length) return alert("Sadece JPG/PNG/WEBP yükleyin.");

    // max 5
    const cur = (drawerItem?.data?.gallery || []).length;
    if (cur + files.length > 5) {
      return alert("Galeri limiti 5 görseldir.");
    }

    const fd = new FormData();
    files.forEach((f) => fd.append("images", f));

    const req = () =>
      http.post(`/api/admin/businesses/${id}/gallery`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    const reqFallback = () =>
      http.post(`/api/businesses/${id}/gallery`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

    const { data } = await tryAdminThenPublic(req, reqFallback);

    setDrawerItem((prev) =>
      prev && prev.data && prev.data._id === id
        ? { ...prev, data: { ...prev.data, gallery: data.gallery || [] } }
        : prev
    );
    await fetchBusinesses();
    flash("✓ Yüklendi");
  };

  const removeGalleryItem = async (id, index) => {
    const doDel = () => http.delete(`/api/admin/businesses/${id}/gallery/${index}`);
    const doDelFallback = () =>
      http.delete(`/api/businesses/${id}/gallery/${index}`);

    const { data } = await tryAdminThenPublic(doDel, doDelFallback);

    setDrawerItem((prev) =>
      prev && prev.data && prev.data._id === id
        ? { ...prev, data: { ...prev.data, gallery: data.gallery || [] } }
        : prev
    );
    await fetchBusinesses();
    flash("✓ Kaldırıldı");
  };

  /* ============== Requests (Apply) actions ============== */
  const handleApprove = async (id) => {
    await tryAdminThenPublic(
      // ✅ Admin backend ile uyumlu - ARTIK DOĞRU ENDPOINT'İ ÇAĞIRIYOR
      () => http.post(`/api/admin/requests/${id}/approve`, {}),
      // ↘ Legacy fallback
      () => http.post(`/api/apply/${id}/approve`, {})
    );
    await Promise.all([fetchBusinesses(), fetchRequests()]);
    flash("✓ Başvuru onaylandı ve işletme oluşturuldu!");
    closeDrawer();
  };

  const handleReject = async (id) => {
    await tryAdminThenPublic(
      // ✅ Admin backend ile uyumlu - BU DA DÜZELTİLDİ
      () => http.post(`/api/admin/requests/${id}/reject`, {}),
      // ↘ Legacy fallback
      () => http.post(`/api/apply/${id}/reject`, {})
    );
    await fetchRequests();
    flash("✓ Başvuru reddedildi");
    closeDrawer();
  };

  /* ================= Reports actions ================== */
  const handleReportApprove = async (id) => {
    await http.post(`/api/report/${id}/approve`, {});
    await Promise.all([fetchReports(), fetchBlacklist()]);
    flash("✓ İhbar onaylandı");
    closeDrawer();
  };

  const handleReportReject = async (id) => {
    await http.post(`/api/report/${id}/reject`, {});
    await fetchReports();
    flash("✓ İhbar reddedildi");
    closeDrawer();
  };

  const handleReportDelete = async (id) => {
    if (!window.confirm("Bu ihbarı silmek istediğinizden emin misiniz?")) return;
    await http.delete(`/api/report/${id}`);
    await fetchReports();
    flash("✓ İhbar silindi");
    closeDrawer();
  };

  /* ================= Blacklist actions ================= */
  const handleBlacklistEdit = async (b) => {
    const newName = prompt("Yeni Ad:", b.name);
    if (!newName) return;
    await http.put(`/api/report/blacklist/${b._id}`, { ...b, name: newName });
    await fetchBlacklist();
    flash("✓ Blacklist güncellendi");
  };

  const handleBlacklistDelete = async (id) => {
    if (!window.confirm("Bu işletmeyi kara listeden silmek istediğinizden emin misiniz?")) return;
    await http.delete(`/api/report/blacklist/${id}`);
    await fetchBlacklist();
    flash("✓ Blacklist kaydı silindi");
  };

  /* ================= Filtreleme & Sıralama ================= */
  const lowerIncludes = (hay = "", needle = "") =>
    (hay + "").toLowerCase().includes((needle + "").toLowerCase());

  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const filterSort = (rows, keys = []) => {
    let r = rows;
    if (statusFilter !== "all") {
      r = r.filter((x) => (x.status || "pending") === statusFilter);
    }
    if (debouncedSearch.trim()) {
      r = r.filter((row) =>
        keys.some((k) => lowerIncludes(row[k] ?? "", debouncedSearch))
      );
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
    [businesses, debouncedSearch, sort, statusFilter]
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
    [pending, debouncedSearch, sort, statusFilter]
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
    [archived, debouncedSearch, sort, statusFilter]
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
    [reports, debouncedSearch, sort, statusFilter]
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
    [blacklist, debouncedSearch, sort, statusFilter]
  );

  // sekme değişince sayfayı başa al
  useEffect(() => setPage(1), [activeTab, debouncedSearch, statusFilter, sort]);

  // pagination
  const PAGE_SIZES = [10, 20, 50, 100];
  const pickView = () => {
    if (activeTab === "businesses") return businessesView;
    if (activeTab === "requests") return pendingView;
    if (activeTab === "archived") return archivedView;
    if (activeTab === "reports") return reportsView;
    return blacklistView;
  };
  const viewAll = pickView();
  const total = viewAll.length;
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const pageRows = viewAll.slice(start, end);

  /* ================= CSV Export (UTF-8 BOM) ================= */
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
    const blob = new Blob(["\ufeff" + head + "\n" + body], {
      type: "text/csv;charset=utf-8;",
    });
    const dl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dl;
    a.download = `export-${activeTab}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(dl);
  };

  /* ================= Drawer ops ================= */
  const openDrawer = (type, data) => {
    setDrawerItem({ type, data });
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => setDrawerItem(null), 200);
  };

  // theme
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

  // stats
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
            <Tab label="📋 İşletmeler" id="businesses" active={activeTab} onClick={setActiveTab} />
            <Tab label="📝 Başvurular" id="requests" active={activeTab} onClick={setActiveTab} />
            <Tab label="📂 Arşiv" id="archived" active={activeTab} onClick={setActiveTab} />
            <Tab label="⚠️ İhbarlar" id="reports" active={activeTab} onClick={setActiveTab} />
            <Tab label="⛔ Blacklist" id="blacklist" active={activeTab} onClick={setActiveTab} />
          </div>

          <div style={{ flex: 1 }} />

          <input
            ref={searchRef}
            placeholder="Ara: ad / instagram / telefon / e-posta… (Ctrl+/)"
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

          <button type="button" onClick={refreshAll} style={btnNeutral(T)} title="Yenile (R)">
            ↻ Yenile
          </button>

          {/* CSV: aktif sekmenin filtrelenmiş tüm satırları */}
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

        {offline && (
          <div
            style={{
              marginTop: 10,
              padding: 8,
              borderRadius: 10,
              border: `1px solid #fed7aa`,
              background: "#fff7ed",
              color: "#9a3412",
              fontWeight: 700,
            }}
            role="status"
          >
            Çevrimdışısınız — sonuçlar güncellenemeyebilir.
          </div>
        )}
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
            <input placeholder="İşletme Adı" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={input(T)} />
            <input placeholder="Tür" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={input(T)} />
            <input placeholder="Instagram Kullanıcı Adı" value={form.instagramUsername} onChange={(e) => setForm({ ...form, instagramUsername: e.target.value })} style={input(T)} />
            <input placeholder="Instagram Profil URL" value={form.instagramUrl} onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })} style={input(T)} />
            <input placeholder="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={input(T)} />
            <input placeholder="Adres" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={input(T)} />
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
              { key: "instagramUsername", label: "Instagram Kullanıcı", width: 160 },
              {
                key: "instagramUrl",
                label: "Instagram URL",
                width: 220,
                render: (v) => (v ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : "-"),
              },
              { key: "address", label: "Adres", flex: 1 },
              {
                key: "_actions",
                label: "İşlem",
                width: 230,
                sortable: false,
                render: (_, row) => (
                  <>
                    <button type="button" onClick={() => openDrawer("business", row)} style={btnNeutralSm(T)}>🔍 Detay</button>
                    <button type="button" onClick={() => handleEdit(row)} style={btnOrangeSm(T)}>✏️ Düzenle</button>
                    <button type="button" onClick={() => handleDelete(row._id)} style={btnDeleteSm(T)}>🗑️ Sil</button>
                  </>
                ),
              },
            ]}
            rows={pageRows}
            total={total}
            start={start}
            end={end}
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            T={T}
            onRowClick={(r) => openDrawer("business", r)}
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
                render: (v) => (v ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : "-"),
              },
              { key: "phone", label: "Telefon", width: 130 },
              { key: "address", label: "Adres", flex: 1 },
              { key: "email", label: "E-posta", width: 200 },
              { key: "status", label: "Durum", width: 120, render: (v) => <StatusPill v={v || "pending"} /> },
              {
                key: "_actions",
                label: "İşlem",
                width: 260,
                sortable: false,
                render: (_, r) => (
                  <>
                    <button type="button" onClick={() => openDrawer("apply", r)} style={btnNeutralSm(T)}>🔍 Detay</button>
                    <button type="button" onClick={() => handleApprove(r._id)} style={btnGreenSm(T)}>✅ Onayla</button>
                    <button type="button" onClick={() => handleReject(r._id)} style={btnDeleteSm(T)}>❌ Reddet</button>
                  </>
                ),
              },
            ]}
            rows={pageRows}
            total={total}
            start={start}
            end={end}
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            T={T}
            onRowClick={(r) => openDrawer("apply", r)}
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
                render: (v) => (v ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : "-"),
              },
              { key: "phone", label: "Telefon", width: 130 },
              { key: "address", label: "Adres", flex: 1 },
              { key: "email", label: "E-posta", width: 200 },
              { key: "status", label: "Durum", width: 120, render: (v) => <StatusPill v={v} /> },
            ]}
            rows={pageRows}
            total={total}
            start={start}
            end={end}
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            T={T}
            onRowClick={(r) => openDrawer("apply", r)}
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
                render: (v) => (v ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : "-"),
              },
              { key: "phone", label: "Telefon", width: 130 },
              { key: "desc", label: "Açıklama", flex: 1, render: (v) => (v || "").slice(0, 120) + ((v || "").length > 120 ? "…" : "") },
              { key: "status", label: "Durum", width: 120, render: (v) => <StatusPill v={v || "pending"} /> },
              {
                key: "_actions",
                label: "İşlem",
                width: 300,
                sortable: false,
                render: (_, r) => (
                  <>
                    <button type="button" onClick={() => openDrawer("report", r)} style={btnNeutralSm(T)}>🔍 Detay</button>
                    <button type="button" onClick={() => handleReportApprove(r._id)} style={btnGreenSm(T)}>✅ Onayla</button>
                    <button type="button" onClick={() => handleReportReject(r._id)} style={btnDeleteSm(T)}>❌ Reddet</button>
                    <button type="button" onClick={() => handleReportDelete(r._id)} style={btnDeleteSm(T)}>🗑️ Sil</button>
                  </>
                ),
              },
            ]}
            rows={pageRows}
            total={total}
            start={start}
            end={end}
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            T={T}
            onRowClick={(r) => openDrawer("report", r)}
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
                render: (v) => (v ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : "-"),
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
                    <button type="button" onClick={() => openDrawer("blacklist", b)} style={btnNeutralSm(T)}>🔍 Detay</button>
                    <button type="button" onClick={() => handleBlacklistEdit(b)} style={btnOrangeSm(T)}>✏️ Düzenle</button>
                    <button type="button" onClick={() => handleBlacklistDelete(b._id)} style={btnDeleteSm(T)}>🗑️ Sil</button>
                  </>
                ),
              },
            ]}
            rows={pageRows}
            total={total}
            start={start}
            end={end}
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            T={T}
            onRowClick={(r) => openDrawer("blacklist", r)}
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

      {/* Toast */}
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 18,
            right: 18,
            background: "#111827",
            color: "#fff",
            padding: "10px 12px",
            borderRadius: 10,
            boxShadow: "0 10px 24px rgba(0,0,0,.18)",
            fontWeight: 800,
            zIndex: 9999,
          }}
        >
          {toast}
        </div>
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

function SmartTable({
  loading,
  sort,
  setSort,
  columns,
  rows,
  onRowClick,
  T,
  // pagination
  total = 0,
  start = 0,
  end = 0,
  page = 1,
  setPage,
  pageSize = 20,
  setPageSize,
}) {
  const onSort = (col) => {
    if (col.sortable === false) return;
    if (sort.key === col.key)
      setSort({ key: col.key, dir: sort.dir === "asc" ? "desc" : "asc" });
    else setSort({ key: col.key, dir: "asc" });
  };

  const pageCount = Math.max(1, Math.ceil((total || 0) / pageSize));
  const canPrev = page > 1;
  const canNext = page < pageCount;

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
                  {c.label} {sort.key === c.key && (sort.dir === "asc" ? "▲" : "▼")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={columns.length} style={{ padding: 12 }}>
                    <div style={{ height: 12, background: "#f3f4f6", borderRadius: 6 }} />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 16, textAlign: "center", color: "#6b7280" }}>
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

      {/* table footer: pagination */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "space-between",
          padding: 10,
          borderTop: `1px solid ${T.border}`,
          background: "#f8fafc",
        }}
      >
        <div style={{ fontSize: 12, color: "#475569" }}>
          {total ? `${start + 1}–${end} / ${total}` : "0 sonuç"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={pageSize}
            onChange={(e) => setPageSize?.(parseInt(e.target.value, 10))}
            style={{
              padding: "6px 8px",
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              background: "#fff",
              fontWeight: 700,
            }}
            title="Sayfa boyutu"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>{n}/sayfa</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => canPrev && setPage?.(page - 1)}
            disabled={!canPrev}
            style={{
              ...btnNeutralSm(T),
              opacity: canPrev ? 1 : 0.6,
              cursor: canPrev ? "pointer" : "not-allowed",
            }}
          >
            ←
          </button>
          <div style={{ fontWeight: 800, minWidth: 60, textAlign: "center" }}>
            {page} / {pageCount}
          </div>
          <button
            type="button"
            onClick={() => canNext && setPage?.(page + 1)}
            disabled={!canNext}
            style={{
              ...btnNeutralSm(T),
              opacity: canNext ? 1 : 0.6,
              cursor: canNext ? "pointer" : "not-allowed",
            }}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailsDrawer({ open, onClose, type, data, actions, T }) {
  const files =
    data?.documents || data?.documentUrls || data?.evidences || data?.attachments || [];

  const isApply = type === "apply";
  const isReport = type === "report";
  const isBusiness = type === "business";
  const isBlacklist = type === "blacklist";

  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

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
        {typeof v === "string" && /^https?:\/\//i.test(v) ? (
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
  const publicSlug =
    data?.slug || data?._id || data?.instagramUsername || data?.instagramUrl;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, pointerEvents: open ? "auto" : "none" }}>
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
              {publicSlug && (
                <div style={{ marginTop: 8, textAlign: "right" }}>
                  <a
                    href={`/isletme/${encodeURIComponent(publicSlug)}`}
                    target="_blank"
                    rel="noreferrer"
                    style={btnNeutralTiny(T)}
                  >
                    👁️ Halka açık profil
                  </a>
                </div>
              )}

              {/* Galeri (max 5) */}
              <div style={{ marginTop: 16, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <b>Galeri (max 5)</b>
                  <input type="file" accept="image/*" multiple onChange={(e) => actions.uploadGallery(data._id, e.target.files)} />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {gallery.length === 0 && <div style={{ opacity: 0.7 }}>Görsel yok.</div>}
                  {gallery.map((u, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      {/* eslint-disable-next-line */}
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
                      <div style={{ position: "absolute", right: 4, bottom: 4, display: "flex", gap: 6 }}>
                        <a href={u} target="_blank" rel="noreferrer" style={btnNeutralTiny(T)}>
                          Aç
                        </a>
                        <button type="button" onClick={() => actions.removeGalleryItem(data._id, i)} style={btnDeleteSm(T)}>
                          Sil
                        </button>
                      </div>
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
              <div style={{ margin: "14px 0 8px", fontWeight: 900 }}>Ekler / Kanıtlar</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
                {files.map((f, i) => {
                  const url = f?.url || f;
                  const name = f?.name || (typeof f === "string" ? f.split("/").pop() : "");
                  const mime = f?.mime || "";
                  const isPDF = (mime || name).toLowerCase().includes("pdf") || name.toLowerCase().endsWith(".pdf");
                  return (
                    <div key={i} style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                      <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
                        {isPDF ? (
                          <div style={{ fontSize: 30 }}>📄</div>
                        ) : (
                          // eslint-disable-next-line
                          <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: f.blur ? "blur(6px)" : "none" }} />
                        )}
                      </div>
                      <div style={{ padding: 8, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {name || "dosya"}
                        </span>
                        <a href={url} target="_blank" rel="noreferrer" style={btnNeutralTiny(T)}>
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
              <button type="button" onClick={() => actions.approve(data._id)} style={btnGreenSm(T)}>✅ Onayla</button>
              <button type="button" onClick={() => actions.reject(data._id)} style={btnDeleteSm(T)}>❌ Reddet</button>
            </>
          )}
          {isReport && data?._id && (
            <>
              <button type="button" onClick={() => actions.reportApprove(data._id)} style={btnGreenSm(T)}>✅ Onayla</button>
              <button type="button" onClick={() => actions.reportReject(data._id)} style={btnDeleteSm(T)}>❌ Reddet</button>
              <button type="button" onClick={() => actions.reportDelete(data._id)} style={btnDeleteSm(T)}>🗑️ Sil</button>
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