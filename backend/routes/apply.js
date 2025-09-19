// backend/routes/apply.js (ESM)
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import VerificationRequest from "../models/VerificationRequest.js";
import Business from "../models/Business.js";

const router = express.Router();

/* ---------------------------------------------------
   Multer: Sadece görsel, max 5 adet, 10MB
---------------------------------------------------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 }, // 10MB, max 5 dosya
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp)$/i.test(file.mimetype);
    if (!ok) return cb(new Error("ONLY_IMAGES_ALLOWED"));
    cb(null, true);
  },
});

/* ---------------------------------------------------
   Yardımcılar
---------------------------------------------------- */
const ensureDir = async (p) => fs.mkdir(p, { recursive: true });
const safe = (s) => String(s || "").trim();
const unAt = (s) => String(s || "").replace(/^@+/, "").trim();
const extFromMime = (m) =>
  m?.includes("jpeg")
    ? ".jpg"
    : m?.includes("png")
    ? ".png"
    : m?.includes("webp")
    ? ".webp"
    : "";

// Public URL üretimi: FILE_BASE_URL varsa onu kullan, yoksa /uploads/... döndür
const FILE_BASE = (process.env.FILE_BASE_URL || "").replace(/\/+$/, "");
const toPublicUrl = (rel) => {
  const clean = String(rel || "").replace(/^\/+/, "");
  return FILE_BASE ? `${FILE_BASE}/${clean}` : `/${clean}`;
};

/* ---------------------------------------------------
   Admin Middleware
---------------------------------------------------- */
const requireAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ success: false, message: "Yetkisiz erişim" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Admin yetkisi gerekli" });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Geçersiz token",
      error: err.message,
    });
  }
};

/* ---------------------------------------------------
   ✅ Başvuru oluştur (JSON ya da multipart)
   Form-data alanı: documents  (max 5 görsel)
   Notlar: documentNotes (JSON array: [{index, note, blur, name}])
---------------------------------------------------- */
router.post("/", upload.array("documents", 5), async (req, res) => {
  try {
    const payload = {
      name: safe(req.body.name),
      type: safe(req.body.type),
      phone: safe(req.body.phone),
      email: safe(req.body.email),
      address: safe(req.body.address),
      note: safe(req.body.note),
      instagramUsername: unAt(req.body.instagramUsername),
      instagramUrl: safe(req.body.instagramUrl),
      business: safe(req.body.business) || null, // opsiyonel: mevcut işletmeye bağlama
      status: "pending",
    };

    const required = ["name", "type", "phone", "email", "address"];
    for (const f of required) {
      if (!payload[f]) {
        return res
          .status(400)
          .json({ success: false, message: `Eksik alan: ${f}` });
      }
    }

    // documentNotes (opsiyonel)
    let notes = [];
    if (req.body.documentNotes) {
      try {
        notes = JSON.parse(req.body.documentNotes);
      } catch {
        notes = [];
      }
    }

    // Request dokümanını oluştur (ID klasör adı için kullanılacak)
    const request = new VerificationRequest(payload);
    const requestId = String(request._id);

    // Görselleri kaydet
    const files = Array.isArray(req.files) ? req.files : [];
    const dir = path.join(process.cwd(), "uploads", "apply", requestId);
    if (files.length) await ensureDir(dir);

    const documents = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const meta = notes.find((n) => Number(n.index) === i) || {};
      const ext =
        extFromMime(f.mimetype) || path.extname(f.originalname) || ".jpg";
      const filename = `${String(i + 1).padStart(2, "0")}${ext}`;
      const abs = path.join(dir, filename);

      // public relatife çevirirken \ yerine / kullan
      const rel = path
        .join("uploads", "apply", requestId, filename)
        .replace(/\\/g, "/");

      await fs.writeFile(abs, f.buffer);

      documents.push({
        path: `/${rel}`,          // relative (server /uploads static’ten servis edilir)
        url: toPublicUrl(rel),    // tam URL (FILE_BASE_URL varsa)
        originalname: f.originalname,
        name: f.originalname,     // backward-compat
        mimetype: f.mimetype,
        mime: f.mimetype,         // backward-compat
        size: f.size,
        blur: !!meta.blur,
        note: meta.note || "",
      });
    }

    request.documents = documents;
    await request.save();

    return res.status(201).json({
      success: true,
      message: "Başvurunuz alınmıştır. En kısa sürede incelenecektir.",
      requestId,
      documents,
    });
  } catch (err) {
    const msg =
      err?.message === "ONLY_IMAGES_ALLOWED"
        ? "Sadece JPEG/PNG/WEBP görseller yükleyebilirsiniz."
        : err?.message || "Bir hata oluştu";
    return res.status(500).json({ success: false, message: msg });
  }
});

/* ---------------------------------------------------
   📋 Başvuruları listele (admin)
---------------------------------------------------- */
router.get("/", requireAdmin, async (_req, res) => {
  try {
    const [pending, approved, rejected] = await Promise.all([
      VerificationRequest.find({ status: "pending" })
        .sort({ createdAt: -1 })
        .lean(),
      VerificationRequest.find({ status: "approved" })
        .sort({ createdAt: -1 })
        .lean(),
      VerificationRequest.find({ status: "rejected" })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    return res.json({ success: true, pending, approved, rejected });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Bir hata oluştu", error: err.message });
  }
});

/* Tekil başvuru (admin) */
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const r = await VerificationRequest.findById(req.params.id).lean();
    if (!r)
      return res
        .status(404)
        .json({ success: false, message: "Başvuru bulunamadı" });
    res.json({ success: true, request: r });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Bir hata oluştu", error: err.message });
  }
});

/* ---------------------------------------------------
   ✅ Başvuru Onayla (admin)
   - Business kaydı oluşturur / günceller
   - Request.status = approved
   - İlk 5 image dosyayı Business.gallery'ye atar (url || path)
   - Başvuru notunu (varsa) Business.description’a kopyalar
---------------------------------------------------- */
router.post("/:id/approve", requireAdmin, async (req, res) => {
  try {
    const request = await VerificationRequest.findById(req.params.id);
    if (!request)
      return res
        .status(404)
        .json({ success: false, message: "Başvuru bulunamadı" });

    // Varsa aynı işletmeyi bulmaya çalış (instagram / telefon)
    let business =
      (request.business && (await Business.findById(request.business))) ||
      (request.instagramUsername &&
        (await Business.findOne({
          instagramUsername: new RegExp(
            `^@?${unAt(request.instagramUsername)}$`,
            "i"
          ),
        }))) ||
      (request.phone && (await Business.findOne({ phone: request.phone })));

    // Galeri (ilk 5 image) — url varsa url, yoksa path kullan
    const gallery =
      (request.documents || [])
        .filter((d) => ((d.mimetype || d.mime || "") + "").startsWith("image/"))
        .slice(0, 5)
        .map((d) => d.url || d.path) || [];

    const descFromNote = safe(request.note);

    if (!business) {
      business = new Business({
        name: request.name,
        type: request.type || req.body.type || "Bilinmiyor",
        instagramUsername: request.instagramUsername
          ? `@${unAt(request.instagramUsername)}`
          : undefined,
        instagramUrl: request.instagramUrl,
        phone: request.phone,
        address: request.address,
        email: request.email,
        description: descFromNote || undefined,
        gallery,
        verified: true,
        status: "approved",
      });
      await business.save();
    } else {
      // Mevcut işletmeyi güncelle (boşsa doldur, galeriyi birleştir)
      const mergedGallery = [
        ...(business.gallery || []),
        ...gallery.filter((g) => !(business.gallery || []).includes(g)),
      ].slice(0, 5); // en fazla 5

      business.set({
        name: business.name || request.name,
        type: business.type || request.type || "Bilinmiyor",
        instagramUsername:
          business.instagramUsername ||
          (request.instagramUsername
            ? `@${unAt(request.instagramUsername)}`
            : undefined),
        instagramUrl: business.instagramUrl || request.instagramUrl,
        phone: business.phone || request.phone,
        address: business.address || request.address,
        email: business.email || request.email,
        description: business.description || (descFromNote || undefined),
        gallery: mergedGallery,
        verified: true,
        status: "approved",
      });
      await business.save();
    }

    request.status = "approved";
    await request.save();

    return res.json({
      success: true,
      message: "Başvuru onaylandı ve işletme sisteme eklendi/güncellendi",
      business,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Bir hata oluştu", error: err.message });
  }
});

/* ---------------------------------------------------
   ❌ Başvuru Reddet (admin)
---------------------------------------------------- */
router.post("/:id/reject", requireAdmin, async (req, res) => {
  try {
    const request = await VerificationRequest.findById(req.params.id);
    if (!request)
      return res
        .status(404)
        .json({ success: false, message: "Başvuru bulunamadı" });

    request.status = "rejected";
    await request.save();

    return res.json({ success: true, message: "Başvuru reddedildi", request });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Bir hata oluştu", error: err.message });
  }
});

export default router;
