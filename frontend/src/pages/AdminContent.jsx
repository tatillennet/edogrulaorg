// frontend/src/components/AdminContent.jsx (veya bulunduğu dosya)
import React, { useEffect, useState } from "react";
import { api } from "../api/axios-boot"; // axios-boot içindeki paylaşılan instance

export default function AdminContent() {
  const [tab, setTab] = useState("articles"); // "articles" | "pages"
  return (
    <div style={{ maxWidth: 1100, margin: "24px auto", padding: "0 16px" }}>
      <h1>İçerik Yönetimi</h1>
      <div style={{ display: "flex", gap: 8, margin: "12px 0 16px" }}>
        <button onClick={() => setTab("articles")} className={tab==="articles"?"btn-primary":"btn"}>Makaleler</button>
        <button onClick={() => setTab("pages")} className={tab==="pages"?"btn-primary":"btn"}>Sayfalar</button>
      </div>
      {tab === "articles" ? <ArticlesAdmin /> : <PagesAdmin />}
      <style>{`
        .btn{border:1px solid #e5e7eb;padding:8px 12px;border-radius:8px;background:#fff;cursor:pointer}
        .btn-primary{border-color:#2563eb;background:#2563eb;color:#fff}
        input,textarea,select{width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:8px}
        label{font-weight:700;margin-top:8px;display:block}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left}
      `}</style>
    </div>
  );
}

function ArticlesAdmin() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const blank = { title:"", slug:"", excerpt:"", content:"", coverImage:"", place:"Sapanca", tags:"", pinned:false, status:"published", order:0, seoTitle:"", seoDescription:"" };
  const [form, setForm] = useState(blank);

  async function load() {
    try {
      const { data } = await api.get("/cms/articles");
      setItems(data.items || []);
    } catch (e) {
      console.error("Articles load error:", e);
      alert("Makaleler yüklenemedi.");
    }
  }
  useEffect(() => { load(); }, []);

  async function save(e){
    e.preventDefault();
    try {
      const payload = { ...form, tags: String(form.tags||"").split(",").map(s=>s.trim()).filter(Boolean) };
      if (editing) await api.put(`/cms/articles/${editing._id}`, payload);
      else await api.post(`/cms/articles`, payload);
      setForm(blank); setEditing(null); await load();
    } catch (e) {
      console.error("Save article error:", e);
      alert("Kaydetme sırasında hata oluştu.");
    }
  }
  async function del(id){
    if (!confirm("Silinsin mi?")) return;
    try {
      await api.delete(`/cms/articles/${id}`);
      await load();
    } catch (e) {
      console.error("Delete article error:", e);
      alert("Silme sırasında hata oluştu.");
    }
  }

  return (
    <>
      <form onSubmit={save}>
        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:12 }}>
          <div>
            <label>Başlık</label>
            <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
            <label>Slug</label>
            <input placeholder="otomatik üretilecek" value={form.slug} onChange={e=>setForm({...form,slug:e.target.value})}/>
            <label>Özet (excerpt)</label>
            <input value={form.excerpt} onChange={e=>setForm({...form,excerpt:e.target.value})}/>
            <label>İçerik (HTML/Markdown)</label>
            <textarea rows={8} value={form.content} onChange={e=>setForm({...form,content:e.target.value})}/>
          </div>
          <div>
            <label>Kapak Görseli URL</label>
            <input value={form.coverImage} onChange={e=>setForm({...form,coverImage:e.target.value})}/>
            <label>Yer (place)</label>
            <input value={form.place} onChange={e=>setForm({...form,place:e.target.value})}/>
            <label>Etiketler (virgül ile)</label>
            <input value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})}/>
            <label>Durum</label>
            <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
              <option value="published">published</option>
              <option value="draft">draft</option>
            </select>
            <label>Sıra (order)</label>
            <input type="number" value={form.order} onChange={e=>setForm({...form,order:+e.target.value})}/>
            <label><input type="checkbox" checked={form.pinned} onChange={e=>setForm({...form,pinned:e.target.checked})}/> Planlayın’da Göster</label>
            <label>SEO Title</label>
            <input value={form.seoTitle} onChange={e=>setForm({...form,seoTitle:e.target.value})}/>
            <label>SEO Description</label>
            <textarea rows={3} value={form.seoDescription} onChange={e=>setForm({...form,seoDescription:e.target.value})}/>
            <div style={{display:"flex", gap:8, marginTop:10}}>
              <button className="btn-primary" type="submit">{editing?"Güncelle":"Oluştur"}</button>
              {editing && <button className="btn" type="button" onClick={()=>{setEditing(null);setForm(blank);}}>Vazgeç</button>}
            </div>
          </div>
        </div>
      </form>

      <table>
        <thead><tr><th>Başlık</th><th>Yer</th><th>Pinned</th><th>Durum</th><th></th></tr></thead>
        <tbody>
          {items.map(it=>(
            <tr key={it._id}>
              <td>{it.title}</td>
              <td>{it.place}</td>
              <td>{it.pinned ? "✓" : "—"}</td>
              <td>{it.status}</td>
              <td style={{whiteSpace:"nowrap"}}>
                <button className="btn" onClick={()=>{setEditing(it); setForm({
                  ...blank, ...it, tags:(it.tags||[]).join(", ")
                });}}>Düzenle</button>
                <button className="btn" onClick={()=>del(it._id)}>Sil</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function PagesAdmin() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const blank = { title:"", slug:"", content:"", status:"published", order:0, seoTitle:"", seoDescription:"", coverImage:"" };
  const [form, setForm] = useState(blank);

  async function load(){
    try {
      const {data}=await api.get("/cms/pages");
      setItems(data.items||[]);
    } catch (e) {
      console.error("Pages load error:", e);
      alert("Sayfalar yüklenemedi.");
    }
  }
  useEffect(()=>{ load(); }, []);

  async function save(e){
    e.preventDefault();
    try {
      if (editing) await api.put(`/cms/pages/${editing._id}`, form);
      else await api.post(`/cms/pages`, form);
      setEditing(null); setForm(blank); await load();
    } catch (e) {
      console.error("Save page error:", e);
      alert("Kaydetme sırasında hata oluştu.");
    }
  }
  async function del(id){
    if (!confirm("Silinsin mi?")) return;
    try {
      await api.delete(`/cms/pages/${id}`);
      await load();
    } catch (e) {
      console.error("Delete page error:", e);
      alert("Silme sırasında hata oluştu.");
    }
  }

  return (
    <>
      <form onSubmit={save} style={{marginBottom:12}}>
        <label>Başlık</label>
        <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
        <label>Slug</label>
        <input placeholder="kvkk, gizlilik, hakkimizda..." value={form.slug} onChange={e=>setForm({...form,slug:e.target.value})}/>
        <label>İçerik (HTML/Markdown)</label>
        <textarea rows={10} value={form.content} onChange={e=>setForm({...form,content:e.target.value})}/>
        <label>Kapak Görseli</label>
        <input value={form.coverImage} onChange={e=>setForm({...form,coverImage:e.target.value})}/>
        <label>Durum</label>
        <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
          <option value="published">published</option>
          <option value="draft">draft</option>
        </select>
        <label>Sıra</label>
        <input type="number" value={form.order} onChange={e=>setForm({...form,order:+e.target.value})}/>
        <label>SEO Title</label>
        <input value={form.seoTitle} onChange={e=>setForm({...form,seoTitle:e.target.value})}/>
        <label>SEO Description</label>
        <textarea rows={3} value={form.seoDescription} onChange={e=>setForm({...form,seoDescription:e.target.value})}/>
        <div style={{display:"flex", gap:8, marginTop:10}}>
          <button className="btn-primary" type="submit">{editing?"Güncelle":"Oluştur"}</button>
          {editing && <button className="btn" type="button" onClick={()=>{setEditing(null);setForm(blank);}}>Vazgeç</button>}
        </div>
      </form>

      <table>
        <thead><tr><th>Başlık</th><th>Slug</th><th>Durum</th><th></th></tr></thead>
        <tbody>
          {items.map(it=>(
            <tr key={it._id}>
              <td>{it.title}</td>
              <td>{it.slug}</td>
              <td>{it.status}</td>
              <td style={{whiteSpace:"nowrap"}}>
                <button className="btn" onClick={()=>{setEditing(it); setForm({...blank, ...it});}}>Düzenle</button>
                <button className="btn" onClick={()=>del(it._id)}>Sil</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
