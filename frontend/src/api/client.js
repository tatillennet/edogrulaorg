// src/api/client.js
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "https://api.edogrula.org/api",
  withCredentials: true, // 🍪 httpOnly cookie kullanıyorsan ŞART
});

// (JWT yerel storage'daysa — cookie değilse — header'a koy)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token"); // kullanmıyorsan bunu bırak
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
