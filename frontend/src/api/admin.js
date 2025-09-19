// frontend/src/api/admin.js
import axios from "axios";

const API = import.meta.env.VITE_API_URL;
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("adminToken") || ""}` } });

// -------- Businesses
export async function listBusinesses({ q = "", page = 1, limit = 20 } = {}) {
  const { data } = await axios.get(`${API}/api/admin/businesses`, {
    ...auth(),
    params: { q, page, limit },
  });
  return data; // {success, items, total, page, pages}
}

export async function createBusiness(payload) {
  const { data } = await axios.post(`${API}/api/admin/businesses`, payload, auth());
  return data.business;
}

export async function getBusiness(id) {
  const { data } = await axios.get(`${API}/api/admin/businesses/${id}`, auth());
  return data.business;
}

export async function updateBusiness(id, payload) {
  const { data } = await axios.put(`${API}/api/admin/businesses/${id}`, payload, auth());
  return data.business;
}

export async function uploadGallery(id, files /* FileList */) {
  const fd = new FormData();
  Array.from(files).forEach(f => fd.append("images", f));
  const { data } = await axios.post(`${API}/api/admin/businesses/${id}/gallery`, fd, {
    ...auth(),
    headers: { "Content-Type": "multipart/form-data", Authorization: auth().headers.Authorization },
  });
  return data.gallery; // [] (max 5)
}

export async function removeGalleryItem(id, index) {
  const { data } = await axios.delete(`${API}/api/admin/businesses/${id}/gallery/${index}`, auth());
  return data.gallery;
}

// -------- Requests
export async function listRequests(status = "pending") {
  const { data } = await axios.get(`${API}/api/admin/requests`, { ...auth(), params: { status } });
  return data.items;
}

export async function approveRequest(id) {
  await axios.post(`${API}/api/admin/requests/${id}/approve`, {}, auth());
}

export async function rejectRequest(id) {
  await axios.post(`${API}/api/admin/requests/${id}/reject`, {}, auth());
}
