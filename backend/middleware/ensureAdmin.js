// backend/middleware/ensureAdmin.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

/**
 * Authorization kontrolü:
 * - Bearer <ADMIN_KEY>  veya  header "x-admin-key: <ADMIN_KEY>"
 * - Bearer <JWT>  (role === "admin")
 */
export default function ensureAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const adminKey = (process.env.ADMIN_KEY || "").trim();

  // 1) Admin Key ile bypass
  if (
    adminKey &&
    (bearer === adminKey || req.headers["x-admin-key"] === adminKey)
  ) {
    req.isAdmin = true;
    req.admin = { method: "key" };
    return next();
  }

  // 2) JWT ile admin
  if (bearer) {
    try {
      const payload = jwt.verify(bearer, JWT_SECRET);
      if (payload?.role === "admin") {
        req.isAdmin = true;
        req.admin = { id: payload.id, email: payload.email, method: "jwt" };
        return next();
      }
    } catch (e) {
      // geçersiz token
    }
  }

  return res.status(401).json({ success: false, message: "Yetkisiz (admin gerekli)" });
}
