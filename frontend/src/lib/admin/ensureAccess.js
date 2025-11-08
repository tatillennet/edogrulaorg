
// src/lib/admin/ensureAccess.js
import { api } from "@/api/axios-boot";

/**
 * Sunucudan /auth/me bilgisine göre admin olup olmadığını döndürür.
 * Başarısız olursa false döner.
 */
export async function ensureAccess() {
  try {
    const { data } = await api.get("/auth/me");
    const email = (data?.user?.email || data?.email || "").toLowerCase();
    const role  = (data?.user?.role  || data?.role  || "").toLowerCase();
    return email === "admin@edogrula.org" || role === "admin";
  } catch {
    return false;
  }
}
