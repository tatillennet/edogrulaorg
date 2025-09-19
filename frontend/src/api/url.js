// frontend/src/api/url.js
export function pathFromRoot(...parts) {
  // "/uploads/apply/<id>/01.jpg" gibi KÖKTEN tek slash ile başlatır
  const joined = parts
    .map(p => String(p || "").replace(/^\/+|\/+$/g, "")) // kenar slashlarını temizle
    .filter(Boolean)
    .join("/");
  return "/" + joined;
}
