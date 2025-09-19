// backend/models/Blacklist.js
import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/* ----------------------- helpers ----------------------- */
function normalizeInstagram({ username, url }) {
  let u = (username || "").trim();
  let link = (url || "").trim();

  // URL'den kullanıcı adı çıkar
  if (link && !u) {
    const m = link.match(/instagram\.com\/(@?[\w\.]+)/i);
    if (m) u = m[1];
  }

  // baştaki @ işaretini at
  u = u.replace(/^@/, "");

  // kullanıcı adı varsa URL üret
  if (!link && u) link = `https://instagram.com/${u}`;

  return { username: u || undefined, url: link || undefined };
}

function normalizePhone(raw) {
  const s = (raw || "").trim();
  if (!s) return undefined;
  try {
    const p = parsePhoneNumberFromString(s, "TR");
    return p?.isValid() ? p.number : s.replace(/[^\d+]/g, "");
  } catch {
    return s.replace(/[^\d+]/g, "");
  }
}

/* ----------------------- schema ----------------------- */
const BlacklistSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    instagramUsername: { type: String, trim: true }, // '@' OLMADAN tutulur (örn: kulesapanca)
    instagramUrl: { type: String, trim: true },
    phone: { type: String, trim: true },             // E.164 (+90...) veya normalize edilmiş rakamlar
    desc: { type: String, trim: true },
  },
  {
    timestamps: true,
    collation: { locale: "tr", strength: 2 },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ----------------------- normalization ----------------------- */
function applyNorm(doc) {
  const { username, url } = normalizeInstagram({
    username: doc.instagramUsername,
    url: doc.instagramUrl,
  });
  doc.instagramUsername = username;
  doc.instagramUrl = url;
  doc.phone = normalizePhone(doc.phone);
}

BlacklistSchema.pre("save", function (next) {
  applyNorm(this);
  next();
});

BlacklistSchema.pre("findOneAndUpdate", function (next) {
  const upd = this.getUpdate() || {};
  if (upd.$set) {
    const carrier = { ...upd.$set };
    applyNorm(carrier);
    upd.$set = carrier;
  }
  if (upd.$setOnInsert) {
    const carrierIns = { ...upd.$setOnInsert };
    applyNorm(carrierIns);
    upd.$setOnInsert = carrierIns;
  }
  this.setUpdate(upd);
  next();
});

/* ----------------------- indexes (TEK YER) ----------------------- */
// NOT: duplicate uyarısı yaşamamak için alan tanımlarında `index:true` KULLANMIYORUZ.
BlacklistSchema.index(
  { instagramUsername: 1 },
  { partialFilterExpression: { instagramUsername: { $exists: true, $ne: "" } } }
);
BlacklistSchema.index(
  { phone: 1 },
  { partialFilterExpression: { phone: { $exists: true, $ne: "" } } }
);
// Listeleme/sıralama için
BlacklistSchema.index({ createdAt: -1 });
// Text arama (koleksiyon başına 1 adet)
BlacklistSchema.index(
  { name: "text", instagramUsername: "text", phone: "text", desc: "text" },
  { weights: { name: 5, instagramUsername: 5, phone: 3, desc: 1 } }
);

/* ----------------------- output ----------------------- */
BlacklistSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.models.Blacklist ||
  mongoose.model("Blacklist", BlacklistSchema);
