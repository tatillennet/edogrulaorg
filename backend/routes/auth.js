// backend/routes/auth.js
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

import User from "../models/User.js";
import VerificationCode from "../models/VerificationCode.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

/* ------------ Config ------------ */
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const isProd = process.env.NODE_ENV === "production";

/* ------------ Cookie opts ------------ */
const COOKIE_NAME = "token";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 gün
};

/* ------------ Helpers ------------ */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const genCode = () => String(Math.floor(100000 + Math.random() * 900000));
const signEmailVerifyToken = (email) =>
  jwt.sign({ sub: "email-verify", email }, JWT_SECRET, { expiresIn: "10m" }); // 10 dk

function buildTransporter() {
  const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_SECURE } = process.env;
  if (!MAIL_HOST || !MAIL_PORT || !MAIL_USER || !MAIL_PASS) return null;
  return nodemailer.createTransport({
    host: MAIL_HOST,
    port: Number(MAIL_PORT),
    secure: String(MAIL_SECURE || "").toLowerCase() === "true",
    auth: { user: MAIL_USER, pass: MAIL_PASS },
  });
}
const mailFrom = process.env.MAIL_FROM || "E-Doğrula <noreply@edogrula.org>";

/* =========================================
 * GET /api/auth/ping
 * =======================================*/
router.get("/ping", (_req, res) => {
  res.json({ ok: true, where: "auth" });
});

/* =========================================
 * (DEV ONLY) Mini debug uçları — işin bitince kaldırabilirsin
 * =======================================*/
router.get("/_dev/peek-code", async (req, res) => {
  if (isProd) return res.status(404).end();
  const email = String(req.query.email || "").toLowerCase().trim();
  const doc = await VerificationCode.findOne({ email })
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
    .lean();
  if (!doc) return res.json({ ok: false, found: false });
  res.json({
    ok: true,
    found: true,
    email: doc.email,
    hasCodeHash: !!doc.codeHash,
    hasCodePlain: !!doc.code,
    has_codeHash: !!doc._codeHash,
    has_codePlain: !!doc._code,
    expiresAt: doc.expiresAt,
    updatedAt: doc.updatedAt,
    attempts: doc.attempts,
  });
});

router.post("/_dev/test-verify", async (req, res) => {
  if (isProd) return res.status(404).end();
  const email = String(req.body?.email || "").toLowerCase().trim();
  const code = String(req.body?.code || "").trim();
  const doc = await VerificationCode.findOne({ email })
    .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
    .lean();
  if (!doc) return res.json({ ok: false, reason: "CODE_NOT_FOUND" });
  const expired = doc.expiresAt && new Date(doc.expiresAt) < new Date();
  let matches = false;
  if (doc.codeHash) matches = await bcrypt.compare(code, doc.codeHash);
  else if (doc._codeHash) matches = await bcrypt.compare(code, doc._codeHash);
  else if (doc.code) matches = String(doc.code) === code;
  else if (doc._code) matches = String(doc._code) === code;
  res.json({
    ok: true,
    expired,
    matches,
    hasCodeHash: !!doc.codeHash,
    hasCodePlain: !!doc.code,
    has_codeHash: !!doc._codeHash,
    has_codePlain: !!doc._code,
    updatedAt: doc.updatedAt,
  });
});

/* =========================================
 * POST /api/auth/send-code
 * Body: { email }
 * DEV:  ?force=1  → throttle bypass
 *       ?clean=1  → aynı e-posta için eski kayıtları sil
 * DEV cevabı: devCode içerir (prod'da içermez)
 * =======================================*/
router.post("/send-code", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Geçersiz e-posta" });
    }

    // DEV/test parametreleri
    const force =
      !isProd &&
      (String(req.query?.force || "").trim() === "1" || String(req.query?.f || "").trim() === "1");
    const clean = !isProd && String(req.query?.clean || "").trim() === "1";
    if (clean) await VerificationCode.deleteMany({ email });

    // 45 sn throttle (force değilse)
    if (!force) {
      const existing = await VerificationCode.findOne({ email })
        .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
        .lean();
      const updatedAt = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      if (updatedAt && Date.now() - updatedAt < 45 * 1000) {
        return res.status(429).json({ success: false, message: "TOO_SOON" });
      }
    }

    const code = genCode();
    const codeHash = await bcrypt.hash(code, 10);

    // Şemaya uyan alanları *ve* fallback alanları hazırla
    const payload = {
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 dk
      attempts: 0,
      // fallback alanlar (strict şemada da yazılabilsin)
      _codeHash: codeHash,
      ...(isProd ? {} : { _code: code }),
    };
    if (VerificationCode?.schema?.path?.("codeHash")) payload.codeHash = codeHash;
    if (VerificationCode?.schema?.path?.("code")) payload.code = code;

    // strict:false ile yaz → şemada olmasa bile _code/_codeHash kaydolur
    await VerificationCode.updateOne(
      { email },
      { $set: payload, $setOnInsert: { email }, $currentDate: { updatedAt: true } },
      { upsert: true, strict: false }
    );

    // Mail gönder (SMTP varsa). DEV'de yanıta devCode ekleyelim.
    const tx = buildTransporter();
    if (tx) {
      const html = `
        <div style="font-family:Arial,sans-serif;font-size:16px">
          <p>Merhaba,</p>
          <p>E-Doğrula doğrulama kodunuz:</p>
          <p style="font-size:24px;letter-spacing:3px"><b>${code}</b></p>
          <p>Bu kod <b>10 dakika</b> içinde geçerlidir.</p>
        </div>`;
      try {
        await tx.sendMail({ from: mailFrom, to: email, subject: "E-Doğrula — Doğrulama Kodunuz", html });
        const resp = { success: true, message: "Kod gönderildi" };
        if (!isProd) resp.devCode = code; // sadece dev ortamında göster
        return res.json(resp);
      } catch (mailErr) {
        // SMTP hatası: dev'de yine de devCode dön; prod'da hata ver
        if (!isProd) {
          console.warn("[auth][send-code] SMTP hata (dev'de devCode ile devam):", mailErr?.message);
          return res.json({ success: true, message: "Kod üretildi (DEV)", devCode: code });
        }
        return res.status(500).json({ success: false, message: "MAIL_SEND_FAILED" });
      }
    } else {
      // SMTP yok → DEV
      console.log(`[auth][DEV] send-code -> ${email} : ${code}`);
      return res.json({ success: true, message: "Kod üretildi (DEV)", devCode: code });
    }
  } catch (err) {
    next(err);
  }
});

/* =========================================
 * POST /api/auth/verify-code
 * Body: { email, code }
 * Returns: { success, emailVerifyToken, expiresIn }
 * Notlar:
 *  - En yeni kayıt alınır (updatedAt, createdAt, _id DESC)
 *  - Başarısızda attempts++ (tüm kayıtlar)
 *  - Başarıda ilgili e-postanın tüm kayıtları silinir
 * =======================================*/
router.post("/verify-code", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").trim();

    if (!emailRegex.test(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: "Geçersiz giriş" });
    }

    // En yeni kaydı al (lean → şemada olmayan alanlar da gelsin)
    const doc = await VerificationCode.findOne({ email })
      .sort({ updatedAt: -1, createdAt: -1, _id: -1 })
      .lean();
    if (!doc) return res.status(400).json({ success: false, message: "CODE_NOT_FOUND" });
    if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) {
      return res.status(400).json({ success: false, message: "CODE_EXPIRED" });
    }

    // Doğrulama sırası: codeHash → _codeHash → code → _code
    let ok = false;
    if (doc.codeHash) ok = await bcrypt.compare(code, doc.codeHash);
    else if (doc._codeHash) ok = await bcrypt.compare(code, doc._codeHash);
    else if (doc.code) ok = String(doc.code) === code;
    else if (doc._code) ok = String(doc._code) === code;

    if (!ok) {
      // attempts++ (email bazlı – birden çok kayıt varsa hepsi artsın)
      await VerificationCode.updateMany({ email }, { $inc: { attempts: 1 } }, { strict: false }).catch(() => {});
      return res.status(400).json({ success: false, message: "CODE_INVALID" });
    }

    // Başarılı → ilgili e-postaya ait tüm kayıtları temizle ve kısa token üret
    await VerificationCode.deleteMany({ email }).catch(() => {});
    const emailVerifyToken = signEmailVerifyToken(email);
    return res.json({ success: true, emailVerifyToken, expiresIn: 600 });
  } catch (err) {
    next(err);
  }
});

/* =========================================
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { success, token, user }
 * =======================================*/
router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "E-posta ve şifre zorunlu" });
    }

    const auth = await User.authenticate(email, password);

    if (auth && auth.lockedUntil) {
      return res.status(423).json({
        success: false,
        code: "LOCKED",
        message: "Hesap geçici olarak kilitlendi. Lütfen daha sonra tekrar deneyin.",
        retryAt: auth.lockedUntil,
      });
    }

    if (!auth) {
      return res.status(401).json({ success: false, message: "Geçersiz kimlik bilgileri" });
    }

    const user = auth;
    const payload = { id: user._id, email: user.email, role: user.role || "user" };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

    res.cookie(COOKIE_NAME, token, COOKIE_OPTS);

    return res.json({
      success: true,
      message: "Giriş başarılı",
      token,
      user: {
        id: user._id,
        email: user.email,
        role: user.role || "user",
        name: user.name || null,
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

/* =========================================
 * GET /api/auth/me
 * Header: Authorization: Bearer <token>  (veya cookie)
 * Returns: { success, user }
 * =======================================*/
router.get("/me", authenticate, async (req, res) => {
  try {
    const { id, email, role } = req.user || {};
    if (!id && !email) {
      return res.status(401).json({ success: false, message: "Geçersiz token" });
    }

    let userDoc = null;
    if (id) {
      userDoc = await User.findById(id).select("email role name");
    } else if (email) {
      userDoc = await User.findOne({ email: new RegExp(`^${email}$`, "i") }).select("email role name");
    }

    if (!userDoc) {
      return res.status(401).json({ success: false, message: "Kullanıcı bulunamadı" });
    }

    return res.json({
      success: true,
      user: {
        id: userDoc._id,
        email: userDoc.email,
        role: userDoc.role || role || "user",
        name: userDoc.name || null,
        isAdmin: (userDoc.role || role || "user") === "admin",
      },
    });
  } catch {
    return res.status(401).json({ success: false, message: "Geçersiz token" });
  }
});

/* =========================================
 * POST /api/auth/logout
 * Cookie'yı temizler
 * =======================================*/
router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    ...COOKIE_OPTS,
    expires: new Date(0),
  });
  return res.json({ success: true, message: "Çıkış yapıldı" });
});

export default router;
