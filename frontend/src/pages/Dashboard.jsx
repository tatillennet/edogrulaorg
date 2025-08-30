import React, { useState, useEffect } from "react";
import axios from "axios";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("businesses");
  const [businesses, setBusinesses] = useState([]);
  const [pending, setPending] = useState([]);
  const [archived, setArchived] = useState([]);
  const [reports, setReports] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [form, setForm] = useState({
    name: "",
    type: "",
    instagramUsername: "",
    instagramUrl: "",
    phone: "",
    address: ""
  });
  const [editId, setEditId] = useState(null);

  const token = localStorage.getItem("token");

  /* ----------------------------
     API Çekme
  ---------------------------- */
  const fetchBusinesses = async () => {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/businesses`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setBusinesses(res.data.businesses || []); // ✅ array çek
  };

  const fetchRequests = async () => {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/apply`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setPending(res.data.pending || []);
    setArchived([...(res.data.approved || []), ...(res.data.rejected || [])]);
  };

  const fetchReports = async () => {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/report`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setReports(res.data.reports || []); // ✅ array çek
  };

  const fetchBlacklist = async () => {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/report/blacklist/all`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setBlacklist(res.data.blacklist || []); // ✅ array çek
  };

  useEffect(() => {
    fetchBusinesses();
    fetchRequests();
    fetchReports();
    fetchBlacklist();
  }, []);

  /* ----------------------------
     İşletme Ekle/Güncelle
  ---------------------------- */
  const handleSave = async () => {
    if (editId) {
      await axios.put(`${import.meta.env.VITE_API_URL}/api/businesses/${editId}`, form, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEditId(null);
    } else {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/businesses`, form, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
    setForm({ name: "", type: "", instagramUsername: "", instagramUrl: "", phone: "", address: "" });
    fetchBusinesses();
  };

  const handleEdit = (b) => {
    setForm({
      name: b.name,
      type: b.type,
      instagramUsername: b.instagramUsername,
      instagramUrl: b.instagramUrl,
      phone: b.phone,
      address: b.address,
    });
    setEditId(b._id);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Bu işletmeyi silmek istediğinizden emin misiniz?")) return;
    await axios.delete(`${import.meta.env.VITE_API_URL}/api/businesses/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchBusinesses();
  };

  /* ----------------------------
     Başvurular Onay/Reddet
  ---------------------------- */
  const handleApprove = async (id) => {
    await axios.post(`${import.meta.env.VITE_API_URL}/api/apply/${id}/approve`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchBusinesses();
    fetchRequests();
  };

  const handleReject = async (id) => {
    await axios.post(`${import.meta.env.VITE_API_URL}/api/apply/${id}/reject`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchRequests();
  };

  /* ----------------------------
     Dolandırıcılık İhbarları
  ---------------------------- */
  const handleReportApprove = async (id) => {
    await axios.post(`${import.meta.env.VITE_API_URL}/api/report/${id}/approve`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchReports();
    fetchBlacklist();
  };

  const handleReportReject = async (id) => {
    await axios.post(`${import.meta.env.VITE_API_URL}/api/report/${id}/reject`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchReports();
  };

  const handleReportDelete = async (id) => {
    if (!window.confirm("Bu ihbarı silmek istediğinizden emin misiniz?")) return;
    await axios.delete(`${import.meta.env.VITE_API_URL}/api/report/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchReports();
  };

  /* ----------------------------
     Blacklist İşlemleri
  ---------------------------- */
  const handleBlacklistEdit = async (b) => {
    const newName = prompt("Yeni Ad:", b.name);
    if (!newName) return;
    await axios.put(`${import.meta.env.VITE_API_URL}/api/report/blacklist/${b._id}`, { ...b, name: newName }, {
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchBlacklist();
  };

  const handleBlacklistDelete = async (id) => {
    if (!window.confirm("Bu işletmeyi kara listeden silmek istediğinizden emin misiniz?")) return;
    await axios.delete(`${import.meta.env.VITE_API_URL}/api/report/blacklist/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchBlacklist();
  };

  return (
    <div style={{ padding: "30px", fontFamily: "Segoe UI, sans-serif" }}>
      {/* TAB BUTTONS */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <TabButton label="📋 İşletmeler" tab="businesses" activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton label="📝 Başvurular" tab="requests" activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton label="📂 Arşiv" tab="archived" activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton label="⚠️ Dolandırıcılık İhbarları" tab="reports" activeTab={activeTab} setActiveTab={setActiveTab} />
        <TabButton label="⛔ Blacklist" tab="blacklist" activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>

      {/* İşletmeler */}
      {activeTab === "businesses" && (
        <Section title="📋 İşletmeler">
          {editId && <p style={{ color: "#e67e22", fontWeight: "bold" }}>✏️ Düzenleme Modu</p>}
          <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            <input placeholder="İşletme Adı" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Tür" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
            <input placeholder="Instagram Kullanıcı Adı" value={form.instagramUsername} onChange={(e) => setForm({ ...form, instagramUsername: e.target.value })} />
            <input placeholder="Instagram Profil URL" value={form.instagramUrl} onChange={(e) => setForm({ ...form, instagramUrl: e.target.value })} />
            <input placeholder="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input placeholder="Adres" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <button className="btn-green" style={btnGreen} onClick={handleSave}>
            {editId ? "✏️ Güncelle" : "+ İşletme Ekle"}
          </button>

          <DataTable
            headers={["Ad", "Tür", "Telefon", "Instagram Kullanıcı Adı", "Instagram URL", "Adres", "İşlem"]}
            rows={businesses.map(b => [
              b.name,
              b.type,
              b.phone,
              b.instagramUsername || "-",
              b.instagramUrl ? <a href={b.instagramUrl} target="_blank" rel="noreferrer">{b.instagramUrl}</a> : "-",
              b.address,
              <>
                <button onClick={() => handleEdit(b)} style={btnEdit}>✏️ Düzenle</button>
                <button onClick={() => handleDelete(b._id)} style={btnDelete}>🗑️ Sil</button>
              </>
            ])}
          />
        </Section>
      )}

      {/* Bekleyen Başvurular */}
      {activeTab === "requests" && (
        <Section title="📝 Bekleyen Başvurular">
          <DataTable
            headers={["Ad", "Tür", "Instagram Kullanıcı Adı", "Instagram URL", "Telefon", "Adres", "E-posta", "Durum", "İşlem"]}
            rows={pending.map(r => [
              r.name,
              r.type || "-",
              r.instagramUsername,
              <a href={r.instagramUrl} target="_blank" rel="noreferrer">{r.instagramUrl}</a>,
              r.phone,
              r.address,
              r.email,
              r.status || "Beklemede",
              <>
                <button onClick={() => handleApprove(r._id)} style={btnGreenSmall}>✅ Onayla</button>
                <button onClick={() => handleReject(r._id)} style={btnDeleteSmall}>❌ Reddet</button>
              </>
            ])}
          />
        </Section>
      )}

      {/* Arşivlenmiş Başvurular */}
      {activeTab === "archived" && (
        <Section title="📂 Arşivlenmiş Başvurular">
          <DataTable
            headers={["Ad", "Tür", "Instagram Kullanıcı Adı", "Instagram URL", "Telefon", "Adres", "E-posta", "Durum"]}
            rows={archived.map(r => [
              r.name,
              r.type || "-",
              r.instagramUsername,
              <a href={r.instagramUrl} target="_blank" rel="noreferrer">{r.instagramUrl}</a>,
              r.phone,
              r.address,
              r.email,
              r.status
            ])}
          />
        </Section>
      )}

      {/* Dolandırıcılık İhbarları */}
      {activeTab === "reports" && (
        <Section title="⚠️ Dolandırıcılık İhbarları">
          <DataTable
            headers={["İşletme Adı", "Instagram Kullanıcı Adı", "Instagram URL", "Telefon", "Açıklama", "İşlem"]}
            rows={reports.map(rep => [
              rep.name,
              rep.instagramUsername,
              <a href={rep.instagramUrl} target="_blank" rel="noreferrer">{rep.instagramUrl}</a>,
              rep.phone,
              rep.desc,
              <>
                <button onClick={() => handleReportApprove(rep._id)} style={btnGreenSmall}>✅ Onayla</button>
                <button onClick={() => handleReportReject(rep._id)} style={btnDeleteSmall}>❌ Reddet</button>
                <button onClick={() => handleReportDelete(rep._id)} style={btnDelete}>🗑️ Sil</button>
              </>
            ])}
          />
        </Section>
      )}

      {/* Blacklist */}
      {activeTab === "blacklist" && (
        <Section title="⛔ Blacklist (Onaylanan İhbarlar)">
          <DataTable
            headers={["Ad", "Instagram Kullanıcı Adı", "Instagram URL", "Telefon", "Açıklama", "İşlem"]}
            rows={blacklist.map(b => [
              b.name,
              b.instagramUsername,
              <a href={b.instagramUrl} target="_blank" rel="noreferrer">{b.instagramUrl}</a>,
              b.phone,
              b.desc,
              <>
                <button onClick={() => handleBlacklistEdit(b)} style={btnEdit}>✏️ Düzenle</button>
                <button onClick={() => handleBlacklistDelete(b._id)} style={btnDelete}>🗑️ Sil</button>
              </>
            ])}
          />
        </Section>
      )}
    </div>
  );
}

/* -------------------- Helper Components -------------------- */
function TabButton({ label, tab, activeTab, setActiveTab }) {
  return (
    <button
      onClick={() => setActiveTab(tab)}
      style={{
        padding: "10px 20px",
        borderRadius: "6px",
        border: "none",
        cursor: "pointer",
        background: activeTab === tab ? "#2980b9" : "#ecf0f1",
        color: activeTab === tab ? "#fff" : "#2c3e50",
        fontWeight: "600"
      }}
    >
      {label}
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "40px" }}>
      <h2 style={{ marginBottom: "15px", color: "#2c3e50" }}>{title}</h2>
      <div style={{ background: "#fff", padding: "20px", borderRadius: "10px", boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}>
        {children}
      </div>
    </div>
  );
}

function DataTable({ headers, rows }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "15px" }}>
      <thead style={{ background: "#2980b9", color: "#fff" }}>
        <tr>
          {headers.map((h, i) => (
            <th key={i} style={{ padding: "10px", textAlign: "center" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={headers.length} style={{ padding: "15px", textAlign: "center", color: "#888" }}>
              Veri bulunamadı
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <tr key={i} style={{ textAlign: "center", borderBottom: "1px solid #eee" }}>
              {row.map((col, j) => (
                <td key={j} style={{ padding: "8px" }}>{col}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

/* -------------------- Buton Stilleri --------------------- */
const btnGreen = {
  marginTop: "10px",
  padding: "12px 20px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#27ae60",
  color: "#fff",
  fontSize: "15px",
  fontWeight: "600",
  cursor: "pointer"
};

const btnEdit = {
  margin: "0 5px",
  padding: "6px 12px",
  borderRadius: "6px",
  border: "none",
  backgroundColor: "#f39c12",
  color: "#fff",
  fontSize: "14px",
  fontWeight: "600",
  cursor: "pointer"
};

const btnDelete = {
  margin: "0 5px",
  padding: "6px 12px",
  borderRadius: "6px",
  border: "none",
  backgroundColor: "#c0392b",
  color: "#fff",
  fontSize: "14px",
  fontWeight: "600",
  cursor: "pointer"
};

const btnGreenSmall = {
  margin: "0 3px",
  padding: "5px 10px",
  borderRadius: "5px",
  border: "none",
  backgroundColor: "#27ae60",
  color: "#fff",
  fontSize: "13px",
  fontWeight: "600",
  cursor: "pointer"
};

const btnDeleteSmall = {
  margin: "0 3px",
  padding: "5px 10px",
  borderRadius: "5px",
  border: "none",
  backgroundColor: "#e74c3c",
  color: "#fff",
  fontSize: "13px",
  fontWeight: "600",
  cursor: "pointer"
};
