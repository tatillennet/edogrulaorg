
// src/pages/admin/Dashboard.jsx
import React from "react";
import { NavLink, Outlet } from "react-router-dom";

const nav = [
  { to: "/admin/businesses", label: "📋 İşletmeler" },
  { to: "/admin/applications", label: "📝 Başvurular" },
  { to: "/admin/archive", label: "📂 Arşiv" },
  { to: "/admin/reports", label: "⚠️ İhbarlar" },
  { to: "/admin/blacklist", label: "⛔ Blacklist" },
  { to: "/admin/featured", label: "⭐ Öne Çıkanlar" },
];

export default function Dashboard() {
  return (
    <div style={{padding:18, fontFamily:"Inter, Segoe UI, system-ui, sans-serif"}}>
      <div style={{display:"flex", gap:12, flexWrap:"wrap", marginBottom:14}}>
        {nav.map((n)=>(
          <NavLink
            key={n.to}
            to={n.to}
            style={({isActive})=>({
              padding:"8px 12px",
              borderRadius:10,
              border:`1px solid ${isActive ? "#111827" : "#e5e7eb"}`,
              background:isActive?"#111827":"#fff",
              color:isActive?"#fff":"#111827",
              fontWeight:800,
              textDecoration:"none"
            })}
          >
            {n.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
