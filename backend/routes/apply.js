// backend/routes/apply.js
import express from "express";
import multer from "multer";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { fileURLToPath } from "url";
import ApplyRequest from "../models/ApplyRequest.js";

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ================== Multer ================== */
// Her alan adını kabul et; tip filtre geniş (octet-stream dâhil)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const mt = (file.mimetype || "").toLowerCase();
    const ok =
      mt.startsWith("image/") ||
      mt === "application/pdf" ||
      mt === "application/x-pdf" ||
      mt === "application/octet-stream";
    if (!ok) return cb(new Error("UNSUPPORTED_FILE_TYPE"));
    cb(null, true);
  },
});

/* ================== Paths & helpers ================== */
const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads"));

const safeName = (name = "file") =>
  String(name).replace(/[^\w.\-]+/g, "_").replace(/^_+/, "").slice(0, 80);

const toPublicPath = (abs) => {
  const rel = abs.replace(UPLOADS_ROOT, "").replace(/\\+/g, "/");
  return "/uploads" + rel;
};

const getBaseUrl = (req) =>
  (process.env.PUBLIC_BASE_URL || "").trim() ||
  `${req.headers["x-forwarded-proto"] || req.protocol}://${req.get("host")}`;

const truthy = (v) =>
  v === true || v === 1 || v === "1" || v === "true" || v === "on" || v === "yes" || v === "evet";

function pickFirst(obj, keys) {
  for (const k of keys) if (obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  return undefined;
}

// Dosya PDF mi/IMG mi? (mimetype + uzantı)
function classifyFile(f) {
  const mt = (f.mimetype || "").toLowerCase();
  const name = (f.originalname || "").toLowerCase();
  const isPdf = mt.includes("pdf") || /\.pdf$/i.test(name);
  const isImg =
    mt.startsWith("image/") || /\.(jpe?g|png|webp|avif|heic|heif|tiff|gif)$/i.test(name);
  return { isPdf, isImg };
}

/* ================== Route ================== */
router.post("/", upload.any(), async (req, res) => {
  try {
    if (process.env.NODE_ENV !== "production") {
      console.log("[apply] body keys:", Object.keys(req.body));
      console.log(
        "[apply] files:",
        (req.files || []).map((f) => `${f.fieldname}:${f.mimetype}:${f.originalname}`)
      );
    }

    /* ---- Normalizasyon ---- */
    const businessName =
      (pickFirst(req.body, [
        "businessName",
        "business",
        "name",
        "isletme",
        "firma",
        "company",
        "companyName",
        "title",
      ]) || "").toString().trim();

    const termsAccepted =
      ["termsAccepted", "terms", "acceptTerms", "accepted", "agree", "kvkk", "policy"].some(
        (k) => truthy(req.body[k])
      ) || false;

    const legalName =
      pickFirst(req.body, ["legalName", "unvan", "ticariUnvan", "legal", "tradeTitle"]) || "";

    const type = pickFirst(req.body, ["type", "tur", "category"]) || "";
    const address = pickFirst(req.body, ["address", "adres"]) || "";

    const phoneMobile =
      pickFirst(req.body, ["phoneMobile", "mobile", "telefon", "gsm", "phone"]) || "";

    const phoneFixed =
      pickFirst(req.body, ["phoneFixed", "sabit", "tel", "landline"]) || "";

    const instagram =
      pickFirst(req.body, [
        "instagram",
        "ig",
        "instagramUrl",
        "instagramHandle",
        "instagramUsername",
      ]) || "";

    const website = pickFirst(req.body, ["website", "web", "site", "url"]) || "";

    if (!businessName) return res.status(400).json({ ok: false, code: "BUSINESS_NAME_REQUIRED" });
    if (!termsAccepted) return res.status(400).json({ ok: false, code: "TERMS_REQUIRED" });

    /* ---- Kayıt klasörü ---- */
    const bucket = path.join(UPLOADS_ROOT, "apply", Date.now().toString(36));
    await fs.mkdir(bucket, { recursive: true });

    const savedDocs = [];
    const savedImages = [];
    const skipped = []; // atlanan/okunamayan dosyalar

    /* ---- Dosyaları işle ---- */
    for (const f of req.files || []) {
      const { isPdf, isImg } = classifyFile(f);

      // Benzersiz isim gövdesi
      const base = safeName((f.originalname || "file").replace(/\.[^.]+$/, ""));
      const uniq = `${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;

      if (isPdf) {
        try {
          const out = path.join(bucket, `${base || "belge"}_${uniq}.pdf`);
          await fs.writeFile(out, f.buffer, { flag: "w" });
          savedDocs.push(toPublicPath(out));
        } catch {
          skipped.push({ file: f.originalname, reason: "pdf_write_failed" });
        }
        continue;
      }

      if (isImg) {
        try {
          const out = path.join(bucket, `${base || "image"}_${uniq}.webp`);
          const buf = await sharp(f.buffer)
            .rotate()
            .resize({ width: 1600, withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();
          const tmp = path.join(os.tmpdir(), `${uniq}.webp`);
          await fs.writeFile(tmp, buf);
          await fs.rename(tmp, out);
          savedImages.push(toPublicPath(out));
        } catch {
          // tek bir bozuk görsel tüm isteği düşürmesin
          skipped.push({ file: f.originalname, reason: "image_convert_failed" });
        }
        continue;
      }

      // fileFilter geçti ama ne pdf ne image: yok say
      skipped.push({ file: f.originalname, reason: "unsupported" });
    }

    /* ---- Yanıt/DB verileri ---- */
    const folderPublic =
      savedImages[0]?.split("/").slice(0, -1).join("/") ||
      savedDocs[0]?.split("/").slice(0, -1).join("/") ||
      toPublicPath(bucket);

    /* ---- DB kaydı ---- */
    const doc = await ApplyRequest.create({
      businessName,
      legalName,
      type,
      address,
      phoneMobile,
      phoneFixed,
      instagram,
      website,
      docs: savedDocs,
      images: savedImages,
      status: "pending",
      termsAccepted: true,
      folder: folderPublic, // modelin pre-save'ine gerek kalmadan doldur
    });

    /* ---- Yanıt: klasör + önizleme URL’leri ---- */
    const base = getBaseUrl(req);
    const imagePreviews = savedImages.map(
      (p) => `${base}/api/img?src=${encodeURIComponent(p)}&w=800&dpr=2`
    );
    const docLinks = savedDocs.map((p) => `${base}${p}`);

    return res.status(201).json({
      ok: true,
      id: doc._id,
      folder: folderPublic, // /uploads/apply/xxxx...
      images: savedImages,  // /uploads/... (server.json middleware’i absolute’a çevirir)
      docs: savedDocs,      // /uploads/...
      preview: {
        images: imagePreviews, // gösterime hazır URL’ler
        docs: docLinks,        // tıklanabilir PDF linkleri
      },
      counts: { images: savedImages.length, docs: savedDocs.length, skipped: skipped.length },
      skipped, // {file, reason} listesi (UI'da istersen bilgilendir)
    });
  } catch (err) {
    console.error("[apply] error:", err);
    // Multer limit hataları
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ ok: false, code: "FILE_TOO_LARGE" });
    }
    if (err?.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ ok: false, code: "UNEXPECTED_FILE" });
    }

    const msg = String(err?.message || "");
    if (msg.includes("UNSUPPORTED_FILE_TYPE")) {
      return res.status(415).json({ ok: false, code: "UNSUPPORTED_FILE_TYPE" });
    }
    return res.status(500).json({ ok: false, code: "INTERNAL_ERROR" });
  }
});

export default router;
