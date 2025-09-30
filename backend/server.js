// backend/server.js
import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import sharp from "sharp";
import crypto from "crypto";
import os from "os";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer"; // SMTP debug

import authRoutes from "./routes/auth.js";
import businessRoutes from "./routes/business.js";
import applyRoutes from "./routes/apply.js";
import reportRoutes from "./routes/report.js";
import reviewsRoutes from "./routes/reviews.js";
import exploreRoutes from "./routes/explore.js";
import adminRoutes from "./routes/admin.js";
import blacklistRoutes from './routes/blacklist.js'; // ✅ YENİ ROUTE İÇERİ AKTARILDI

import User from "./models/User.js";

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";

/* ---------- Guards ---------- */
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI tanımlı değil. .env dosyanı kontrol et.");
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET tanımlı değil. .env içine güçlü bir JWT_SECRET ekleyin.");
}
const mailVars = ["MAIL_HOST", "MAIL_PORT", "MAIL_USER", "MAIL_PASS"];
const missingMail = mailVars.filter((k) => !process.env[k]);
if (missingMail.length && !isProd) {
  console.warn("ℹ️ Mail env eksik olabilir (dev):", missingMail.join(", "));
}

/* ---------- Security / Perf ---------- */
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.set("etag", false);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
    hsts: isProd ? undefined : false,
    referrerPolicy: { policy: "no-referrer" },
  })
);
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use(morgan(isProd ? "combined" : "dev"));

/* ---------- CORS ---------- */
const baseAllowed = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "https://edogrula.org",
  "https://www.edogrula.org",
];
const envAllowed = (process.env.CLIENT_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isPrivateLan(origin) {
  try {
    const u = new URL(origin);
    const h = u.hostname || "";
    return (
      /^localhost$/i.test(h) ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
    );
  } catch {
    return false;
  }
}

function isAllowed(origin) {
  if (!origin) return true;
  if (baseAllowed.includes(origin)) return true;
  if (envAllowed.includes(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.hostname === "edogrula.org") return true;
    if (u.hostname.endsWith(".edogrula.org")) return true;
  } catch {}
  if (!isProd && isPrivateLan(origin)) return true;
  return false;
}

const corsOptions = {
  origin: (origin, cb) => {
    if (isAllowed(origin)) return cb(null, true);
    if (!isProd) console.warn("🚫 Engellenen CORS Origin:", origin);
    return cb(null, false);
  },
  credentials: true,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* ---------- Health/Version ---------- */
const noCache = (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
};
app.get("/api/health", noCache, (_req, res) =>
  res.json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
    now: new Date().toISOString(),
  })
);
app.get("/api/version", noCache, (_req, res) =>
  res.json({ version: process.env.APP_VERSION || "1.0.0", commit: process.env.GIT_COMMIT || null })
);

/* ---------- Query & URL normalizer ---------- */
app.use((req, _res, next) => {
  if (req.query && typeof req.query === "object") {
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === "string") req.query[k] = v.trim();
    }
  }
  next();
});
app.use((req, res, next) => {
  let u = req.url || "";
  u = u.replace(/\\+/g, "/");
  u = u.replace(/^\/uploads\/https?:\/\/uploads\//i, "/uploads/");
  u = u.replace(/^\/api\/uploads\/https?:\/\/uploads\//i, "/uploads/");
  if (/^\/uploads\/https?:\/\//i.test(u)) {
    const target = u.replace(/^\/uploads\//i, "");
    return res.redirect(302, target);
  }
  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u);
      if (parsed.pathname.startsWith("/uploads/")) {
        u = parsed.pathname + parsed.search;
      }
    } catch {}
  }
  req.url = u;
  next();
});

/* ---------- UPLOADS kökü ---------- */
const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads"));
await fs.mkdir(UPLOADS_ROOT, { recursive: true });

/* ---------- Legacy: /uploads/apply/<folder>/01.jpg → gerçek görsel ---------- */
app.get(/^\/(?:api\/)?uploads\/apply\/([^/]+)\/(\d+)\.jpe?g$/i, async (req, res) => {
  try {
    const folder = req.params[0];
    const index1 = parseInt(req.params[1], 10);
    if (!folder || isNaN(index1) || index1 < 1) return res.status(404).end();

    const dir = path.join(UPLOADS_ROOT, "apply", folder);
    const items = await fs.readdir(dir);
    const images = items
      .filter((f) => /\.(webp|jpg|jpeg|png|avif)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const real = images[index1 - 1];
    if (!real) return res.status(404).end();

    const abs = path.join(dir, real);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.type(path.extname(real).slice(1) || "octet-stream");
    return res.sendFile(abs);
  } catch (e) {
    if (!isProd) console.error("legacy jpg map error:", e);
    return res.status(404).end();
  }
});

/* ---------- Static /uploads (+ alias) ---------- */
const staticOpts = {
  fallthrough: false,
  etag: true,
  maxAge: isProd ? "30d" : 0,
  setHeaders(res) {
    res.setHeader("Cache-Control", isProd ? "public, max-age=2592000, immutable" : "no-cache");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  },
};
const uploadsStatic = express.static(UPLOADS_ROOT, staticOpts);
app.use("/uploads", uploadsStatic);
app.use("/api/uploads", uploadsStatic);

/* ---------- JSON mutlak görsel URL ---------- */
const getBaseUrl = (req) =>
  (process.env.PUBLIC_BASE_URL || "").trim() ||
  `${req.headers["x-forwarded-proto"] || req.protocol}://${req.get("host")}`;

const toAbs = (p, base) =>
  typeof p === "string" && p.startsWith("/uploads/") ? `${base}${p}` : p;

function absolutizeInPlace(node, base, depth = 0) {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (typeof node[i] === "string") node[i] = toAbs(node[i], base);
      else if (typeof node[i] === "object") absolutizeInPlace(node[i], base, depth + 1);
    }
    return;
  }
  if (typeof node === "object") {
    for (const key of ["logo", "image", "cover", "avatar", "src"]) {
      if (typeof node[key] === "string") {
        const abs = toAbs(node[key], base);
        if (abs !== node[key]) node[`${key}Abs`] = abs;
      }
    }
    if (Array.isArray(node.gallery)) node.galleryAbs = node.gallery.map((x) => toAbs(x, base));
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === "object") absolutizeInPlace(v, base, depth + 1);
      else if (typeof v === "string") node[k] = toAbs(v, base);
    }
  }
}
app.use((req, res, next) => {
  const json = res.json.bind(res);
  res.json = (payload) => {
    try {
      const base = getBaseUrl(req);
      const cloned = JSON.parse(JSON.stringify(payload));
      absolutizeInPlace(cloned, base);
      res.setHeader("X-Asset-Base", base);
      return json(cloned);
    } catch {
      return json(payload);
    }
  };
  next();
});

/* ---------- /api/img (sharp) yalnızca görseller ---------- */
const IMG_CACHE_DIR = path.join(UPLOADS_ROOT, "_cache");
await fs.mkdir(IMG_CACHE_DIR, { recursive: true });

const IMG_EXT_OK = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

app.get("/api/img", async (req, res) => {
  try {
    let src = String(req.query.src || "");
    src = src.replace(/^\/api\/uploads(\/|$)/i, "/uploads$1");
    if (/^https?:\/\//i.test(src)) {
      try {
        const u = new URL(src);
        src = u.pathname.startsWith("/uploads/") ? u.pathname : src;
      } catch {}
    }
    if (!src.startsWith("/uploads/")) {
      return res.status(400).json({ success: false, message: "invalid src" });
    }

    const ext = path.extname(src).toLowerCase();
    if (!IMG_EXT_OK.has(ext)) {
      return res.status(415).json({ success: false, message: "unsupported media type" });
    }

    const w = Math.max(320, Math.min(4096, parseInt(req.query.w || "1200", 10) || 1200));
    const dpr = Math.max(1, Math.min(3, parseFloat(req.query.dpr || "1") || 1));
    const q = Math.max(40, Math.min(95, parseInt(req.query.q || "82", 10) || 82));
    const fit = /^(cover|contain|inside)$/i.test(String(req.query.fit || "")) ? String(req.query.fit).toLowerCase() : "cover";

    let fmt = String(req.query.fmt || "auto").toLowerCase();
    if (fmt === "auto") {
      const accept = String(req.headers.accept || "");
      if (accept.includes("image/avif")) fmt = "avif";
      else if (accept.includes("image/webp")) fmt = "webp";
      else fmt = "jpg";
    } else if (!/^(avif|webp|jpg|jpeg)$/.test(fmt)) {
      fmt = "webp";
    }
    if (fmt === "jpeg") fmt = "jpg";

    const rel = src.replace(/^\/uploads\//, "");
    const absInput = path.join(UPLOADS_ROOT, rel);
    await fs.access(absInput);

    const key = crypto
      .createHash("sha1")
      .update(JSON.stringify({ src, w, dpr, q, fmt, fit }))
      .digest("hex");

    const outExt = fmt === "jpg" ? "jpg" : fmt;
    const outFile = path.join(IMG_CACHE_DIR, `${key}.${outExt}`);

    try {
      await fs.access(outFile);
      res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
      res.type(outExt);
      return res.sendFile(outFile);
    } catch {}

    const targetW = Math.round(w * dpr);
    let pipeline = sharp(absInput, { failOnError: false });
    const meta = await pipeline.metadata();
    if (!meta || !meta.format) {
      return res.status(415).json({ success: false, message: "unsupported image" });
    }

    if (meta.width && meta.width > targetW) {
      pipeline = pipeline.resize({ width: targetW, withoutEnlargement: true, fit });
    }

    if (fmt === "avif") pipeline = pipeline.avif({ quality: q, effort: 4 });
    else if (fmt === "webp") pipeline = pipeline.webp({ quality: q });
    else pipeline = pipeline.jpeg({ quality: q, mozjpeg: true });

    const tmp = path.join(os.tmpdir(), `${key}.${outExt}`);
    await pipeline.toFile(tmp);
    await fs.rename(tmp, outFile);

    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    res.type(outExt);
    return res.sendFile(outFile);
  } catch (e) {
    if (!isProd) console.error("img proxy error:", e);
    return res.status(400).json({ success: false, message: "img proxy error" });
  }
});

/* ---------- Rate Limits ---------- */
const adminBypass = (req) => {
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (
    process.env.ADMIN_KEY &&
    (req.headers["x-admin-key"] === process.env.ADMIN_KEY || bearer === process.env.ADMIN_KEY)
  )
    return true;
  return false;
};

const BASE_LIMIT_OPTS = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "600000", 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator,
  skip: (req) =>
    !isProd || String(process.env.RATE_LIMIT_DISABLED).toLowerCase() === "true" || adminBypass(req),
  handler: (req, res) =>
    res
      .status(429)
      .set("Retry-After", "5")
      .json({ success: false, message: "Çok fazla istek. Lütfen birkaç saniye sonra tekrar deneyin." }),
};

const apiLimiter = rateLimit({ ...BASE_LIMIT_OPTS, max: parseInt(process.env.RATE_LIMIT_MAX || "300", 10) });
const verifyLimiter = rateLimit({
  ...BASE_LIMIT_OPTS,
  windowMs: 10 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_VERIFY_MAX || "8", 10),
});
app.use("/api/auth/send-code", verifyLimiter);
app.use("/api", apiLimiter);

/* ---------- Legacy alias ---------- */
app.use("/api/businesses", (req, res, next) => {
  const m = req.path.match(/^\/([^/]+)\/reviews\/?$/);
  if (m) return res.redirect(307, `/api/reviews/for/${encodeURIComponent(m[1])}`);
  next();
});

/* ---------- Explore no-cache ---------- */
app.use("/api/explore", noCache);

/* ------------------------- Auth helpers ------------------------- */
const getTokenFromReq = (req) => {
  const hdr = req.headers.authorization || "";
  const bearer = hdr.startsWith("Bearer ") ? hdr.slice(7).trim() : null;
  return req.cookies?.token || bearer || null;
};

function ensureAdmin(req, res, next) {
  if (adminBypass(req)) {
    req.isAdmin = true;
    req.admin = { method: "key" };
    return next();
  }
  const tok = getTokenFromReq(req);
  if (!tok) return res.status(401).json({ success: false, message: "Yetkisiz (token yok)" });
  try {
    const payload = jwt.verify(tok, process.env.JWT_SECRET);
    if (payload?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Forbidden (admin gerekli)" });
    }
    req.isAdmin = true;
    req.admin = { id: payload.id, email: payload.email, method: "jwt" };
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Geçersiz token" });
  }
}

/* ------------------------------ Debug uçları ------------------------------ */
app.post("/api/_debug/smtp-check", noCache, async (_req, res) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT),
      secure: Number(process.env.MAIL_PORT) === 465,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
      connectionTimeout: 10_000,
      socketTimeout: 10_000,
    });
    await transporter.verify();
    return res.json({ success: true, message: "SMTP OK" });
  } catch (err) {
    const payload = isProd
      ? { success: false, message: err?.message || "SMTP error" }
      : {
          success: false,
          message: err?.message,
          code: err?.code,
          command: err?.command,
          response: err?.response,
          stack: err?.stack,
        };
    return res.status(502).json(payload);
  }
});

app.post("/api/_debug/ping", (_req, res) => res.json({ success: true, ts: Date.now() }));

/* ------------------------------ Routes ------------------------------ */
app.use("/api/auth", authRoutes);
app.use("/api/businesses", businessRoutes);
app.use("/api/apply", applyRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/explore", exploreRoutes);
app.use("/api/admin", ensureAdmin, adminRoutes);

/* ---------- 404 & Error ---------- */
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint bulunamadı", path: req.originalUrl });
});

app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (!isProd) {
    console.error("🔥 Hata:", {
      path: req?.originalUrl,
      method: req?.method,
      message: err?.message,
      stack: err?.stack,
      code: err?.code,
    });
  } else {
    console.error("🔥 Hata:", err?.message || "Sunucu hatası");
  }
  res.status(status).json({
    success: false,
    message: status === 500 ? "INTERNAL_ERROR" : err?.message || "Hata",
  });
});

/* ---------- Mongo + Admin bootstrap ---------- */
mongoose.set("strictQuery", true);
mongoose.set("autoIndex", !isProd);

mongoose
  .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 })
  .then(async () => {
    console.log("✅ MongoDB bağlantısı başarılı");

    const adminEmail = process.env.ADMIN_EMAIL || "admin@edogrula.org";
    const adminPassword = process.env.ADMIN_PASSWORD || "CHANGE_ME_STRONG";
    if (isProd && adminPassword === "CHANGE_ME_STRONG") {
      console.warn("⚠️ PROD ortamında varsayılan ADMIN_PASSWORD kullanılıyor. Hemen değiştirin!");
    }

    try {
      const existingAdmin = await User.findOne({ email: adminEmail });
      if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await User.create({ email: adminEmail, password: hashedPassword, role: "admin" });
        console.log("👑 Admin kullanıcı oluşturuldu:", adminEmail);
      } else {
        console.log("👑 Admin kullanıcı zaten mevcut:", adminEmail);
      }
    } catch (e) {
      console.error("⚠️ Admin bootstrap hatası:", e.message);
    }

    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
    server.setTimeout(120 * 1000);

    const shutdown = (signal) => async () => {
      try {
        console.log(`\n${signal} alındı. Kapanıyor...`);
        await mongoose.connection.close();
        server.close(() => {
          console.log("🧹 HTTP server kapandı. Güle güle 👋");
          process.exit(0);
        });
        setTimeout(() => process.exit(0), 5000).unref();
      } catch (e) {
        console.error("⚠️ Graceful shutdown hatası:", e);
        process.exit(1);
      }
    };

    process.on("SIGINT", shutdown("SIGINT"));
    process.on("SIGTERM", shutdown("SIGTERM"));
    process.on("unhandledRejection", (r) => console.error("💥 Unhandled Rejection:", r));
    process.on("uncaughtException", (e) => {
      console.error("💥 Uncaught Exception:", e);
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB bağlantı hatası:", err.message);
    process.exit(1);
  });