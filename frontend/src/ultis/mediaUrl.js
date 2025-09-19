// src/utils/mediaUrl.js
export function mediaUrl(p, ctx = {}) {
  if (!p) return "";

  let s = String(p).trim();

  // Tam URL ise bırak
  if (/^https?:\/\//i.test(s)) return s;

  // Zaten kökten başlıyorsa bırak (/uploads/... veya /foo/bar.jpg)
  if (s.startsWith("/")) return s.replace(/\/{2,}/g, "/");

  // "//uploads/..." gibi hatalı yazımlar → "/uploads/..."
  if (/^\/\/uploads\//i.test(s)) s = s.replace(/^\/\//, "/");

  // Salt dosya adı ise (01.jpg) veya "images/01.jpg" ise
  // uygun kök klasörü kur:
  const base =
    ctx.dir
      ? ctx.dir                 // örn: "/uploads/apply/68cc.../"
      : ctx.applyId
        ? `/uploads/apply/${ctx.applyId}/`
        : "/uploads/";          // en azından /uploads/ kökü

  return (base + s).replace(/\/{2,}/g, "/");
}
