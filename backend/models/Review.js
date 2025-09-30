// backend/models/Review.js
import mongoose from "mongoose";

/* ========== Helpers ========== */
const clean = (s) => (typeof s === "string" ? s.trim() : "");

export class AlreadyReviewedError extends Error {
  constructor(message = "ALREADY_REVIEWED") {
    super(message);
    this.name = "AlreadyReviewedError";
    this.code = "ALREADY_REVIEWED";
    this.status = 409;
  }
}

/* ========== Schema ========== */
const ReviewSchema = new mongoose.Schema(
  {
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },

    comment: {
      type: String,
      maxlength: 400,
      trim: true,
    },

    author: {
      type: String,
      maxlength: 80,
      trim: true, // “Misafir” varsayılanı hook’ta atanıyor
    },

    // Moderasyon / görünürlük
    status: {
      type: String,
      enum: ["visible", "pending", "hidden"],
      default: "visible",
      index: true,
    },

    // Kaynak bilgisi (ileride genişleyebilir)
    source: {
      type: String,
      default: "site",
    },

    // Tekrarlı değerlendirmeyi engellemek için parmak izi (örn. SHA-256 UA+lang+uid)
    fp: {
      type: String,
      trim: true,
      default: undefined,
    },

    // IP karması (opsiyonel, gizli)
    ipHash: {
      type: String,
      default: undefined,
      select: false,
    },

    // Kullanıcı ajanı / bağlamsal meta (opsiyonel)
    ua: { type: String, default: undefined },
    locale: { type: String, default: undefined },
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
ReviewSchema.pre("validate", function (next) {
  // rating’i güvenle sınırla
  if (this.rating != null) {
    const r = Number(this.rating);
    this.rating = Math.min(5, Math.max(1, isFinite(r) ? r : 0));
  }
  next();
});

ReviewSchema.pre("save", function (next) {
  this.comment = clean(this.comment);
  this.author = clean(this.author) || "Misafir";
  this.ua = clean(this.ua);
  this.locale = clean(this.locale);
  if (this.fp) this.fp = this.fp.trim();
  next();
});

ReviewSchema.pre("findOneAndUpdate", function (next) {
  const upd = this.getUpdate() || {};
  const $set = { ...(upd.$set || {}) };

  if ("comment" in $set) $set.comment = clean($set.comment);
  if ("author" in $set) $set.author = clean($set.author) || "Misafir";
  if ("ua" in $set) $set.ua = clean($set.ua);
  if ("locale" in $set) $set.locale = clean($set.locale);
  if ("fp" in $set && $set.fp) $set.fp = String($set.fp).trim();

  this.setUpdate({ ...upd, $set });
  next();
});

/* ========== Indexes ========== */
// Sık kullanım: işletmeye göre ve tarihe göre sıralama
ReviewSchema.index({ business: 1, createdAt: -1 });

// fp verilmişse aynı kullanıcı aynı işletmeye ikinci kez yorum atamasın
ReviewSchema.index(
  { business: 1, fp: 1 },
  {
    unique: true,
    partialFilterExpression: { fp: { $exists: true, $ne: "" } },
  }
);

// Metin araması (raporlama/moderasyon için faydalı)
ReviewSchema.index({ comment: "text", author: "text" });

/* ========== Statics ========== */
/**
 * Özet metrik: { count, avg }
 * Sadece görünür yorumlar üzerinden hesaplar.
 */
ReviewSchema.statics.getSummary = async function (businessId) {
  const _id =
    typeof businessId === "string"
      ? new mongoose.Types.ObjectId(businessId)
      : businessId;

  const agg = await this.aggregate([
    { $match: { business: _id, status: "visible" } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        avg: { $avg: "$rating" },
      },
    },
    { $project: { _id: 0, count: 1, avg: { $round: ["$avg", 2] } } },
  ]);

  return agg[0] || { count: 0, avg: null };
};

/**
 * Güvenli ekleme: fp varsa duplicate’i engeller.
 * Duplicate durumunda AlreadyReviewedError fırlatır.
 */
ReviewSchema.statics.safeCreate = async function (payload = {}) {
  try {
    const doc = await this.create({
      business: payload.business,
      rating: payload.rating,
      comment: payload.comment,
      author: payload.author,
      status: payload.status || "visible",
      source: payload.source || "site",
      fp: payload.fp || undefined,
      ipHash: payload.ipHash || undefined,
      ua: payload.ua,
      locale: payload.locale,
    });
    return doc;
  } catch (err) {
    // benzersiz kısıt ihlali (duplicate key) => fp ile daha önce eklenmiş
    if (err?.code === 11000) throw new AlreadyReviewedError();
    throw err;
  }
};

/* ========== Output shaping ========== */
ReviewSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.fp;
    delete ret.ipHash;
    return ret;
  },
});

export default mongoose.models.Review || mongoose.model("Review", ReviewSchema);
