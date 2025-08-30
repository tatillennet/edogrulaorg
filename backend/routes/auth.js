import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

/**
 * Admin Login Route
 * POST /api/auth/login
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // Ortam değişkenlerinde tanımlı admin hesabı ile eşleşiyor mu?
  if (
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    // ✅ Artık role: "admin" ekleniyor
    const token = jwt.sign(
      { email, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({
      success: true,
      message: "Admin girişi başarılı",
      token,
    });
  }

  // ❌ Yanlış giriş
  return res.status(401).json({
    success: false,
    message: "Geçersiz e-posta veya şifre",
  });
});

export default router;
