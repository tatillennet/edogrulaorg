// backend/server.js — Ultra Pro Vercel Safe Edition

import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import fs from "fs";
import mongoose from "mongoose";

// Routes
import authRoutes from "./routes/auth.js";
import businessRoutes from "./routes/business.js";
import applyRoutes from "./routes/apply.js";
import reportRoutes from "./routes/report.js";
import reviewsRoutes from "./routes/reviews.js";
import exploreRoutes from "./routes/explore.js";
import adminRoutes from "./routes/admin.js";
import blacklistRoutes from "./routes/blacklist.js";
import googleRoutes from "./routes/google.js";
import knowledgeRoutes from "./routes/knowledge.js";
import { publicFeaturedRouter } from "./routes/admin.featured.js";
import devSupwRoutes from "./routes/dev.supw.js";
import cmsRouter from "./routes/cms.js";

import User from "./models/User.js";
import { authenticate, requireAdmin } from "./middleware/auth.js";

/* =====================================================
   App bootstrap
===================================================== */
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const UPLOADS_DIR = process.env.UPLOADS_DIR || "/tmp/uploads";

/* =====================================================
   MongoDB Bağlantısı (Vercel uyumlu)
===================================================== */

if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI tanımlı değil! .env / Vercel Environment Variables kontrol et.");
} else {
  // Tek seferlik global promise; serverless ortamlarda yeniden kullanılır
  if (!global._mongoReady) {
    mongoose.set("strictQuery", true);

    global._mongoReady = mongoose
      .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 8000,
      })
      .then(async () => {
        console.log("✅ MongoDB bağlı");
        try {
          // Admin seed (idempotent)
          if (typeof User.ensureAdminSeed === "function") {
            await User.ensureAdminSeed();
          }
        } catch (e) {
          console.warn("[bootstrap] ensureAdminSeed hata:", e?.message);
        }
      })
      .catch((err) => {
        console.error("❌ Mongo bağlantı hatası:", err?.message || err);
      });
  }
}

/* =====================================================
   Uploads klasörü
===================================================== */
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("⚠️ uploads klasörü oluşturulamadı:", e.message);
}

/* =====================================================
   Middleware
===================================================== */
app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // SPA + API için sadeleştirilmiş
  })
);

app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use(morgan(isProd ? "tiny" : "dev"));

// CORS
const allowedOrigins = [
  "https://edogrula.org",
  "https://www.edogrula.org",
  "https://edogrulaorg-eaq4.vercel.app",
  "http://localhost:5173",
];

app.use(
  cors({
    origin: (origin, cb) => {
      // origin yoksa (SSR/fetch) veya listedeyse izin ver
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

// Static uploads
app.use("/uploads", express.static(UPLOADS_DIR));

/* =====================================================
   Health & Diagnostics
===================================================== */
app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Backend çalışıyor 🚀",
    env: process.env.NODE_ENV || "unknown",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    now: new Date().toISOString(),
  });
});

/* =====================================================
   API Routes
===================================================== */

// Public & auth
app.use("/api/auth", authRoutes);
app.use("/api/businesses", businessRoutes);
app.use("/api/apply", applyRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/explore", exploreRoutes);
app.use("/api/google", googleRoutes);
app.use("/api/blacklist", blacklistRoutes);
app.use("/api/featured", publicFeaturedRouter); // ✅ Önemli: vitrin endpoint
app.use("/api/knowledge", knowledgeRoutes);
app.use("/api/cms", cmsRouter);

// Admin
app.get("/api/admin/_whoami", authenticate, requireAdmin, (req, res) => {
  res.json({
    you: {
      id: req.user?._id,
      email: req.user?.email,
      role: req.user?.role || "admin",
    },
  });
});

app.use("/api/admin", authenticate, requireAdmin, adminRoutes);

// Dev only
if (!isProd) {
  app.use("/api/dev", devSupwRoutes);
}

/* =====================================================
   Error Handling
===================================================== */

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint bulunamadı",
    path: req.originalUrl,
  });
});

// 500
app.use((err, req, res, _next) => {
  console.error("❌ ERROR:", err);
  res.status(500).json({
    success: false,
    message: "INTERNAL_ERROR",
  });
});

/* =====================================================
   Export (Vercel Serverless)
===================================================== */

export default app;
