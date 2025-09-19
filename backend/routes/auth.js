import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import User from "../models/User.js";
import VerificationCode from "../models/VerificationCode.js";

const router = express.Router();

/* ------------------------------
   📩 Kod Gönder (E-posta doğrulama)
------------------------------- */
router.post("/send-code", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "E-posta gerekli" });
    }

    const code = crypto.randomInt(100000, 999999).toString();

    // DB’ye kaydet (TTL ile 5 dk geçerli)
    await VerificationCode.create({ email, code });

    // Gmail SMTP ile mail gönderici
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST, // smtp.gmail.com
      port: process.env.MAIL_PORT, // 465
      secure: true, // 465 → SSL
      auth: {
        user: process.env.MAIL_USER, // tatillennet@gmail.com
        pass: process.env.MAIL_PASS, // uygulama şifresi
      },
    });

    // ✅ Transporter test (bağlantı sorunu olmasın diye)
    await transporter.verify();

    await transporter.sendMail({
      from: `"E-Doğrula" <${process.env.MAIL_USER}>`,
      to: email,
      subject: "E-Doğrula - E-posta Doğrulama Kodunuz",
      html: `
        <p>Merhaba,</p>
        <p>E-Doğrula e-posta doğrulama kodunuz:</p>
        <h2 style="color:#FB415C">${code}</h2>
        <p>Bu kod 5 dakika boyunca geçerlidir.</p>
      `,
    });

    res.json({ success: true, message: "Kod e-posta adresinize gönderildi" });
  } catch (err) {
    console.error("❌ Send Code Error:", err.message);
    res.status(500).json({ success: false, message: "Kod gönderilemedi" });
  }
});

/* ------------------------------
   ✅ Kod Doğrula
------------------------------- */
router.post("/verify-code", async (req, res) => {
  try {
    const { email, code } = req.body;
    const record = await VerificationCode.findOne({ email, code });

    if (!record) {
      return res
        .status(400)
        .json({ success: false, message: "Kod geçersiz veya süresi dolmuş" });
    }

    // Kod doğrulandı → temizle
    await VerificationCode.deleteMany({ email });

    res.json({ success: true, message: "E-posta doğrulandı" });
  } catch (err) {
    console.error("❌ Verify Code Error:", err.message);
    res.status(500).json({ success: false, message: "Doğrulama hatası" });
  }
});

/* ------------------------------
   🔑 Admin & User Login
------------------------------- */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1) ENV Admin kontrolü
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const token = jwt.sign({ email, role: "admin" }, process.env.JWT_SECRET, {
        expiresIn: "1d",
      });
      return res.json({
        success: true,
        message: "ENV Admin girişi başarılı",
        token,
      });
    }

    // 2) MongoDB üzerinden kullanıcı kontrolü
    const user = await User.findOne({ email: new RegExp(`^${email}$`, "i") });
    if (!user) {
      return res.status(401).json({ success: false, message: "Kullanıcı bulunamadı" });
    }

    // Şifre kontrolü
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Geçersiz şifre" });
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
