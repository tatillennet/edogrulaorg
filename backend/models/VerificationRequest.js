// backend/models/VerificationRequest.js
import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/* ----------------------- helpers ----------------------- */
function normalizeInstagram({ username, url }) {
  let u = (username || "").trim();
  let link = (url || "").trim();

  // URL'den kullanıcı adı çek
  if (!u && link) {
    const m = link.match(/instagram\.com\/(@?[\w.]+)/i);
    if (m) u = m[1];
  }
  u = u.replace(/^@/, "");
  if (!link && u) link = `https://instagram.com/${u}`;
  return { username: u || undefined, url: link || undefined };
}

function normalizePhone(raw) {
  const s = (raw || "").trim();
  if (!s) return undefined;
  try {
    const p = parsePhoneNumberFromString(s, "TR");
    if (p?.isValid()) return p.number; // E.164 format (+90...)
  } catch {}
  return s.replace(/[^\d+]/g, "");
}

function makePublicUrl(rel) {
  if (!rel) return undefined;
  if (/^https?:\/\//i.test(rel)) return rel; // zaten tam URL
  const base = (process.env.FILE_BASE_URL || "").replace(/\/+$/, ""); // örn: http://localhost:5000
  if (!base) return `/${String(rel).replace(/^\/+/, "")}`; // base yoksa en azından absolute path
  return `${base}/${String(rel).replace(/^\/+/, "")}`;
}

/* ----------------------- file sub-schema ----------------------- */
const FileSchema = new mongoose.Schema(
  {
    // relative path: uploads/apply/<requestId>/01.jpg
    path: { type: String, trim: true },

    // tam URL: http://host:port/uploads/apply/<requestId>/01.jpg
    url: { type: String, trim: true },

    // meta
    originalname: { type: String, trim: true },
    name:         { type: String, trim: true },   // eski alanlarla uyum için
    mimetype:     { type: String, trim: true },
    mime:         { type: String, trim: true },   // eski alanlarla uyum için
    size: Number,
    blur: { type: Boolean, default: false },
    note: { type: String, trim: true },
  },
  { _id: false }
);

/* ----------------------- main schema ----------------------- */
const VerificationRequestSchema = new mongoose.Schema(
  {
    // zorunlu alanlar
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    instagramUsername: { type: String, required: true, trim: true },
    instagramUrl: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    // başvuru notu (opsiyonel)
    note: { type: String, trim: true, default: "" },

    // yüklenen belgeler/kanıtlar (opsiyonel)
    documents: { type: [FileSchema], default: [] },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
    collation: { locale: "tr", strength: 2 },
  }
);

/* ----------------------- normalization ----------------------- */
VerificationRequestSchema.pre("save", function (next) {
  // IG & telefon
  const { username, url } = normalizeInstagram({
    username: this.instagramUsername,
    url: this.instagramUrl,
  });
  this.instagramUsername = username;
  this.instagramUrl = url;
  this.phone = normalizePhone(this.phone);

  // belgeler için tam URL autofill
  if (Array.isArray(this.documents)) {
    this.documents = this.documents.map((d) => {
      const doc = { ...d };
      // mimetype alias
      if (!doc.mimetype && doc.mime) doc.mimetype = doc.mime;
      if (!doc.originalname && doc.name) doc.originalname = doc.name;
      // public url üret
      if (!doc.url && doc.path) doc.url = makePublicUrl(doc.path);
      return doc;
    });
  }
  next();
});

/* indexes */
VerificationRequestSchema.index({ createdAt: -1 });

/* clean json */
VerificationRequestSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.models.VerificationRequest ||
  mongoose.model("VerificationRequest", VerificationRequestSchema);
