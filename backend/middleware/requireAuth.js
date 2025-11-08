// backend/middlewares/requireAuth.js
import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const raw = req.get("authorization") || "";
  const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Missing token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // payload.email olması önemli
    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
}
