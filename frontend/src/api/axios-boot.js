// src/api/axios-boot.js
import axios from "axios";
import { API_ROOT, apiPath } from "./base.js";

function attachInterceptors(instance) {
  instance.defaults.withCredentials = true;

  instance.interceptors.request.use((cfg) => {
    const u = typeof cfg.url === "string" ? cfg.url : "";

    // Mutlak URL ise baseURL kullanma
    if (/^https?:\/\//i.test(u)) {
      cfg.baseURL = "";
      return cfg;
    }

    // URL'i mutlak hale getir ve base'i sıfırla → çift /api olmaz
    cfg.url = apiPath(u);   // örn: http://localhost:5000/api/admin/businesses
    cfg.baseURL = "";       // ÖNEMLİ: axios tekrar birleştirmesin
    return cfg;
  });
}

// default axios + tüm create() instance’ları
attachInterceptors(axios);
const _create = axios.create.bind(axios);
axios.create = function patchedCreate(config) {
  const inst = _create(config);
  attachInterceptors(inst);
  return inst;
};

if (typeof window !== "undefined") {
  console.log("[axios-boot] API_ROOT =", API_ROOT);
}
export {};
