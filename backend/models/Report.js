// backend/models/Report.js
import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/* ========== Helpers ========== */
const clean = (s) => (typeof s === "string" ? s.trim() : "");
const toHttps = (u) => {
  const s = clean(u);
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};
function normalizeInstagram({ username, url }) {
  let u = clean(username);
  let link = clean(url);

  // URL'den kullanıcı adı çek
  if (!u && link) {
    const m = link.match(/instagram\.com\/(@?[\w.]+)/i);
    if (m) u = m[1];
  }
  u = u.replace(/^@/, "").toLowerCase();

  if (!link && u) link = `https://instagram.com/${u}`;
  else if (link) link = toHttps(link);

  // Bu modelde @ ile saklıyoruz (frontend uyumu)
  const instagramUsername = u ? `@${u}` : undefined;
  return { instagramUsername, instagramUrl: link || undefined };
}
function normalizePhone(raw) {
  const s = clean(raw);
  if (!s) return undefined;
  try {
    const p = parsePhoneNumberFromString(s, "TR");
    if (p?.isValid?.()) return p.number; // +90…
  } catch {}
  const only = s.replace(/[^\d+]/g, "");
  return only || undefined;
}

/* ========== Schema ========== */
const ReportSchema = new mongoose.Schema(
  {
    // Başlık / mağdurun bildirdiği isim
    name: { type: String, trim: true, maxlength: 240 },

    // Instagram
    instagramUsername: { type: String, trim: true, maxlength: 80 }, // '@kullanici'
    instagramUrl: { type: String, trim: true, maxlength: 300 },

    // Telefon (E.164)
    phone: { type: String, trim: true, maxlength: 32 },

    // Açıklama
    desc: { type: String, trim: true, maxlength: 8000 },

    // Muhabir e-posta
    reporterEmail: { type: String, trim: true, lowercase: true, maxlength: 160 },

    // Kanıt dosyaları (göreli path veya tam URL)
    evidenceFiles: [{ type: String }],

    // Moderasyon / durum
    status: {
      type: String,
      enum: ["open", "reviewing", "closed"],
      default: "open",
      index: true,
    },

    // Topluluk desteği
    supportCount: { type: Number, default: 0, index: true },
    supporters: { type: [String], default: [] }, // fingerprint hash’leri
    lastSupportedAt: { type: Date },
  },
  {
    timestamps: true,
    collation: { locale: "tr", strength: 2 },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    strict: true,
  }
);

/* ========== Normalization Hooks ========== */
function applyNormalization(doc) {
  // IG
  const ig = normalizeInstagram({
    username: doc.instagramUsername,
    url: doc.instagramUrl,
  });
  doc.instagramUsername = ig.instagramUsername;
  doc.instagramUrl = ig.instagramUrl;

  // Phone
  doc.phone = normalizePhone(doc.phone);

  // Email
  if (doc.reporterEmail) doc.reporterEmail = clean(doc.reporterEmail).toLowerCase();

  // Evidence: basit trim
  if (Array.isArray(doc.evidenceFiles)) {
    doc.evidenceFiles = [...new Set(doc.evidenceFiles.map((s) => clean(s)).filter(Boolean))];
  }
}

ReportSchema.pre("save", function (next) {
  applyNormalization(this);
  next();
});

ReportSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  const $set = { ...(update.$set || {}) };
  const $setOnInsert = { ...(update.$setOnInsert || {}) };

  if (Object.keys($set).length) applyNormalization($set);
  if (Object.keys($setOnInsert).length) applyNormalization($setOnInsert);

  this.setUpdate({ ...update, $set, $setOnInsert });
  next();
});

/* ========== Statics (kolay kullanım) ========== */
ReportSchema.statics.fromPayload = function (payload = {}) {
  const carrier = {
    name: payload.name,
    instagramUsername: payload.instagramUsername ?? payload.instagram, // esneklik
    instagramUrl: payload.instagramUrl,
    phone: payload.phone,
    desc: payload.desc ?? payload.description,
    reporterEmail: payload.reporterEmail ?? payload.email,
    evidenceFiles: payload.evidenceFiles,
    status: payload.status,
  };
  applyNormalization(carrier);
  return carrier;
};

/**
 * Kullanıcı desteği ekler (atomic):
 * - Aynı fingerprint daha önce desteklemediyse supporter ekler + supportCount artırır.
 * - İşlem başarılıysa { updated: true, supportCount } döner; aksi halde { updated: false, supportCount }.
 */
ReportSchema.statics.addSupport = async function (reportId, fingerprint) {
  const now = new Date();
  const res = await this.findOneAndUpdate(
    { _id: reportId, supporters: { $ne: fingerprint } },
    {
      $addToSet: { supporters: fingerprint },
      $inc: { supportCount: 1 },
      $set: { lastSupportedAt: now },
    },
    { new: true }
  );
  if (res) return { updated: true, supportCount: res.supportCount };
  // zaten desteklenmişse mevcut sayıyı dönelim
  const cur = await this.findById(reportId).select("supportCount");
  return { updated: false, supportCount: cur?.supportCount ?? 0 };
};

/* ========== Indexes (tek yer) ========== */
// Sık filtrelenen alanlar
ReportSchema.index({ reporterEmail: 1 });
ReportSchema.index({ instagramUsername: 1 });
ReportSchema.index({ phone: 1 });
// Sıralama
ReportSchema.index({ createdAt: -1 });
// Destek/trend
ReportSchema.index({ supportCount: -1, lastSupportedAt: -1 });
// Text arama (tek)
ReportSchema.index(
  { name: "text", desc: "text", instagramUsername: "text" },
  { weights: { name: 5, desc: 3, instagramUsername: 2 } }
);

/* ========== Output shaping ========== */
ReportSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.models.Report || mongoose.model("Report", ReportSchema);
