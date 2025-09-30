// backend/models/Blacklist.js
import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/* =========================================
 * Helpers (normalize + guards)
 * ========================================= */
const clean = (s) => (typeof s === "string" ? s.trim() : "");
const toHttps = (u) => {
  const s = clean(u);
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

// **Slug helper function to create URL-friendly strings**
const slugify = (str = "") =>
  clean(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens

// Instagram: @ at, lowercase, url üret
function normalizeInstagram({ username, url }) {
  let u = clean(username).replace(/^@/, "");
  let link = clean(url);

  if (!u && link) {
    const m = link.match(/instagram\.com\/(@?[\w.]+)/i);
    if (m) u = m[1].replace(/^@/, "");
  }
  u = u.toLowerCase();

  if (!link && u) link = `https://instagram.com/${u}`;
  if (link) link = toHttps(link);

  return { username: u || undefined, url: link || undefined };
}

// TR telefon → E.164; olmazsa rakam/+
function normalizePhone(raw) {
  const s = clean(raw);
  if (!s) return undefined;
  try {
    const p = parsePhoneNumberFromString(s, "TR");
    if (p?.isValid?.()) return p.number;
  } catch { /* noop */ }
  const only = s.replace(/[^\d+]/g, "");
  return only || undefined;
}

// Fingerprint üret (tekilleştirme için)
function buildFingerprints({ instagramUsername, phone }) {
  const arr = [];
  if (instagramUsername) arr.push(`ig:${instagramUsername.toLowerCase()}`);
  if (phone) arr.push(`ph:${phone}`);
  return arr;
}

/* =========================================
 * Schema
 * ========================================= */
const BlacklistSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 160 },
    // **NEW: URL-friendly identifier**
    slug: { type: String, trim: true, maxlength: 180 },
    instagramUsername: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 30,
      match: [/^[a-z0-9._]+$/i, "instagramUsername geçersiz"],
    },
    instagramUrl: { type: String, trim: true, maxlength: 300 },
    phone: { type: String, trim: true, maxlength: 32 },
    desc: { type: String, trim: true, maxlength: 2000 },
    fingerprints: {
      type: [String],
      default: void 0,
      select: false,
    },
    isDeleted: { type: Boolean, default: false, index: true, select: false },
    createdBy: { type: String, trim: true, select: false },
    updatedBy: { type: String, trim: true, select: false },
  },
  {
    timestamps: true,
    collation: { locale: "tr", strength: 2 },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    strict: true,
  }
);

/* =========================================
 * Normalization pipeline
 * ========================================= */
function applyNorm(carrier) {
  if (!carrier || typeof carrier !== "object") return;

  if ("name" in carrier) carrier.name = clean(carrier.name) || undefined;
  if ("desc" in carrier) carrier.desc = clean(carrier.desc) || undefined;

  // **UPDATE: Generate slug if name exists and slug doesn't**
  if (carrier.name && !carrier.slug) {
    carrier.slug = slugify(carrier.name);
  }

  const ig = normalizeInstagram({
    username: carrier.instagramUsername ?? carrier.instagram ?? "",
    url: carrier.instagramUrl ?? "",
  });
  carrier.instagramUsername = ig.username;
  carrier.instagramUrl = ig.url;

  carrier.phone = normalizePhone(carrier.phone);

  const fps = buildFingerprints({
    instagramUsername: carrier.instagramUsername,
    phone: carrier.phone,
  });
  carrier.fingerprints = fps.length ? fps : undefined;
}

BlacklistSchema.pre("validate", function (next) {
  applyNorm(this);
  next();
});

BlacklistSchema.pre("findOneAndUpdate", function (next) {
  const upd = this.getUpdate() || {};
  const $set = { ...(upd.$set || {}) };
  const $setOnInsert = { ...(upd.$setOnInsert || {}) };

  if (Object.keys($set).length) applyNorm($set);
  if (Object.keys($setOnInsert).length) applyNorm($setOnInsert);

  const touched =
    "instagramUsername" in $set ||
    "instagramUrl" in $set ||
    "phone" in $set ||
    "instagramUsername" in $setOnInsert ||
    "instagramUrl" in $setOnInsert ||
    "phone" in $setOnInsert;

  if (touched) {
    const carrier = { ...$setOnInsert, ...$set };
    const fps = buildFingerprints({
      instagramUsername: carrier.instagramUsername,
      phone: carrier.phone,
    });
    if (fps.length) $set.fingerprints = fps;
    else $set.fingerprints = undefined;
  }

  const nextUpd = { ...upd, $set, $setOnInsert };
  this.setUpdate(nextUpd);
  next();
});

/* =========================================
 * Indexes
 * ========================================= */
BlacklistSchema.index(
  { slug: 1 },
  { partialFilterExpression: { slug: { $exists: true, $ne: "" } } }
);
BlacklistSchema.index(
  { instagramUsername: 1 },
  { partialFilterExpression: { instagramUsername: { $exists: true, $ne: "" } } }
);
BlacklistSchema.index(
  { phone: 1 },
  { partialFilterExpression: { phone: { $exists: true, $ne: "" } } }
);

BlacklistSchema.index(
  { fingerprints: 1 },
  {
    unique: true,
    partialFilterExpression: { fingerprints: { $exists: true, $type: "array", $ne: [] } },
    name: "uniq_blacklist_identity",
  }
);

BlacklistSchema.index({ createdAt: -1 });

BlacklistSchema.index(
  { name: "text", instagramUsername: "text", phone: "text", desc: "text" },
  { weights: { name: 5, instagramUsername: 5, phone: 3, desc: 1 } }
);

/* =========================================
 * Virtuals & Statics
 * ========================================= */
BlacklistSchema.virtual("instagramHandle").get(function () {
  return this.instagramUsername ? `@${this.instagramUsername}` : undefined;
});

BlacklistSchema.statics.fromPayload = function (payload = {}) {
  const carrier = {
    name: payload.name,
    slug: payload.slug, // **Include slug in payload**
    instagramUsername:
      payload.instagramUsername ?? payload.instagram ?? undefined,
    instagramUrl: payload.instagramUrl,
    phone: payload.phone,
    desc: payload.desc,
  };
  applyNorm(carrier);
  return carrier;
};

BlacklistSchema.statics.upsertByIdentity = async function (payload = {}, audit = {}) {
  const safe = this.fromPayload(payload);
  const query = {};

  const fps = buildFingerprints({
    instagramUsername: safe.instagramUsername,
    phone: safe.phone,
  });

  if (fps.length) {
    query.fingerprints = { $in: fps };
  } else if (safe.name) {
    query.name = safe.name;
  }

  const $set = { ...safe, updatedBy: audit.updatedBy };
  const $setOnInsert = {
    createdBy: audit.createdBy,
  };

  const doc = await this.findOneAndUpdate(
    query,
    { $set, $setOnInsert },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc;
};

/* =========================================
 * Output shaping
 * ========================================= */
BlacklistSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret.fingerprints;
    delete ret.isDeleted;
    delete ret.createdBy;
    delete ret.updatedBy;
    return ret;
  },
});

export default mongoose.models.Blacklist ||
  mongoose.model("Blacklist", BlacklistSchema);