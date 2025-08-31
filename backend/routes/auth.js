import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/User.js"; // ✅ MongoDB User model

const router = express.Router();

/**
 * Admin & User Login
 * POST /api/auth/login
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1) Öncelik: ENV üzerinden admin kontrolü (yedek giriş)
    if (
      email === process.env.ADMIN_EMAIL &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const token = jwt.sign(
        { email, role: "admin" },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );
      return res.json({
        success: true,
        message: "ENV Admin girişi başarılı",
        token,
      });
    }

    // 2) MongoDB üzerinden kullanıcı kontrolü
    const user = await User.findOne({ email: new RegExp(`^${email}$`, "i") });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Kullanıcı bulunamadı",
      });
    }

    // Şifreyi bcrypt ile karşılaştır
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Geçersiz şifre",
      });
    }

    // Token üret
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      success: true,
      message: "Giriş başarılı",
      token,
      user: { id: user._id, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("❌ Login Error:", err.message);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

export default router;
