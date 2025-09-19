// backend/server.js
import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.js";
import businessRoutes from "./routes/business.js";
import applyRoutes from "./routes/apply.js";     // doğrulama başvuruları
import reportRoutes from "./routes/report.js";   // dolandırıcılık ihbarları
import googleRoutes from "./routes/google.js";   // Google (anahtar yoksa da boş döner)
import reviewsRoutes from "./routes/reviews.js"; // yorum/puanlar
import exploreRoutes from "./routes/explore.js"; // Results.jsx için /api/explore

import User from "./models/User.js";

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";

/* -------------------------
   🔐 Güvenlik + Performans
------------------------- */
app.set("trust proxy", 1);
// JSON yanıtlarında 304 olmasın
app.set("etag", false);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  })
);
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(isProd ? "combined" : "dev"));

/* -------------------------
   🌐 CORS (dinamik + güvenli)
------------------------- */
const baseAllowed = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "https://edogrula.org",
  "https://www.edogrula.org",
];
const envAllowed =
  (process.env.CLIENT_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) || [];
const allowedOrigins = Array.from(new Set([...baseAllowed, ...envAllowed]));

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    console.warn("🚫 Engellenen CORS Origin:", origin);
    return cb(new Error("CORS hatası: " + origin));
  },
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* -------------------------
   🗂️ Statik Uploads — HAZIRLIK
------------------------- */
const ensureUploads = async () => {
  const up = path.join(__dirname, "uploads");
  try {
    await fs.mkdir(up, { recursive: true });
  } catch {}
};
await ensureUploads();

/* ----------------------------------------------------------
   🧹 URL NORMALIZER (kritik)
   - Windows ters slash düzelt
   - /uploads/http(s)://... isteklerini gerçek dış kaynağa yönlendir
   - http(s)://host/uploads/... → /uploads/... normalize
---------------------------------------------------------- */
app.use((req, res, next) => {
  let u = req.url || "";

  // 1) Ters slashları normalize et
  u = u.replace(/\\+/g, "/");

  // 2) /uploads/https://uploads/... → /uploads/...
  u = u.replace(/^\/uploads\/https?:\/\/uploads\//i, "/uploads/");

  // 3) Eğer /uploads/http(s)://... geldiyse direkt dış kaynağa yönlendir
  if (/^\/uploads\/https?:\/\//i.test(u)) {
    const target = u.replace(/^\/uploads\//i, "");
    return res.redirect(302, target);
  }

  // 4) Tam URL ile gelmiş ve /uploads/... içeriyorsa path'e indir
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

/* -------------------------
   📁 Statik /uploads servisi
------------------------- */
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    fallthrough: false,     // bulunamazsa 404
    etag: true,
    maxAge: isProd ? "30d" : 0,
    setHeaders(res) {
      res.setHeader(
        "Cache-Control",
        isProd ? "public, max-age=2592000, immutable" : "no-cache"
      );
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

/* -------------------------
   🚦 Rate Limits
------------------------- */
const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const verifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  message: {
    success: false,
    message: "Çok fazla istek. Lütfen daha sonra tekrar deneyin.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth/send-code", verifyLimiter);
app.use("/api", apiLimiter);

/* -------------------------
   🧪 Health & Version
------------------------- */
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
    now: new Date().toISOString(),
  });
});

app.get("/api/version", (_req, res) => {
  res.json({
    version: process.env.APP_VERSION || "1.0.0",
    commit: process.env.GIT_COMMIT || null,
  });
});

/* -------------------------
   ✅ API Routes
------------------------- */
/** Eski endpoint’ler için alias köprüsü */
app.use("/api/businesses", (req, res, next) => {
  if (/^\/[^/]+\/reviews\/?$/.test(req.path)) {
    const idOrSlug = req.path.split("/")[1];
    req.url = `/for/${idOrSlug}`;
    return reviewsRoutes(req, res, next);
  }
  return next();
});

// /api/explore için cache'yi kapat (304 engelle)
app.use("/api/explore", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/businesses", businessRoutes);
app.use("/api/apply", applyRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/google", googleRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/explore", exploreRoutes); // Results.jsx burayı çağırıyor

/* -------------------------
   ❌ 404 Handler (JSON)
------------------------- */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint bulunamadı",
    path: req.originalUrl,
  });
});

/* -------------------------
   🧯 Global Error Handler
------------------------- */
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (!isProd) {
    console.error("🔥 Hata:", err);
  } else {
    console.error("🔥 Hata:", err?.message);
  }
  res.status(status).json({
    success: false,
    message: err?.message || "Sunucu hatası",
  });
});

/* -------------------------
   🗄️ MongoDB + Admin Bootstrap
------------------------- */
mongoose.set("strictQuery", true);

mongoose
  .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 })
  .then(async () => {
    console.log("✅ MongoDB bağlantısı başarılı");

    // İlk admin (varsa atlanır)
    const adminEmail = process.env.ADMIN_EMAIL || "admin@edogrula.org";
    const adminPassword = process.env.ADMIN_PASSWORD || "287388726Bt.";
    try {
      const existingAdmin = await User.findOne({ email: adminEmail });
      if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await User.create({
          email: adminEmail,
          password: hashedPassword,
          role: "admin",
        });
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
    process.on("unhandledRejection", (reason) => {
      console.error("💥 Unhandled Rejection:", reason);
    });
    process.on("uncaughtException", (err) => {
      console.error("💥 Uncaught Exception:", err);
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB bağlantı hatası:", err.message);
    process.exit(1);
  });
