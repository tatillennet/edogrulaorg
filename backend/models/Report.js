// backend/models/Report.js
import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const { Schema, Types } = mongoose;

/* ========== Helpers ========== */

const clean = (s) => (typeof s === "string" ? s.trim() : "");

/**
 * URL'yi https'e çevirir; boşsa undefined döner.
 */
const toHttps = (u) => {
  const s = clean(u);
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
};

/**
 * Instagram kullanıcı adı + URL normalize
 * - username öncelikli
 * - URL'den username çıkarma desteği
 * - username: '@kullanici', url: 'https://instagram.com/kullanici'
 */
function normalizeInstagram({ username, url }) {
  let u = clean(username);
  let link = clean(url);

  // URL'den username yakala
  if (!u && link) {
    const m = link.match(/instagram\.com\/(@?[\w.]+)/i);
    if (m && m[1]) u = m[1];
  }

  if (u) {
    u = u.replace(/^@/, "").toLowerCase();
  }

  if (!link && u) {
    link = `https://instagram.com/${u}`;
  } else if (link) {
    link = toHttps(link);
  }

  const instagramUsername = u ? `@${u}` : undefined;
  const instagramUrl = link || undefined;

  return { instagramUsername, instagramUrl };
}

/**
 * Telefon normalize
 * - Önce TR varsayımıyla libphonenumber-js
 * - Olmazsa sadece rakam/+ bırak
 * - Boşsa undefined
 */
function normalizePhone(raw) {
  const s = clean(raw);
  if (!s) return undefined;

  try {
    const p = parsePhoneNumberFromString(s, "TR");
    if (p && typeof p.isValid === "function" && p.isValid()) {
      return p.number; // E.164, +90...
    }
  } catch {
    // sessiz geçiyoruz; aşağıda fallback var
  }

  const only = s.replace(/[^\d+]/g, "");
  return only || undefined;
}

/**
 * consent flag'ini güvenli parse et
 * "true", "1", 1, true => true
 * diğer her şey => false
 */
function parseConsent(v) {
  if (v === true) return true;
  if (v === 1) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "on" || s === "yes" || s === "evet") {
      return true;
    }
  }
  return false;
}

/**
 * Evidence alanlarını normalize et
 * - string veya dizi kabul
 * - trim + boşları at + uniq
 */
function normalizeEvidence(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  return [
    ...new Set(
      arr
        .map((s) => clean(String(s || "")))
        .filter(Boolean)
    ),
  ];
}

/* ========== Schema ========== */

const ReportSchema = new Schema(
  {
    // Başlık / ihbar edilen işletme adı veya kişi
    name: { type: String, trim: true, maxlength: 240 },

    // Instagram
    instagramUsername: { type: String, trim: true, maxlength: 80 }, // '@kullanici'
    instagramUrl: { type: String, trim: true, maxlength: 300 },

    // Telefon (E.164 veya normalize edilmiş)
    phone: { type: String, trim: true, maxlength: 32 },

    // Açıklama (ihbar metni)
    desc: { type: String, trim: true, maxlength: 8000 },

    // Muhbir kimliği (opsiyonel)
    reporter: { type: Types.ObjectId, ref: "User" },
    reporterEmail: { type: String, trim: true, lowercase: true, maxlength: 160 },
    reporterName: { type: String, trim: true, maxlength: 160 },
    reporterPhone: { type: String, trim: true, maxlength: 32 },

    // Hukuki/onay & kayıt izleri
    consent: { type: Boolean, required: true, default: false },
    policyVersion: { type: String, default: "v1" },
    createdByIp: { type: String },
    userAgent: { type: String },

    // Kanıt dosyaları (göreli path veya tam URL)
    evidenceFiles: [{ type: String }],

    // Moderasyon / durum
    status: {
      type: String,
      enum: ["open", "reviewing", "closed"],
      default: "open",
    },

    // Topluluk desteği
    supportCount: { type: Number, default: 0 },
    supporters: { type: [String], default: [] }, // fingerprint hash’leri
    lastSupportedAt: { type: Date },
  },
  {
    timestamps: true,
    collation: { locale: "tr", strength: 2 },
    strict: true,
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true },
  }
);

/* ========== Normalization Hooks ========== */

function applyNormalization(target) {
  if (!target || typeof target !== "object") return;

  // Instagram
  const ig = normalizeInstagram({
    username: target.instagramUsername,
    url: target.instagramUrl,
  });
  target.instagramUsername = ig.instagramUsername;
  target.instagramUrl = ig.instagramUrl;

  // Telefonlar
  if ("phone" in target) target.phone = normalizePhone(target.phone);
  if ("reporterPhone" in target) target.reporterPhone = normalizePhone(target.reporterPhone);

  // Email
  if (target.reporterEmail) {
    target.reporterEmail = clean(target.reporterEmail).toLowerCase();
  }

  // Evidence
  if (Array.isArray(target.evidenceFiles) || typeof target.evidenceFiles === "string") {
    target.evidenceFiles = normalizeEvidence(target.evidenceFiles);
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

/* ========== Statics ========== */

/**
 * Dış dünyadan gelen payload'ı güvenli, geriye dönük uyumlu şekilde modele çevirir.
 * Var olan verileri bozmaz; sadece normalize eder.
 */
ReportSchema.statics.fromPayload = function (payload = {}) {
  const carrier = {
    // ihbar edilen
    name: payload.name,

    // instagram: hem eski `instagram` hem yeni `instagramUsername` desteği
    instagramUsername: payload.instagramUsername ?? payload.instagram,
    instagramUrl: payload.instagramUrl,

    // iletişim / açıklama
    phone: payload.phone,
    desc: payload.desc ?? payload.description,

    // muhbir
    reporter: payload.reporterId || payload.reporter || undefined,
    reporterEmail: payload.reporterEmail ?? payload.email,
    reporterName: payload.reporterName,
    reporterPhone: payload.reporterPhone,

    // izler
    consent: parseConsent(payload.consent),
    policyVersion: payload.policyVersion || "v1",
    createdByIp: payload.createdByIp,
    userAgent: payload.userAgent,

    // kanıtlar
    evidenceFiles: normalizeEvidence(
      payload.evidenceFiles || payload.evidence || payload.files
    ),

    // moderasyon (opsiyonel dış kaynak)
    status:
      ["open", "reviewing", "closed"].includes(payload.status)
        ? payload.status
        : undefined,
  };

  applyNormalization(carrier);
  return carrier;
};

/**
 * Kullanıcı desteği ekler (atomic + idempotent).
 */
ReportSchema.statics.addSupport = async function (reportId, fingerprint) {
  if (!fingerprint) {
    return { updated: false, supportCount: 0 };
  }

  const now = new Date();

  const updated = await this.findOneAndUpdate(
    { _id: reportId, supporters: { $ne: fingerprint } },
    {
      $addToSet: { supporters: fingerprint },
      $inc: { supportCount: 1 },
      $set: { lastSupportedAt: now },
    },
    { new: true }
  ).select("supportCount");

  if (updated) {
    return { updated: true, supportCount: updated.supportCount };
  }

  const cur = await this.findById(reportId).select("supportCount");
  return { updated: false, supportCount: cur?.supportCount ?? 0 };
};

/* ========== Indexes ========== */

// Sorgu desenlerine uygun indeksler (veriyi bozmadan performans için)
ReportSchema.index({ reporter: 1, createdAt: -1 });
ReportSchema.index({ reporterEmail: 1 }, { sparse: true });
ReportSchema.index({ status: 1, createdAt: -1 });
ReportSchema.index({ instagramUsername: 1 });
ReportSchema.index({ phone: 1 });
ReportSchema.index({ createdAt: -1 });
ReportSchema.index({ createdByIp: 1 });
ReportSchema.index({ supportCount: -1, lastSupportedAt: -1 });

// Text arama (isim, açıklama, instagram)
ReportSchema.index(
  { name: "text", desc: "text", instagramUsername: "text" },
  { weights: { name: 5, desc: 3, instagramUsername: 2 } }
);

/* ========== Output shaping (ek güvenlik) ========== */

ReportSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.__v;
    // Dahili izleri API dışına atmak istersen buraya ekleyebilirsin:
    // delete ret.createdByIp;
    // delete ret.userAgent;
    return ret;
  },
});

export default mongoose.models.Report || mongoose.model("Report", ReportSchema);
