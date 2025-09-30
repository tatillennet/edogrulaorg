// backend/routes/report.js
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";

import Report from "../models/Report.js";
import Blacklist from "../models/Blacklist.js";

const router = express.Router();

/* ───────────────────────── Config ───────────────────────── */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const REQUIRE_REPORT_VERIFY = String(process.env.REQUIRE_REPORT_VERIFY || "true").toLowerCase() === "true";
const FILE_BASE = (process.env.FILE_BASE_URL || "").replace(/\/+$/, "");

/* ───────────────────────── Helpers ───────────────────────── */
const sanitize = (v, max = 300) =>
  typeof v === "string" ? v.trim().slice(0, max) : undefined;

const escapeRegex = (s = "") => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rx = (s) => new RegExp(escapeRegex(s), "i");

const unAt = (s) => String(s || "").replace(/^@+/, "").trim();

const makePublicUrl = (rel) => {
  const clean = String(rel || "").replace(/^\/+/, "");
  return FILE_BASE ? `${FILE_BASE}/${clean}` : `/${clean}`;
};

const ensureDir = async (p) => fs.mkdir(p, { recursive: true });

/* ───────────────────────── Auth middlewares ───────────────────────── */
// Admin: JWT (role=admin) veya ADMIN_KEY
function requireAdmin(req, res, next) {
  try {
    // 1) JWT
    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (bearer) {
      const payload = jwt.verify(bearer, process.env.JWT_SECRET);
      if (payload?.role === "admin") return next();
    }
    // 2) ADMIN_KEY
    const sent = req.headers["x-admin-key"] || bearer;
    const need = process.env.ADMIN_KEY;
    if (need && String(sent) === String(need)) return next();

    return res.status(401).json({ success: false, message: "Yetkisiz" });
  } catch {
    return res.status(401).json({ success: false, message: "Yetkilendirme hatası" });
  }
}

// Public ihbar için e-posta doğrulama
function requireVerifiedEmail(req, res, next) {
  if (!REQUIRE_REPORT_VERIFY) return next(); // dev/test için kapatılabilir

  const token =
    req.headers["x-verify-token"] ||
    req.headers["x-verifyemail"] ||
    req.headers["x-verify"];

  if (!token) {
    return res.status(401).json({ success: false, message: "E-posta doğrulaması gerekiyor" });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload?.scope !== "email-verify" || !payload?.email) {
      return res.status(401).json({ success: false, message: "Geçersiz doğrulama kapsamı" });
    }
    req.verifiedEmail = payload.email;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Doğrulama token'ı geçersiz veya süresi dolmuş" });
  }
}

/* ───────────────────────── Multer (evidence) ───────────────────────── */
// memoryStorage + biz yazıyoruz → klasör: /uploads/report/<reportId>/
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }, // 10MB, max 10 dosya
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.mimetype);
    cb(ok ? null : new Error("INVALID_FILE_TYPE"), ok);
  },
});

const extFromMime = (m) =>
  m?.includes("jpeg") ? ".jpg" :
  m?.includes("png") ? ".png" :
  m?.includes("webp") ? ".webp" :
  m?.includes("pdf") ? ".pdf" : "";

/* ───────────────────────── Create Report (public) ───────────────────────── */
/**
 * POST /api/report
 * Form-Data:
 *  - name, instagramUsername, instagramUrl, phone, desc
 *  - evidence[] (jpg/png/webp/pdf, max 10)
 * Header:
 *  - x-verify-token (REQUIRE_REPORT_VERIFY=true ise zorunlu)
 */
router.post("/", requireVerifiedEmail, upload.array("evidence", 10), async (req, res) => {
  const cleanup = async (absFiles = []) => {
    await Promise.allSettled(absFiles.map((f) => fs.unlink(f)));
  };

  const absWritten = [];
  try {
    // Zorunlu alan yok; en az bir kimlik alanı şart
    const name = sanitize(req.body.name, 120);
    const igUser = sanitize(req.body.instagramUsername, 120);
    const igUrl = sanitize(req.body.instagramUrl, 400);
    const phone = sanitize(req.body.phone, 64);
    const desc = sanitize(req.body.desc, 2000);

    if (!name && !igUser && !igUrl && !phone) {
      return res.status(400).json({
        success: false,
        message: "En az bir alan gerekli: işletme adı / IG kullanıcı adı / IG URL / telefon",
      });
    }

    // Önce boş raporu oluştur (klasör ismi için ID lazım)
    const report = await Report.create({
      name,
      instagramUsername: igUser ? unAt(igUser) : undefined,
      instagramUrl: igUrl,
      phone,
      desc,
      reporterEmail: req.verifiedEmail || undefined,
      evidenceFiles: [], // dosyaları birazdan ekleyeceğiz
    });

    // Dosyaları yaz
    const reportId = String(report._id);
    const dir = path.join(UPLOAD_ROOT, "report", reportId);
    await ensureDir(dir);

    const evidenceFiles = [];
    const files = Array.isArray(req.files) ? req.files : [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = extFromMime(f.mimetype) || path.extname(f.originalname).toLowerCase() || ".bin";
      const filename = `${String(i + 1).padStart(2, "0")}${ext}`;
      const abs = path.join(dir, filename);
      await fs.writeFile(abs, f.buffer);
      absWritten.push(abs);

      const rel = path.join("uploads", "report", reportId, filename).replace(/\\/g, "/");
      evidenceFiles.push(makePublicUrl(rel));
    }

    report.evidenceFiles = evidenceFiles;
    await report.save();

    return res.status(201).json({
      success: true,
      message: "İhbar alındı",
      report,
    });
  } catch (err) {
    await cleanup(absWritten);
    const msg =
      err?.message === "INVALID_FILE_TYPE"
        ? "Geçersiz dosya türü (sadece JPG, PNG, WEBP, PDF)."
        : "Bir hata oluştu";
    return res.status(500).json({ success: false, message: msg, error: err?.message });
  }
});

/* ───────────────────────── CSV Export (admin) ───────────────────────── */
/**
 * GET /api/report/export.csv?status=pending|rejected&q=foo
 */
router.get("/export.csv", requireAdmin, async (req, res) => {
  try {
    const q = sanitize(req.query.q, 300);
    const status = sanitize(req.query.status, 20);

    const filter = {};
    if (status && ["pending", "rejected"].includes(status)) filter.status = status;
    if (q) {
      const R = rx(q);
      filter.$or = [
        { name: R }, { instagramUsername: R }, { instagramUrl: R },
        { phone: R }, { desc: R }, { reporterEmail: R },
      ];
    }

    const items = await Report.find(filter).sort({ createdAt: -1 }).lean();

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="reports-${Date.now()}.csv"`);

    const header = [
      "createdAt","status","rejectReason","name","instagramUsername",
      "instagramUrl","phone","reporterEmail","desc","evidenceFiles",
    ];
    res.write(header.join(";") + "\n");

    for (const r of items) {
      const row = [
        r.createdAt ? new Date(r.createdAt).toISOString() : "",
        r.status || "",
        r.rejectReason || "",
        r.name || "",
        r.instagramUsername || "",
        r.instagramUrl || "",
        r.phone || "",
        r.reporterEmail || "",
        (r.desc || "").replace(/\s+/g, " ").slice(0, 1000),
        (r.evidenceFiles || []).join(","),
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
      res.write(row.join(";") + "\n");
    }
    res.end();
  } catch (err) {
    res.status(500).json({ success: false, message: "Export hatası", error: err.message });
  }
});

/* ───────────────────────── List (admin) ───────────────────────── */
/**
 * GET /api/report?q=...&status=pending|rejected&page=1&limit=20
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const q = sanitize(req.query.q, 300);
    const status = sanitize(req.query.status, 20);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (status && ["pending", "rejected"].includes(status)) filter.status = status;
    if (q) {
      const R = rx(q);
      filter.$or = [
        { name: R }, { instagramUsername: R }, { instagramUrl: R },
        { phone: R }, { desc: R }, { reporterEmail: R },
      ];
    }

    const projection = "name instagramUsername instagramUrl phone desc status rejectReason reporterEmail evidenceFiles createdAt";
    const [items, total] = await Promise.all([
      Report.find(filter).select(projection).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Report.countDocuments(filter),
    ]);

    res.json({
      success: true,
      reports: items,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ───────────────────────── Detail (admin) ───────────────────────── */
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const rep = await Report.findById(req.params.id).lean();
    if (!rep) return res.status(404).json({ success: false, message: "İhbar bulunamadı" });
    res.json({ success: true, report: rep });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ───────────────────────── Approve → Blacklist (admin) ───────────────────────── */
router.post("/:id/approve", requireAdmin, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: "İhbar bulunamadı" });

    const black = await Blacklist.create({
      name: report.name,
      instagramUsername: report.instagramUsername,
      instagramUrl: report.instagramUrl,
      phone: report.phone,
      desc: report.desc,
    });

    await Report.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: "İhbar Blacklist’e taşındı", blacklist: black });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ───────────────────────── Reject (admin) ───────────────────────── */
router.post("/:id/reject", requireAdmin, async (req, res) => {
  try {
    const rep = await Report.findById(req.params.id);
    if (!rep) return res.status(404).json({ success: false, message: "İhbar bulunamadı" });

    rep.status = "rejected";
    rep.rejectReason = sanitize(req.body.reason, 500);
    await rep.save();

    res.json({ success: true, message: "İhbar reddedildi" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ───────────────────────── Delete (admin) ───────────────────────── */
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await Report.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "İhbar silindi" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ───────────────────────── Blacklist CRUD (admin) ───────────────────────── */
router.get("/blacklist/all", requireAdmin, async (req, res) => {
  try {
    const q = sanitize(req.query.q, 300);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);
    const skip = (page - 1) * limit;

    const filter = {};
    if (q) {
      const R = rx(q);
      filter.$or = [
        { name: R }, { instagramUsername: R }, { instagramUrl: R },
        { phone: R }, { desc: R },
      ];
    }

    const [items, total] = await Promise.all([
      Blacklist.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Blacklist.countDocuments(filter),
    ]);

    res.json({ success: true, blacklist: items, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

router.put("/blacklist/:id", requireAdmin, async (req, res) => {
  try {
    const payload = {
      name: sanitize(req.body.name, 120),
      instagramUsername: sanitize(req.body.instagramUsername, 120),
      instagramUrl: sanitize(req.body.instagramUrl, 400),
      phone: sanitize(req.body.phone, 64),
      desc: sanitize(req.body.desc, 2000),
    };
    const updated = await Blacklist.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true }).lean();
    if (!updated) return res.status(404).json({ success: false, message: "Blacklist kaydı bulunamadı" });
    res.json({ success: true, message: "Blacklist kaydı güncellendi", blacklist: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

router.delete("/blacklist/:id", requireAdmin, async (req, res) => {
  try {
    await Blacklist.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Blacklist kaydı silindi" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

export default router;
