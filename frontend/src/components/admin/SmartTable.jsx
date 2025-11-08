
// src/components/admin/SmartTable.jsx
import React from "react";

export default function SmartTable({ columns, rows, loading }) {
  return (
    <div style={{border:"1px solid #e5e7eb", borderRadius:12, background:"#fff", overflow:"hidden"}}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%", borderCollapse:"collapse"}}>
          <thead style={{background:"#f8fafc"}}>
            <tr>
              {columns.map((c,i)=>(
                <th key={i} style={{textAlign:"left", padding:"10px 12px", borderBottom:"1px solid #e5e7eb", whiteSpace:"nowrap"}}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} style={{padding:16}}>Yükleniyor…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columns.length} style={{padding:16, color:"#6b7280"}}>Veri bulunamadı</td></tr>
            ) : rows.map((r,ri)=>(
              <tr key={ri} style={{borderBottom:"1px solid #f3f4f6"}}>
                {columns.map((c,ci)=>{
                  const v = typeof c.accessor === "function" ? c.accessor(r) : r[c.accessor];
                  return <td key={ci} style={{padding:"10px 12px", whiteSpace: c.flex ? "normal":"nowrap"}}>{v ?? "-"}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
