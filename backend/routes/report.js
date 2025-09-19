// backend/routes/report.js
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const router = express.Router();

/* ======================================================
   🗂️ Schemas / Models
====================================================== */
const ReportSchema = new mongoose.Schema(
  {
    name: { type: String, index: true },
    instagramUsername: { type: String, index: true },
    instagramUrl: { type: String, index: true },
    phone: { type: String, index: true },
    desc: String,

    status: { type: String, enum: ["pending", "rejected"], default: "pending", index: true },
    rejectReason: String,

    reporterEmail: { type: String, index: true },   // doğrulanan e-posta
    evidenceFiles: [String],                        // /uploads/... mutlak URL
  },
  { timestamps: true }
);

// arama performansı için basit birleşik index
ReportSchema.index({ createdAt: -1 });

const Report = mongoose.models.Report || mongoose.model("Report", ReportSchema);

const BlacklistSchema = new mongoose.Schema(
  {
    name: { type: String, index: true },
    instagramUsername: { type: String, index: true },
    instagramUrl: { type: String, index: true },
    phone: { type: String, index: true },
    desc: String,
  },
  { timestamps: true }
);
BlacklistSchema.index({ createdAt: -1 });

const Blacklist = mongoose.models.Blacklist || mongoose.model("Blacklist", BlacklistSchema);

/* ======================================================
   🔐 Middlewares
====================================================== */
const requireAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "Yetkisiz erişim" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin yetkisi gerekli" });
    }
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Geçersiz token" });
  }
};

// verify-code sonrası verilen kısa ömürlü token ile e-posta doğrulaması zorunlu
const requireVerifiedEmail = (req, res, next) => {
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
};

/* ======================================================
   🧰 Helpers
====================================================== */
const sanitize = (v, max = 300) =>
  typeof v === "string" ? v.trim().slice(0, max) : undefined;

const buildPublicUrl = (req, filename) => {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ||
               `${req.protocol}://${req.get("host")}`;
  return `${base}/uploads/${filename}`;
};

/* ======================================================
   📤 Multer (Delil yükleme)
====================================================== */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  },
});

const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const fileFilter = (_, file, cb) => {
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Geçersiz dosya türü (sadece JPG, PNG, WEBP, PDF)"), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }, // 10MB, max 10
});

/* ======================================================
   📨 İhbar oluştur (public, ama verified e-posta şart)
   Form-Data alanları:
    - name, instagramUsername, instagramUrl, phone, desc
    - evidence[]: dosyalar (jpg/png/webp/pdf)
   Header:
    - x-verify-token: <verifyEmailToken>
====================================================== */
router.post("/", requireVerifiedEmail, upload.array("evidence", 10), async (req, res) => {
  // upload tamamlandı ama DB kaydı başarısız olursa orphan dosyaları silelim
  const cleanupFiles = () => {
    for (const f of req.files || []) {
      try { fs.unlinkSync(path.join(uploadDir, f.filename)); } catch {}
    }
  };

  try {
    // En az bir tanımlayıcı alan bekleyelim
    const name = sanitize(req.body.name, 120);
    const igUser = sanitize(req.body.instagramUsername, 120);
    const igUrl = sanitize(req.body.instagramUrl, 300);
    const phone = sanitize(req.body.phone, 64);
    const desc = sanitize(req.body.desc, 2000);

    if (!name && !igUser && !igUrl && !phone) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "En az bir alan gerekli: işletme adı / IG kullanıcı adı / IG URL / telefon",
      });
    }

    const evidenceFiles = (req.files || []).map((f) => buildPublicUrl(req, f.filename));

    const rep = new Report({
      name,
      instagramUsername: igUser,
      instagramUrl: igUrl,
      phone,
      desc,
      reporterEmail: req.verifiedEmail,
      evidenceFiles,
    });

    await rep.save();
    return res.status(201).json({ success: true, message: "İhbar alındı", report: rep });
  } catch (err) {
    cleanupFiles();
    return res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ======================================================
   📃 Admin: ihbar listesi (arama + filtre + sayfalama)
   GET /api/report?q=abc&status=pending|rejected&page=1&limit=20
====================================================== */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const q = sanitize(req.query.q, 300);
    const status = sanitize(req.query.status, 20);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (status && ["pending", "rejected"].includes(status)) {
      filter.status = status;
    }
    if (q) {
      const rx = new RegExp(q, "i");
      filter.$or = [
        { name: rx },
        { instagramUsername: rx },
        { instagramUrl: rx },
        { phone: rx },
        { desc: rx },
        { reporterEmail: rx },
      ];
    }

    const [items, total] = await Promise.all([
      Report.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
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

/* ======================================================
   🔎 Admin: tek ihbar detayı
====================================================== */
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const rep = await Report.findById(req.params.id);
    if (!rep) return res.status(404).json({ success: false, message: "İhbar bulunamadı" });
    res.json({ success: true, report: rep });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ======================================================
   ✅ Admin: onayla → Blacklist’e taşı (ve Report’u sil)
====================================================== */
router.post("/:id/approve", requireAdmin, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: "İhbar bulunamadı" });

    const black = new Blacklist({
      name: report.name,
      instagramUsername: report.instagramUsername,
      instagramUrl: report.instagramUrl,
      phone: report.phone,
      desc: report.desc,
    });
    await black.save();

    await Report.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: "İhbar Blacklist’e taşındı", blacklist: black });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ======================================================
   ❌ Admin: reddet (opsiyonel sebep)
====================================================== */
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

/* ======================================================
   🗑️ Admin: ihbarı tamamen sil
====================================================== */
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await Report.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "İhbar silindi" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ======================================================
   ⛔ Admin: Blacklist listesi / düzenle / sil
   (listeleme için basit arama + sayfalama eklendi)
====================================================== */
router.get("/blacklist/all", requireAdmin, async (req, res) => {
  try {
    const q = sanitize(req.query.q, 300);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);
    const skip = (page - 1) * limit;

    const filter = {};
    if (q) {
      const rx = new RegExp(q, "i");
      filter.$or = [
        { name: rx },
        { instagramUsername: rx },
        { instagramUrl: rx },
        { phone: rx },
        { desc: rx },
      ];
    }

    const [items, total] = await Promise.all([
      Blacklist.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
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
      instagramUrl: sanitize(req.body.instagramUrl, 300),
      phone: sanitize(req.body.phone, 64),
      desc: sanitize(req.body.desc, 2000),
    };
    const updated = await Blacklist.findByIdAndUpdate(req.params.id, payload, { new: true });
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

/* ======================================================
   🧾 CSV Export (Admin)
   GET /api/report/export.csv?status=pending&q=foo
====================================================== */
router.get("/export.csv", requireAdmin, async (req, res) => {
  try {
    const q = sanitize(req.query.q, 300);
    const status = sanitize(req.query.status, 20);
    const filter = {};
    if (status && ["pending", "rejected"].includes(status)) filter.status = status;
    if (q) {
      const rx = new RegExp(q, "i");
      filter.$or = [
        { name: rx },
        { instagramUsername: rx },
        { instagramUrl: rx },
        { phone: rx },
        { desc: rx },
        { reporterEmail: rx },
      ];
    }

    const items = await Report.find(filter).sort({ createdAt: -1 });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="reports-${Date.now()}.csv"`);

    const header = [
      "createdAt",
      "status",
      "rejectReason",
      "name",
      "instagramUsername",
      "instagramUrl",
      "phone",
      "reporterEmail",
      "desc",
      "evidenceFiles",
    ];
    res.write(header.join(";") + "\n");

    for (const r of items) {
      const row = [
        r.createdAt?.toISOString() || "",
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

export default router;
