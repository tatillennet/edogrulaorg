// backend/routes/auth.js (ESM)
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import User from "../models/User.js";
import VerificationCode from "../models/VerificationCode.js";

const router = express.Router();

/* ------------------------------ Helpers ------------------------------ */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const normalizeEmail = (e = "") => String(e).trim().toLowerCase();

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const VERIFY_TOKEN_TTL = process.env.VERIFY_TOKEN_TTL || "24h"; // 24 saat
const CODE_TTL_MIN = Number(process.env.CODE_TTL_MIN || 5);     // 5 dk
const RESEND_SECONDS = Number(process.env.AUTH_RESEND_SECONDS || 45);
const MAX_VERIFY_ATTEMPTS = Number(process.env.AUTH_MAX_ATTEMPTS || 5);
const VERIFY_PURPOSE = "verify_email";
const isProd = process.env.NODE_ENV === "production";

// 🍪 Cookie ayarları
const COOKIE_NAME = "token";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// Basit in-memory rate limit (prod'da Redis önerilir)
const WINDOW_MS = Number(process.env.AUTH_WINDOW_MS || 60_000);
const SEND_LIMIT = Number(process.env.AUTH_SEND_LIMIT || 5);
const VERIFY_LIMIT = Number(process.env.AUTH_VERIFY_LIMIT || 10);
const hitsSend = new Map();
const hitsVerify = new Map();

function allowHit(map, key, limit, windowMs) {
  const now = Date.now();
  const rec = map.get(key);
  if (!rec || now - rec.ts > windowMs) {
    map.set(key, { count: 1, ts: now });
    return true;
  }
  if (rec.count < limit) {
    rec.count += 1;
    return true;
  }
  return false;
}

function maskedEmail(e) {
  const [u = "", d = ""] = String(e).split("@");
  if (!u || !d) return e;
  const m = u.length <= 2 ? u[0] + "*" : u[0] + "*".repeat(u.length - 2) + u[u.length - 1];
  return `${m}@${d}`;
}

/* ----------------------- Mail Transporter (sağlam) ---------------------- */
let _transporter = null;

async function createConfiguredTransport() {
  if (process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS) {
    const t = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT || 465),
      secure: String(process.env.MAIL_SECURE || "true") === "true",
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
      connectionTimeout: 10_000,
      socketTimeout: 10_000,
    });
    await t.verify();
    return t;
  }
  if (process.env.MAIL_USER && /gmail\.com$/i.test(process.env.MAIL_USER) && process.env.MAIL_PASS) {
    const t = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
      connectionTimeout: 10_000,
      socketTimeout: 10_000,
    });
    await t.verify();
    return t;
  }
  const testAcc = await nodemailer.createTestAccount();
  const t = nodemailer.createTransport({
    host: testAcc.smtp.host,
    port: testAcc.smtp.port,
    secure: testAcc.smtp.secure,
    auth: { user: testAcc.user, pass: testAcc.pass },
  });
  await t.verify();
  console.warn("⚠️  Using Ethereal test SMTP. Preview emails at: https://ethereal.email/");
  return t;
}

async function getTransporter() {
  if (_transporter) return _transporter;
  try {
    _transporter = await createConfiguredTransport();
  } catch (e) {
    if (!isProd) {
      console.warn("✋ Primary SMTP verify failed:", e?.message || e);
      const testAcc = await nodemailer.createTestAccount();
      _transporter = nodemailer.createTransport({
        host: testAcc.smtp.host,
        port: testAcc.smtp.port,
        secure: testAcc.smtp.secure,
        auth: { user: testAcc.user, pass: testAcc.pass },
      });
      await _transporter.verify();
      console.warn("ℹ️ Dev fallback: Ethereal SMTP aktif.");
    } else {
      throw e;
    }
  }
  return _transporter;
}

function buildEmailHTML(code) {
  return `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif;line-height:1.6;color:#111827">
    <h2 style="margin:0 0 6px 0;color:#111827">E-Doğrula</h2>
    <p style="margin:0 0 8px 0">E-posta doğrulama kodunuz:</p>
    <div style="font-size:28px;font-weight:900;letter-spacing:2px;color:#fb415c">${code}</div>
    <p style="margin:8px 0 0 0;color:#6b7280">Bu kod <b>${CODE_TTL_MIN} dakika</b> boyunca geçerlidir.</p>
  </div>`;
}

/* ------------------------------ 📩 Kod Gönder ------------------------------ */
router.post("/send-code", async (req, res) => {
  try {
    const ip = req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
    const ua = req.headers["user-agent"];
    const rawEmail = req.body?.email;
    const email = normalizeEmail(rawEmail);

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, message: "Geçerli bir e-posta girin" });
    }

    if (!allowHit(hitsSend, `ip:${ip}`, SEND_LIMIT, WINDOW_MS) ||
        !allowHit(hitsSend, `email:${email}`, SEND_LIMIT, WINDOW_MS)) {
      return res.status(429).json({ success: false, message: "Çok fazla istek. Lütfen biraz sonra tekrar deneyin." });
    }

    // RESEND throttle
    const last = await VerificationCode.findOne({ email, purpose: "verify_email", usedAt: null })
      .sort({ createdAt: -1 })
      .lean();
    if (last?.createdAt) {
      const ageSec = Math.floor((Date.now() - new Date(last.createdAt).getTime()) / 1000);
      if (ageSec < RESEND_SECONDS) {
        const remain = Math.max(1, RESEND_SECONDS - ageSec);
        return res.json({
          success: true,
          message: `Kod daha önce gönderildi. Lütfen ${remain} sn sonra tekrar deneyin.`,
          alreadySent: true,
        });
      }
    }

    // Yeni kod üret (hash DB'ye yazılır, ham kod burada döner)
    const { code, ttlSeconds } = await VerificationCode.issue({
      email,
      purpose: "verify_email",
      ttlSeconds: CODE_TTL_MIN * 60,
      meta: { ip, ua, fp: req.body?.fp },
    });

    // Mail gönder
    const transporter = await getTransporter();
    const fromAddr = process.env.MAIL_FROM || (process.env.MAIL_USER ? `"E-Doğrula" <${process.env.MAIL_USER}>` : undefined);

    let info;
    try {
      info = await transporter.sendMail({
        from: fromAddr,
        to: email,
        subject: "E-Doğrula - E-posta Doğrulama Kodunuz",
        html: buildEmailHTML(code),
        text: `E-Doğrula doğrulama kodunuz: ${code} (${Math.round(ttlSeconds / 60)} dakika geçerlidir)`,
      });
    } catch (sendErr) {
      console.error("✉️  sendMail error:", {
        message: sendErr?.message,
        code: sendErr?.code,
        command: sendErr?.command,
        response: sendErr?.response,
      });
      return res.status(502).json({ success: false, message: "E-posta gönderilemedi. Lütfen daha sonra tekrar deneyin." });
    }

    // Dev/Ethereal önizleme
    let preview;
    if (!isProd && nodemailer.getTestMessageUrl && info) {
      preview = nodemailer.getTestMessageUrl(info);
      if (preview) console.log("✉️  Preview:", preview);
    }

    return res.json({
      success: true,
      message: `Kod ${maskedEmail(email)} adresine gönderildi`,
      ...(preview ? { preview } : {}),
    });
  } catch (err) {
    console.error("❌ Send Code Error:", err);
    return res.status(500).json({ success: false, message: "Kod gönderilemedi" });
  }
});

/* ------------------------------ ✅ Kod Doğrula ------------------------------ */
router.post("/verify-code", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();

    if (!email || !EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: "Geçersiz e-posta veya kod" });
    }

    if (!allowHit(hitsVerify, `ip:${req.ip}`, VERIFY_LIMIT, WINDOW_MS) ||
        !allowHit(hitsVerify, `email:${email}`, VERIFY_LIMIT, WINDOW_MS)) {
      return res.status(429).json({ success: false, message: "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin." });
    }

    const out = await VerificationCode.verify({
      email,
      purpose: "verify_email",
      code,
      maxAttempts: MAX_VERIFY_ATTEMPTS,
    });

    if (!out.ok) {
      const map = {
        not_found: { status: 400, msg: "Kod geçersiz veya süresi dolmuş" },
        used:      { status: 400, msg: "Bu kod zaten kullanılmış" },
        expired:   { status: 400, msg: "Kodun süresi dolmuş" },
        locked:    { status: 423, msg: "Çok fazla hatalı deneme. Bir süre sonra tekrar deneyin." },
        mismatch:  { status: 400, msg: `Kod hatalı${typeof out.attempts === "number" ? ` (${out.attempts}/${MAX_VERIFY_ATTEMPTS})` : ""}` },
      };
      const e = map[out.reason] || { status: 400, msg: "Kod doğrulanamadı" };
      return res.status(e.status).json({ success: false, message: e.msg });
    }

    const token = jwt.sign({ email, scope: "email-verify" }, JWT_SECRET, { expiresIn: VERIFY_TOKEN_TTL });
    return res.json({ success: true, message: "E-posta doğrulandı", token });
  } catch (err) {
    console.error("❌ Verify Code Error:", err);
    return res.status(500).json({ success: false, message: "Doğrulama hatası" });
  }
});

/* ------------------------------ 🔑 Login (Admin & User) ------------------------------ */
router.post("/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "E-posta ve şifre zorunlu" });
    }

    // 1) ENV Admin kısa yol (ilk kurulum)
    if (
      process.env.ADMIN_EMAIL &&
      process.env.ADMIN_PASSWORD &&
      email === normalizeEmail(process.env.ADMIN_EMAIL) &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const token = jwt.sign({ email, role: "admin" }, JWT_SECRET, { expiresIn: "7d" });
      res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
      return res.json({ success: true, message: "Admin girişi başarılı", token, user: { email, role: "admin" } });
    }

    // 2) MongoDB kullanıcısı
    const user = await User.findOne({ email: new RegExp(`^${email}$`, "i") }).select("+password role email");
    if (!user) return res.status(401).json({ success: false, message: "Kullanıcı bulunamadı" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ success: false, message: "Geçersiz şifre" });

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role || "user" }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
    return res.json({
      success: true,
      message: "Giriş başarılı",
      token,
      user: { id: user._id, email: user.email, role: user.role || "user" },
    });
  } catch (err) {
    console.error("❌ Login Error:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

/* ------------------------------ ➕ /auth/me ------------------------------ */
// Me helper
const getTokenFromReq = (req) => {
  const hdr = req.headers.authorization || "";
  const bearer = hdr.startsWith("Bearer ") ? hdr.slice(7).trim() : null;
  return req.cookies?.token || bearer || null;
};

// GET /api/auth/me  → 404 hatasını giderir
router.get("/me", (req, res) => {
  const tok = getTokenFromReq(req);
  if (!tok) return res.status(401).json({ success: false, message: "No token" });
  try {
    const payload = jwt.verify(tok, JWT_SECRET);
    return res.json({ success: true, user: payload });
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
});

/* ------------------------------ 🚪 Logout ------------------------------ */
router.post("/logout", async (_req, res) => {
  try {
    res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTS, maxAge: 0 });
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

export default router;
