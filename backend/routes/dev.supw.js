// backend/routes/dev.supw.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import { devOnly, supwLimiter } from "../middleware/devOnly.js";


const router = Router();


// Yalnızca development + local + x-admin-dev-key ile erişim
router.post("/issue-token", supwLimiter, devOnly, (req, res) => {
try {
const payload = {
email: "dev@localhost",
role: "admin", // mevcut RBAC mantığınla uyumlu olmalı
sub: "dev-admin",
};
const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "10m" });


// (Opsiyonel) Logla fakat secret'ları asla loglama
console.warn("[SUPW] Temporary admin token issued for local dev (10m)");


return res.json({ token, expiresIn: 600 });
} catch (err) {
console.error("[SUPW] issue-token error:", err);
return res.status(500).json({ error: "Failed to issue token" });
}
});


export default router;