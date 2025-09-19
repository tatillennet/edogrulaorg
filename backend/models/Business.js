// backend/models/Business.js
import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/* ----------------------- helpers ----------------------- */
const slugify = (str = "") =>
  String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function normalizeInstagram({ username, url }) {
  let u = (username || "").trim();
  let link = (url || "").trim();

  if (!u && link) {
    const m = link.match(/instagram\.com\/(@?[\w.]+)/i);
    if (m) u = m[1];
  }
  u = u.replace(/^@/, "");

  if (!link && u) link = `https://instagram.com/${u}`;

  return {
    username: u || undefined,
    url: link || undefined,
    handle: u || undefined,
  };
}

function normalizePhone(raw) {
  const s = (raw || "").trim();
  if (!s) return undefined;
  try {
    const p = parsePhoneNumberFromString(s, "TR");
    if (p?.isValid()) return p.number; // E.164 (+90…)
  } catch {}
  return s.replace(/[^\d+]/g, "");
}

const uniqStrArr = (arr) =>
  [...new Set((arr || []).map((v) => String(v || "").trim()).filter(Boolean))];

/* ----------------------- schema ----------------------- */
const LocationSchema = new mongoose.Schema(
  {
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    district: { type: String, trim: true },
    lat: Number,
    lng: Number,
  },
  { _id: false }
);

const BusinessSchema = new mongoose.Schema(
  {
    /* temel */
    name: { type: String, required: true, trim: true },
    type: { type: String, default: "Bilinmiyor", trim: true },

    /* slug / handle */
    slug: { type: String, trim: true },
    handle: { type: String, trim: true },

    /* instagram */
    instagramUsername: { type: String, trim: true }, // "@kulesapanca" formatında tutulur
    instagramUrl: { type: String, trim: true },

    /* iletişim */
    phone: { type: String, trim: true },   // ana telefon (E.164)
    phones: { type: [String], default: [] },
    email: { type: String, trim: true },

    /* web */
    website: { type: String, trim: true },
    bookingUrl: { type: String, trim: true },

    /* adres/konum */
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    district: { type: String, trim: true },
    location: { type: LocationSchema, default: {} },

    /* içerik */
    description: { type: String, trim: true, default: "" },
    summary: { type: String, trim: true, default: "" },
    features: { type: [String], default: [] },

    /* GALERİ – en fazla 5 */
    gallery: { type: [String], default: [] },

    /* diğer */
    licenceNo: { type: String, trim: true },
    googlePlaceId: { type: String, trim: true },

    verified: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["approved", "pending", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true,
    collation: { locale: "tr", strength: 2 },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ----------------------- virtual aliases ----------------------- */
// Frontend uyumu: desc/photos/images sanal alanları
BusinessSchema.virtual("desc")
  .get(function () { return this.description; })
  .set(function (v) { this.description = v; });

BusinessSchema.virtual("photos")
  .get(function () { return this.gallery; })
  .set(function (arr) { this.gallery = arr; });

BusinessSchema.virtual("images")
  .get(function () { return this.gallery; })
  .set(function (arr) { this.gallery = arr; });

/* ----------------------- normalization ----------------------- */
function applyNormalization(doc) {
  /* slug */
  if (!doc.slug && doc.name) doc.slug = slugify(doc.name);

  /* instagram */
  const { username, url, handle } = normalizeInstagram({
    username: doc.instagramUsername,
    url: doc.instagramUrl,
  });

  if (username) doc.instagramUsername = username.startsWith("@") ? username : `@${username}`;
  else doc.instagramUsername = undefined;

  doc.instagramUrl = url;
  if (!doc.handle && handle) doc.handle = handle;

  /* phone / phones */
  const main = normalizePhone(doc.phone);
  doc.phone = main || undefined;

  const mergedPhones = uniqStrArr([main, ...(doc.phones || []).map(normalizePhone)]);
  doc.phones = mergedPhones.filter(Boolean);

  /* features */
  if (Array.isArray(doc.features)) {
    doc.features = uniqStrArr(doc.features);
  }

  /* gallery (max 5, trim) */
  if (Array.isArray(doc.gallery)) {
    doc.gallery = doc.gallery
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .slice(0, 5);
  }

  /* location fallbacks */
  if (!doc.location) doc.location = {};
  if (!doc.location.address && doc.address) doc.location.address = doc.address;
  if (!doc.location.city && doc.city) doc.location.city = doc.city;
  if (!doc.location.district && doc.district) doc.location.district = doc.district;
}

BusinessSchema.pre("save", function (next) {
  applyNormalization(this);
  next();
});

BusinessSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};

  if (update.$set) {
    const carrier = { ...update.$set };
    applyNormalization(carrier);
    update.$set = carrier;
  }
  if (update.$setOnInsert) {
    const carrierIns = { ...update.$setOnInsert };
    applyNormalization(carrierIns);
    update.$setOnInsert = carrierIns;
  }

  this.setUpdate(update);
  next();
});

/* ----------------------- indexes (TEK YER) ----------------------- */
// NOT: duplicate uyarısı yaşamamak için alan tanımlarında `index: true` KULLANMIYORUZ.
// Benzersiz (boş olmayan) slug
BusinessSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $exists: true, $ne: "" } } }
);

// Benzersiz (boş olmayan) handle
BusinessSchema.index(
  { handle: 1 },
  { unique: true, partialFilterExpression: { handle: { $exists: true, $ne: "" } } }
);

// Benzersiz (boş olmayan) instagram kullanıcı adı
BusinessSchema.index(
  { instagramUsername: 1 },
  { unique: true, partialFilterExpression: { instagramUsername: { $exists: true, $ne: "" } } }
);

// Benzersiz (boş olmayan) ana telefon
BusinessSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $exists: true, $ne: "" } } }
);

// (opsiyonel) instagram URL'e normal index (unique değil)
BusinessSchema.index({ instagramUrl: 1 });

// Sık sorgu/sıralama için yardımcı index
BusinessSchema.index({ verified: -1, createdAt: -1 });

// Text arama (koleksiyon başına 1 adet)
BusinessSchema.index(
  {
    name: "text",
    instagramUsername: "text",
    handle: "text",
    phone: "text",
    address: "text",
  },
  { weights: { name: 5, instagramUsername: 4, handle: 4, phone: 3, address: 1 } }
);

/* ----------------------- output ----------------------- */
BusinessSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.models.Business ||
  mongoose.model("Business", BusinessSchema);
