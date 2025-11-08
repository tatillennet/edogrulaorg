// backend/middleware/devOnly.js
import rateLimit from "express-rate-limit";


export const supwLimiter = rateLimit({
windowMs: 60 * 1000,
limit: 10, // dakikada 10 istek
standardHeaders: true,
legacyHeaders: false,
});


export function devOnly(req, res, next) {
// Production'da tamamen kapat
if (process.env.NODE_ENV !== "development") {
return res.status(403).json({ error: "Disabled in production" });
}


// Sadece local IP'lerden izin ver (IPv4 & IPv6 loopback)
const rawIp = (req.ip || "").replace("::ffff:", "");
const localIps = new Set(["127.0.0.1", "::1"]); // express'de trust proxy kapalıyken yeterli
if (!localIps.has(rawIp)) {
return res.status(403).json({ error: "Local only" });
}


// Güçlü bir header anahtarı iste
const key = req.get("x-admin-dev-key");
if (!key || key !== process.env.ADMIN_DEV_KEY) {
return res.status(401).json({ error: "Missing/invalid dev key" });
}


return next();
}