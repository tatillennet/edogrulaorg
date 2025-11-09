// backend/server.js — Production Ready + SSL (optional) + Dev Diagnostics
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";
import * as erl from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import http from "http";
import https from "https";
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

// Models & Middleware
import User from "./models/User.js";
import { authenticate, requireAdmin } from "./middleware/auth.js";

/* =====================================================
   App bootstrap
   ===================================================== */
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const ENABLE_SSL =
  process.env.ENABLE_SSL === "true" ||
  process.env.SSL_ENABLED === "true";

const APP_VERSION = process.env.APP_VERSION || "1.0.0";
const GIT_COMMIT = process.env.GIT_COMMIT || null;
const PORT = Number(process.env.PORT || 5000);

const ASSET_BASE_RAW =
  (process.env.ASSET_BASE || "/uploads").replace(/\/+$/, "");
const ASSET_BASE = ASSET_BASE_RAW || "/uploads";

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ||
  path.join(__dirname, "uploads");

const FRONTEND_DIST =
  process.env.FRONTEND_DIST || null;

/* =====================================================
   MongoDB connection
   ===================================================== */
if (!process.env.MONGO_URI) {
  console.error(
    "❌ MONGO_URI tanımlı değil. .env dosyanı kontrol et!"
  );
  process.exit(1);
}

mongoose.set("strictQuery", true);
mongoose.set("autoIndex", !isProd);

mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
  })
  .then(async () => {
    console.log("✅ Veri tabanı bağlandı");
    try {
      const db = mongoose.connection.db;
      const collections =
        await db.listCollections().toArray();
      console.log(`🔗 DB: ${db.databaseName}`);
      console.log(
        `📦 Koleksiyon sayısı: ${collections.length}`
      );
      console.log(
        "📁 Koleksiyonlar:",
        collections.map((c) => c.name)
      );
    } catch {
      // sessiz geç
    }
    try {
      await User.ensureAdminSeed();
    } catch (e) {
      console.warn(
        "[bootstrap] ensureAdminSeed uyarısı:",
        e?.message
      );
    }
  
  })
  .catch((err) => {
    console.error(
      "MongoDB bağlantı hatası:",
      err.message
    );
    process.exit(1);
  });

/* =====================================================
   Express hardening & middleware chain
   ===================================================== */
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.set("etag", false);

/* -------- Request ID -------- */
app.use((req, res, next) => {
  const rid =
    req.headers["x-request-id"] ||
    `${Date.now().toString(
      36
    )}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  res.setHeader("X-Request-Id", rid);
  req.id = rid;
  next();
});

/* -------- Helmet -------- */
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
    contentSecurityPolicy: false, // SPA/dev için
    hsts: isProd ? undefined : false,
    referrerPolicy: { policy: "no-referrer" },
  })
);

/* -------- Parsers, Compression -------- */
app.use(compression());
app.use(
  express.json({ limit: "1mb" })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  })
);
app.use(cookieParser());

/* -------- Morgan + request-id -------- */
morgan.token("rid", (req) => req.id);
app.use(
  morgan(
    isProd
      ? ":rid :remote-addr :method :url :status :res[content-length] - :response-time ms"
      : "dev"
  )
);

/* -------- URL Normalization -------- */
// /api/api/... → /api/... ve çoklu slash cleanup
app.use((req, _res, next) => {
  const before = req.url;
  let u = before.replace(/\/{2,}/g, "/");
  u = u.replace(
    /^\/api\/(?:api\/)+/i,
    "/api/"
  );
  if (u !== before && !isProd) {
    console.warn(
      `[normalize] ${before} -> ${u}`
    );
  }
  req.url = u;
  next();
});

/* -------- CORS -------- */
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
    const h =
      new URL(origin).hostname || "";
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
  if (!origin) return true; // curl/postman
  if (
    baseAllowed.includes(origin) ||
    envAllowed.includes(origin)
  )
    return true;
  try {
    const h =
      new URL(origin).hostname;
    if (
      h === "edogrula.org" ||
      h.endsWith(".edogrula.org")
    )
      return true;
  } catch {}
  return !isProd && isPrivateLan(origin);
}

const corsOptions = {
  origin: (origin, cb) =>
    cb(null, isAllowed(origin)),
  credentials: true,
  methods: [
    "GET",
    "POST",
    "PUT",
    "DELETE",
    "OPTIONS",
    "PATCH",
  ],
  allowedHeaders: (req, cb) => {
    const reqHeaders =
      req.header(
        "Access-Control-Request-Headers"
      );
    cb(
      null,
      reqHeaders || [
        "Content-Type",
        "Authorization",
        "x-admin-key",
        "Accept",
        "X-Requested-With",
        "Origin",
      ]
    );
  },
  exposedHeaders: [
    "X-Asset-Base",
    "X-Request-Id",
  ],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

/* Tek OPTIONS handler */
app.use(
  (req, res, next) => {
    res.setHeader(
      "Vary",
      "Origin, Access-Control-Request-Headers, Access-Control-Request-Method"
    );
    if (req.method !== "OPTIONS")
      return next();

    const origin =
      req.headers.origin;
    if (!isAllowed(origin))
      return res.sendStatus(403);

    const reqHeaders =
      req.header(
        "Access-Control-Request-Headers"
      ) ||
      "Content-Type, Authorization, x-admin-key, Accept, X-Requested-With, Origin";

    res.setHeader(
      "Access-Control-Allow-Origin",
      origin || "*"
    );
    res.setHeader(
      "Access-Control-Allow-Credentials",
      "true"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,OPTIONS,PATCH"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      reqHeaders
    );
    res.setHeader(
      "Access-Control-Max-Age",
      "86400"
    );
    return res.sendStatus(204);
  }
);
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* -------- Asset Base Header -------- */
app.use((req, res, next) => {
  res.setHeader(
    "X-Asset-Base",
    ASSET_BASE
  );
  next();
});

/* -------- Static uploads -------- */
app.use(
  ASSET_BASE,
  express.static(UPLOADS_DIR, {
    etag: true,
    lastModified: true,
    maxAge: isProd ? "1d" : 0,
    setHeaders: (res) => {
      res.setHeader(
        "Access-Control-Expose-Headers",
        "X-Asset-Base"
      );
    },
  })
);

/* -------- Rate limits -------- */
const { rateLimit, ipKeyGenerator } = erl;
const ipSafeKey = (req) =>
  ipKeyGenerator(req);

const standardLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipSafeKey,
  skip: (req) =>
    req.method === "OPTIONS",
  message: {
    success: false,
    message: "RATE_LIMITED",
  },
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipSafeKey,
  skip: (req) =>
    req.method === "OPTIONS",
  message: {
    success: false,
    message: "ADMIN_RATE_LIMITED",
  },
});

app.use("/api", standardLimiter);

/* -------- Health -------- */
const noCache = (_req, res, next) => {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
};

app.get(
  "/api/ping",
  noCache,
  (_req, res) =>
    res.json({
      ok: true,
      where: "server",
    })
);
app.get(
  "/api/health",
  noCache,
  (_req, res) =>
    res.json({
      ok: true,
      env:
        process.env.NODE_ENV ||
        "development",
      uptime: process.uptime(),
      now: new Date().toISOString(),
    })
);
app.get(
  "/api/version",
  noCache,
  (_req, res) =>
    res.json({
      version: APP_VERSION,
      commit: GIT_COMMIT,
    })
);

/* =====================================================
   Routes
   ===================================================== */
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

/* Mini health for auth router */
app.get(
  "/api/auth/ping",
  (_req, res) =>
    res.json({
      ok: true,
      where: "auth",
    })
);

/* -------- ADMIN: hepsi tek çatı altında -------- */
app.get(
  "/api/admin/_whoami",
  authenticate,
  requireAdmin,
  (req, res) => {
    res.json({
      you: {
        id: req.user?._id,
        email: req.user?.email,
        role:
          req.user?.role || "admin",
      },
    });
  }
);
app.use(
  "/api/admin",
  adminLimiter,
  authenticate,
  requireAdmin,
  adminRoutes
);

/* -------- Dev-only routes -------- */
if (!isProd) {
  app.use("/api/dev", devSupwRoutes);
}

/* -------- Diagnostics (dev only) -------- */
if (!isProd) {
  const listRoutes = () => {
    const out = [];
    const dig = (base, stack) => {
      for (const layer of stack || []) {
        if (layer.route?.path) {
          const methods = Object.keys(
            layer.route.methods
          )
            .map((m) => m.toUpperCase())
            .join(",");
          out.push({
            base,
            path: layer.route.path,
            methods,
          });
        } else if (
          layer.name === "router" &&
          layer.handle?.stack
        ) {
          dig(
            layer.regexp?.toString() ||
              base,
            layer.handle.stack
          );
        }
      }
    };
    dig("", app._router?.stack);
    return out;
  };
  app.get(
    "/api/_routes",
    (_req, res) =>
      res.json({
        routes: listRoutes(),
      })
  );
}

/* -------- SPA static (prod, opsiyonel) -------- */
if (isProd && FRONTEND_DIST) {
  const dist = path.isAbsolute(
    FRONTEND_DIST
  )
    ? FRONTEND_DIST
    : path.join(__dirname, FRONTEND_DIST);

  app.use(
    express.static(dist, { index: false })
  );

  app.get("*", (req, res, next) => {
    if (!req.path.startsWith("/api")) {
      return res.sendFile(
        path.join(dist, "index.html")
      );
    }
    next();
  });
}

/* -------- 404 & Error handler -------- */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint bulunamadı",
    path: req.originalUrl,
  });
});

app.use((err, req, res, _next) => {
  const status = err.status || 500;
  const payload = {
    success: false,
    message:
      status === 500
        ? "INTERNAL_ERROR"
        : err?.message || "Hata",
  };
  if (!isProd) payload.stack = err.stack;
  console.error("ERROR:", {
    path: req?.originalUrl,
    method: req?.method,
    status,
    message: err?.message,
  });
  res.status(status).json(payload);
});

/* =====================================================
   Server starter (HTTP/HTTPS) + graceful shutdown
   ===================================================== */
function startServer() {
  let server;

  if (ENABLE_SSL) {
    try {
      const credentials = {
        key: fs.readFileSync(
          process.env.SSL_KEY_PATH,
          "utf8"
        ),
        cert: fs.readFileSync(
          process.env.SSL_CERT_PATH,
          "utf8"
        ),
        ...(process.env.SSL_CA_PATH
          ? {
              ca: fs.readFileSync(
                process.env.SSL_CA_PATH,
                "utf8"
              ),
            }
          : {}),
      };
      server = https.createServer(
        credentials,
        app
      );
      server.listen(PORT, () =>
        console.log(
          `🚀 Server (HTTPS) PORT: ${PORT}`
        )
      );
    } catch (err) {
      console.error(
        "SSL Hatası:",
        err.message
      );
      process.exit(1);
    }
  } else {
    server = http.createServer(app);
    server.listen(PORT, () =>
      console.log(
        `🚀 Server (HTTP) PORT: ${PORT}`
      )
    );
  }

  server.setTimeout(120 * 1000);

  const shutdown = () => {
    console.log(
      "\n⏳ Graceful shutdown...\n"
    );
    Promise.resolve()
      .then(() =>
        mongoose.connection.close()
      )
      .then(() =>
        server.close(() =>
          process.exit(0)
        )
      )
      .catch(() => process.exit(1));

    setTimeout(
      () => process.exit(0),
      5000
    ).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.on(
    "unhandledRejection",
    (r) =>
      console.error(
        "Unhandled Rejection:",
        r
      )
  );

  process.on(
    "uncaughtException",
    (e) => {
      console.error(
        "Uncaught Exception:",
        e
      );
      process.exit(1);
    }
  );
}
export default app;
