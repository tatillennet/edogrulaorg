// backend/models/Business.js
import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/* ============ helpers ============ */
const clean = (s) => (typeof s === "string" ? s.trim() : "");
const slugify = (str = "") =>
  clean(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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
  // baştaki @ at, IG lower-case çalışır
  u = u.replace(/^@/, "").toLowerCase();

  // link yoksa üret, varsa https’e çevir
  if (!link && u) link = `https://instagram.com/${u}`;
  else if (link) link = toHttps(link);

  // Frontend uyumu: instagramUsername '@' İLE saklanır
  const instagramUsername = u ? `@${u}` : undefined;
  const handle = u || undefined;

  return { instagramUsername, instagramUrl: link || undefined, handle };
}

function normalizePhone(raw) {
  const s = clean(raw);
  if (!s) return undefined;
  try {
    const p = parsePhoneNumberFromString(s, "TR");
    if (p?.isValid?.()) return p.number; // +90...
  } catch {}
  const only = s.replace(/[^\d+]/g, "");
  return only || undefined;
}

const uniqStrArr = (arr) =>
  [...new Set((arr || []).map((v) => clean(String(v))).filter(Boolean))];

/* ============ sub-schemas ============ */
const LocationSchema = new mongoose.Schema(
  {
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    district: { type: String, trim: true },
    lat: { type: Number },
    lng: { type: Number },
  },
  { _id: false }
);

/* ============ main schema ============ */
const BusinessSchema = new mongoose.Schema(
  {
    /* temel */
    name: { type: String, required: true, trim: true, maxlength: 180 },
    type: { type: String, default: "Bilinmiyor", trim: true, maxlength: 80 },

    /* slug / handle */
    slug: { type: String, trim: true, maxlength: 180 },
    handle: { type: String, trim: true, maxlength: 80 }, // '@' YOK, lowercase

    /* instagram */
    instagramUsername: { type: String, trim: true, maxlength: 80 }, // '@kulesapanca' formatında tutulur
    instagramUrl: { type: String, trim: true, maxlength: 300 },

    /* iletişim */
    phone: { type: String, trim: true, maxlength: 32 }, // ana telefon (E.164)
    phones: { type: [String], default: [] },            // E.164’e normalize
    email: { type: String, trim: true, maxlength: 160 },

    /* web */
    website: { type: String, trim: true, maxlength: 300 },
    bookingUrl: { type: String, trim: true, maxlength: 300 },

    /* adres/konum */
    address: { type: String, trim: true, maxlength: 400 },
    city: { type: String, trim: true, maxlength: 120 },
    district: { type: String, trim: true, maxlength: 120 },
    location: { type: LocationSchema, default: {} },

    /* içerik */
    description: { type: String, trim: true, default: "", maxlength: 5000 },
    summary: { type: String, trim: true, default: "", maxlength: 800 },
    features: { type: [String], default: [] },

    /* GALERİ – en fazla 5 */
    gallery: { type: [String], default: [] },

    /* diğer */
    licenceNo: { type: String, trim: true, maxlength: 120 },
    googlePlaceId: { type: String, trim: true, maxlength: 120 },

    verified: { type: Boolean, default: false, index: true },
    status: {
      type: String,
      enum: ["approved", "pending", "rejected"],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
    collation: { locale: "tr", strength: 2 },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    strict: true,
  }
);

/* ============ virtual aliases (frontend uyumu) ============ */
BusinessSchema.virtual("desc")
  .get(function () { return this.description; })
  .set(function (v) { this.description = v; });

BusinessSchema.virtual("photos")
  .get(function () { return this.gallery; })
  .set(function (arr) { this.gallery = arr; });

BusinessSchema.virtual("images")
  .get(function () { return this.gallery; })
  .set(function (arr) { this.gallery = arr; });

/* ============ normalization ============ */
function applyNormalization(doc) {
  // slug
  if (!doc.slug && doc.name) doc.slug = slugify(doc.name);
  if (doc.slug) doc.slug = slugify(doc.slug);

  // instagram
  const ig = normalizeInstagram({
    username: doc.instagramUsername,
    url: doc.instagramUrl,
  });
  doc.instagramUsername = ig.instagramUsername;
  doc.instagramUrl = ig.instagramUrl;
  if (!doc.handle && ig.handle) doc.handle = ig.handle;
  if (doc.handle) doc.handle = String(doc.handle).toLowerCase();

  // phones
  const main = normalizePhone(doc.phone);
  let all = uniqStrArr([main, ...(Array.isArray(doc.phones) ? doc.phones : [])].map(normalizePhone));
  all = all.filter(Boolean);
  doc.phone = main || all[0] || undefined;
  doc.phones = uniqStrArr([doc.phone, ...all]).filter(Boolean);

  // email trim
  if (doc.email) doc.email = clean(doc.email);

  // web
  if (doc.website) doc.website = toHttps(doc.website);
  if (doc.bookingUrl) doc.bookingUrl = toHttps(doc.bookingUrl);

  // features
  if (Array.isArray(doc.features)) {
    doc.features = uniqStrArr(doc.features);
  }

  // gallery (max 5, trim/dedup)
  if (Array.isArray(doc.gallery)) {
    doc.gallery = uniqStrArr(doc.gallery).slice(0, 5);
  }

  // location & üst alan senkronu (tek yön değil; boş olanı doldur)
  if (!doc.location) doc.location = {};
  if (!doc.location.address && doc.address) doc.location.address = doc.address;
  if (!doc.address && doc.location.address) doc.address = doc.location.address;

  if (!doc.location.city && doc.city) doc.location.city = doc.city;
  if (!doc.city && doc.location.city) doc.city = doc.location.city;

  if (!doc.location.district && doc.district) doc.location.district = doc.district;
  if (!doc.district && doc.location.district) doc.district = doc.location.district;
}

BusinessSchema.pre("save", function (next) {
  applyNormalization(this);
  next();
});

BusinessSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  const $set = { ...(update.$set || {}) };
  const $setOnInsert = { ...(update.$setOnInsert || {}) };

  if (Object.keys($set).length) applyNormalization($set);
  if (Object.keys($setOnInsert).length) applyNormalization($setOnInsert);

  this.setUpdate({ ...update, $set, $setOnInsert });
  next();
});

/* ============ statics ============ */
// Güvenli taşıyıcı üret
BusinessSchema.statics.fromPayload = function (payload = {}) {
  const carrier = {
    name: payload.name,
    type: payload.type,
    slug: payload.slug,
    handle: payload.handle,
    instagramUsername: payload.instagramUsername ?? payload.instagram, // esneklik
    instagramUrl: payload.instagramUrl,
    phone: payload.phone,
    phones: payload.phones,
    email: payload.email,
    website: payload.website,
    bookingUrl: payload.bookingUrl,
    address: payload.address,
    city: payload.city,
    district: payload.district,
    location: payload.location,
    description: payload.description ?? payload.desc,
    summary: payload.summary,
    features: payload.features,
    gallery: payload.gallery ?? payload.images ?? payload.photos,
    licenceNo: payload.licenceNo,
    googlePlaceId: payload.googlePlaceId,
    verified: payload.verified,
    status: payload.status,
  };
  applyNormalization(carrier);
  return carrier;
};

// slug/handle/instagramUsername/phone doğal anahtarlarıyla upsert
BusinessSchema.statics.upsertByNaturalKeys = async function (payload = {}) {
  const safe = this.fromPayload(payload);
  const keys = [];
  if (safe.slug) keys.push({ slug: safe.slug });
  if (safe.handle) keys.push({ handle: safe.handle });
  if (safe.instagramUsername) keys.push({ instagramUsername: safe.instagramUsername });
  if (safe.phone) keys.push({ phone: safe.phone });

  const query =
    keys.length > 0 ? { $or: keys } : { name: safe.name }; // son çare: isme göre (zayıf)
  const doc = await this.findOneAndUpdate(
    query,
    { $set: safe, $setOnInsert: { createdAt: new Date() } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc;
};

/* ============ indexes ============ */
// NOT: alan tanımlarında `index:true` kullanmıyoruz; tüm indexler burada.
BusinessSchema.index(
  { slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $exists: true, $ne: "" } } }
);
BusinessSchema.index(
  { handle: 1 },
  { unique: true, partialFilterExpression: { handle: { $exists: true, $ne: "" } } }
);
BusinessSchema.index(
  { instagramUsername: 1 },
  { unique: true, partialFilterExpression: { instagramUsername: { $exists: true, $ne: "" } } }
);
BusinessSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $exists: true, $ne: "" } } }
);
// yardımcılar
BusinessSchema.index({ instagramUrl: 1 });
BusinessSchema.index({ verified: -1, createdAt: -1 });

// Text arama
BusinessSchema.index(
  { name: "text", instagramUsername: "text", handle: "text", phone: "text", address: "text" },
  { weights: { name: 5, instagramUsername: 4, handle: 4, phone: 3, address: 1 } }
);

/* ============ output shaping ============ */
BusinessSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.models.Business ||
  mongoose.model("Business", BusinessSchema);
