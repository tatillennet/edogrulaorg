// backend/server.js — Ultra Pro Vercel Edition
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import fs from "fs";

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

import { authenticate, requireAdmin } from "./middleware/auth.js";

/* =====================================================
   App bootstrap
===================================================== */
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const UPLOADS_DIR = process.env.UPLOADS_DIR || "/tmp/uploads";

/* ------------ uploads klasörü ------------- */
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn("⚠️ uploads klasörü oluşturulamadı:", e.message);
}

/* =====================================================
   MongoDB (Vercel uyumlu, tek bağlantı, reuse)
===================================================== */

if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI tanımlı değil! (Vercel Project > Settings > Environment Variables)");
}

let mongoPromise = null;

function getMongoConnection() {
  if (!mongoPromise) {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI missing");
    }

    mongoose.set("strictQuery", true);

    mongoPromise = mongoose
      .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 8000,
        maxPoolSize: 10,
      })
      .then((conn) => {
        console.log("✅ MongoDB bağlı");
        return conn;
      })
      .catch((err) => {
        console.error("❌ MongoDB bağlantı hatası:", err);
        mongoPromise = null; // bir dahaki istekte yeniden denesin
        throw err;
      });
  }
  return mongoPromise;
}

// API isteklerinde (health hariç) Mongo hazır olsun
app.use(async (req, res, next) => {
  // root ve /api/health DB gerektirmesin
  if (!req.path.startsWith("/api") || req.path === "/api/health") {
    return next();
  }

  try {
    await getMongoConnection();
    return next();
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "DB bağlantı hatası" });
  }
});

/* =====================================================
   Middleware
===================================================== */
app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
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
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
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
    env: process.env.NODE_ENV,
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
   Routes
===================================================== */

// Public + auth
app.use("/api/auth", authRoutes);
app.use("/api/businesses", businessRoutes);
app.use("/api/apply", applyRoutes);
app.use("/api/report", reportRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/explore", exploreRoutes);
app.use("/api/google", googleRoutes);
app.use("/api/blacklist", blacklistRoutes);
app.use("/api/featured", publicFeaturedRouter);
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

// Dev (sadece local / non-prod)
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
  res.status(500).json({ success: false, message: "INTERNAL_ERROR" });
});

/* =====================================================
   Export for Vercel (Serverless)
===================================================== */
export default app;
