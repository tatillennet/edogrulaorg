// src/api/http.js
import axios from "axios";
import { API_ROOT, apiPath } from "./base";
export const http = axios.create({ baseURL: API_ROOT, withCredentials: true, timeout: 15000 });
http.interceptors.request.use((cfg) => {
  if (typeof cfg.url === "string") cfg.url = apiPath(cfg.url); // çifte /api'yi burada da kes
  return cfg;
});
