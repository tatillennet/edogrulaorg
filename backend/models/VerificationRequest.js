// backend/models/VerificationRequest.js
import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/* ----------------------- constants ----------------------- */
const MAX_DOCS = 5;

/* ----------------------- helpers ----------------------- */
function normalizeInstagram({ username, url, legacy }) {
  let u = String(username || "").trim();
  let link = String(url || legacy || "").trim();

  // URL'den kullanıcı adı çek
  if (!u && link) {
    const m = link.match(/instagram\.com\/(@?[\w.]+)/i);
    if (m) u = m[1];
  }
  // baştaki @ kaldır
  u = u.replace(/^@/, "");
  // kullanıcı varsa URL üret
  if (!link && u) link = `https://instagram.com/${u}`;

  return { username: u || undefined, url: link || undefined };
}

function normalizePhone(raw) {
  const s = String(raw || "").trim();
  if (!s) return undefined;
  try {
    const p = parsePhoneNumberFromString(s, "TR");
    if (p?.isValid()) return p.number; // E.164 (+90…)
  } catch {}
  return s.replace(/[^\d+]/g, "");
}

function makePublicUrl(rel) {
  if (!rel) return undefined;
  if (/^https?:\/\//i.test(rel)) return rel; // zaten tam URL
  const base = (process.env.FILE_BASE_URL || "").replace(/\/+$/, ""); // örn: http://localhost:5000
  const cleanRel = String(rel).replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  return base ? `${base}/${cleanRel}` : `/${cleanRel}`;
}

function capAndNormalizeDocs(docs = []) {
  const arr = (docs || [])
    .map((d) => {
      if (!d) return null;

      // Hem eski (string) hem yeni (obj) formatları güvenle destekle
      if (typeof d === "string") {
        const path = String(d).replace(/^\/+/, "").replace(/\/{2,}/g, "/");
        return { path, url: makePublicUrl(path) };
      }

      const doc = { ...d };

      // alias alanlarını tekilleştir
      if (!doc.mimetype && doc.mime) doc.mimetype = doc.mime;
      if (!doc.originalname && doc.name) doc.originalname = doc.name;

      // path temizle
      if (doc.path) doc.path = String(doc.path).replace(/^\/+/, "").replace(/\/{2,}/g, "/");

      // public URL auto
      if (!doc.url && doc.path) doc.url = makePublicUrl(doc.path);

      // boolean blur güvence
      doc.blur = Boolean(doc.blur);
      if (typeof doc.note === "string") doc.note = doc.note.trim();

      return doc;
    })
    .filter(Boolean);

  return arr.slice(0, MAX_DOCS);
}

// İl/İlçe'yi güvenle normalize et (trim + max length)
function normCity(s) {
  return String(s || "").trim().slice(0, 64) || undefined;
}
function normDistrict(s) {
  return String(s || "").trim().slice(0, 64) || undefined;
}

/* ----------------------- file sub-schema ----------------------- */
const FileSchema = new mongoose.Schema(
  {
    // relative path: uploads/apply/<requestId>/01.jpg
    path: { type: String, trim: true },
    // absolute/public url: http(s)://host/uploads/apply/<requestId>/01.jpg
    url: { type: String, trim: true },

    originalname: { type: String, trim: true },
    mimetype: { type: String, trim: true },
    size: Number,

    blur: { type: Boolean, default: false },
    note: { type: String, trim: true },
  },
  { _id: false }
);

/* ----------------------- main schema ----------------------- */
/**
 * Not: collection -> applyrequests
 * Eski alanlar da (businessName, legalName, phoneMobile, phoneFixed, instagram, docs, images)
 * schema'ya eklenip JSON dönüşünde tek bir forma normalize ediliyor.
 */
const VerificationRequestSchema = new mongoose.Schema(
  {
    /* ----- yeni alanlar ----- */
    name: { type: String, trim: true },             // businessName (legacy)
    tradeTitle: { type: String, trim: true },       // legalName (legacy)
    type: { type: String, trim: true },

    instagramUsername: { type: String, trim: true },
    instagramUrl: { type: String, trim: true },

    phone: { type: String, trim: true },            // phoneMobile (legacy)
    landline: { type: String, trim: true },         // phoneFixed (legacy)

    // İl/İlçe (UI'da ayrı alanlar)
    city: { type: String, trim: true, maxlength: 64, index: true },
    district: { type: String, trim: true, maxlength: 64, index: true },

    // Eski tekil adres alanı geriye dönük uyumluluk için korunur
    address: { type: String, trim: true, maxlength: 256 },

    email: { type: String, trim: true, lowercase: true, index: true }, // opsiyonel
    website: { type: String, trim: true },

    note: { type: String, trim: true, default: "" },

    documents: { type: [FileSchema], default: [] }, // PDF + görseller (maks 5)

    status: {
      // Admin UI ile tam uyum
      type: String,
      enum: ["pending", "in_review", "approved", "rejected", "archived", "spam"],
      default: "pending",
      index: true,
    },
    rejectReason: { type: String, trim: true, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    reviewedAt: { type: Date },

    business: { type: mongoose.Schema.Types.ObjectId, ref: "Business", index: true },

    /* ----- legacy alanlar (salt-okunur) ----- */
    businessName: { type: String, trim: true },     // -> name
    legalName: { type: String, trim: true },        // -> tradeTitle
    phoneMobile: { type: String, trim: true },      // -> phone
    phoneFixed: { type: String, trim: true },       // -> landline
    instagram: { type: String, trim: true },        // -> instagramUrl
    docs: { type: [mongoose.Schema.Types.Mixed], default: [] },   // -> documents
    images: { type: [mongoose.Schema.Types.Mixed], default: [] }, // -> documents (ikinci kaynak)
  },
  {
    timestamps: true,
    collation: { locale: "tr", strength: 2 },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    strict: true,
    collection: "applyrequests", // mevcut veriye bağlan
  }
);

/* ----------------------- virtuals ----------------------- */
VerificationRequestSchema.virtual("requestId").get(function () {
  return this._id?.toString();
});

// Listelemelerde pratik sanallar
VerificationRequestSchema.virtual("nameResolved").get(function () {
  return this.name || this.businessName || "";
});
VerificationRequestSchema.virtual("tradeTitleResolved").get(function () {
  return this.tradeTitle || this.legalName || "";
});
VerificationRequestSchema.virtual("phoneResolved").get(function () {
  return this.phone || this.phoneMobile || "";
});
VerificationRequestSchema.virtual("landlineResolved").get(function () {
  return this.landline || this.phoneFixed || "";
});
VerificationRequestSchema.virtual("instagramUrlResolved").get(function () {
  return this.instagramUrl || this.instagram || "";
});
VerificationRequestSchema.virtual("cityResolved").get(function () {
  return this.city || "";
});
VerificationRequestSchema.virtual("districtResolved").get(function () {
  return this.district || "";
});

/* ----------------------- normalization ----------------------- */
function applyNormalization(carrier) {
  if (!carrier) return;

  // IG & telefon (legacy ile birleştir)
  const { username, url } = normalizeInstagram({
    username: carrier.instagramUsername,
    url: carrier.instagramUrl,
    legacy: carrier.instagram,
  });
  carrier.instagramUsername = username;
  carrier.instagramUrl = url;

  carrier.phone = normalizePhone(carrier.phone || carrier.phoneMobile);
  carrier.landline = normalizePhone(carrier.landline || carrier.phoneFixed);

  // İl/İlçe normalize
  carrier.city = normCity(carrier.city);
  carrier.district = normDistrict(carrier.district);

  // Eski tekil adres alanını geriye dönük doldur (varsa koru)
  if (!carrier.address) {
    const parts = [carrier.district, carrier.city].filter(Boolean);
    if (parts.length) carrier.address = parts.join(", ");
  }

  // Belgeler: documents yoksa legacy docs/images kullan
  const docsCombined = (carrier.documents && carrier.documents.length ? carrier.documents : [])
    .concat(carrier.docs || [])
    .concat(carrier.images || []);
  carrier.documents = capAndNormalizeDocs(docsCombined);
}

VerificationRequestSchema.pre("save", function (next) {
  applyNormalization(this);
  next();
});

VerificationRequestSchema.pre("findOneAndUpdate", function (next) {
  const upd = this.getUpdate() || {};
  if (upd.$set) {
    const carrier = { ...upd.$set };
    applyNormalization(carrier);
    upd.$set = carrier;
  }
  if (upd.$setOnInsert) {
    const carrierIns = { ...upd.$setOnInsert };
    applyNormalization(carrierIns);
    upd.$setOnInsert = carrierIns;
  }
  this.setUpdate(upd);
  next();
});

/* ----------------------- indexes ----------------------- */
VerificationRequestSchema.index({ createdAt: -1 });
VerificationRequestSchema.index({ email: 1, status: 1, createdAt: -1 });
VerificationRequestSchema.index({ instagramUsername: 1 });
VerificationRequestSchema.index({ phone: 1 });
// Şehir/İlçe sorguları için bileşik indeks
VerificationRequestSchema.index({ city: 1, district: 1, createdAt: -1 });

// Text arama — city/district eklendi
VerificationRequestSchema.index(
  { name: "text", businessName: "text", address: "text", instagramUsername: "text", city: "text", district: "text" },
  { weights: { name: 5, businessName: 5, instagramUsername: 3, city: 2, district: 2, address: 1 } }
);

/* ----------------------- clean json ----------------------- */
VerificationRequestSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    // Geriye dönük alan birleştirme
    ret.name = ret.name || ret.businessName || "";
    ret.tradeTitle = ret.tradeTitle || ret.legalName || "";
    ret.phone = ret.phone || ret.phoneMobile || "";
    ret.landline = ret.landline || ret.phoneFixed || "";
    ret.instagramUrl = ret.instagramUrl || ret.instagram || "";

    // instagramUsername boşsa URL'den türet
    if (!ret.instagramUsername && ret.instagramUrl) {
      const m = /instagram\.com\/(@?[\w.]+)/i.exec(ret.instagramUrl);
      if (m) ret.instagramUsername = m[1].replace(/^@/, "");
    }

    // Belgeleri tekilleştir
    if (!ret.documents?.length) {
      const merged = []
        .concat(ret.documents || [])
        .concat(ret.docs || [])
        .concat(ret.images || []);
      ret.documents = capAndNormalizeDocs(merged);
    }

    // İl/İlçe JSON'da garanti olsun (undefined yerine boş string)
    ret.city = ret.city || "";
    ret.district = ret.district || "";

    // Address yoksa türet (UI geri uyum)
    if (!ret.address) {
      const parts = [ret.district || "", ret.city || ""].filter(Boolean);
      ret.address = parts.join(", ");
    }

    // Gürültüyü temizle
    delete ret.__v;
    delete ret.docs;
    delete ret.images;
    delete ret.phoneMobile;
    delete ret.phoneFixed;
    delete ret.legalName;
    delete ret.businessName;
    delete ret.instagram;
    return ret;
  },
});

export default mongoose.models.VerificationRequest ||
  mongoose.model("VerificationRequest", VerificationRequestSchema, "applyrequests");
