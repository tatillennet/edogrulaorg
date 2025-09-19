import multer from "multer";
import path from "path";
import fs from "fs";

const root = path.join(process.cwd(), "uploads", "verifications");
fs.mkdirSync(root, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, root),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
    cb(null, name);
  },
});

const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const fileFilter = (_req, file, cb) => {
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error("Dosya türü desteklenmiyor"));
};

export const uploadApplyDocs = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }, // 10MB, max 10 dosya
});

export const filePublicUrl = (filename) => `/uploads/verifications/${filename}`;
