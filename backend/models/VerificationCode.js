// backend/models/VerificationCode.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * BCRYPT maliyeti: OTP için 8-10 makul. (Üst sınır 14)
 * .env → BCRYPT_COST_OTP=8
 */
const COST = (() => {
  const n = parseInt(process.env.BCRYPT_COST_OTP || "8", 10);
  return Number.isFinite(n) ? Math.min(14, Math.max(6, n)) : 8;
})();

/**
 * Yardımcılar
 */
const normEmail = (e) => String(e || "").trim().toLowerCase();

function genNumericCode(len = 6) {
  const L = Math.min(8, Math.max(4, Number(len) || 6)); // 4–8 arası
  let out = "";
  for (let i = 0; i < L; i++) out += crypto.randomInt(0, 10);
  return out;
}

/**
 * Şema
 * - Kodun kendisi tutulmaz, sadece hash'i tutulur.
 * - Tek aktif kod politikası: issue çağrısında aynı (email,purpose) için öncekiler silinir.
 * - TTL index: expiresAt geçtiğinde Mongo otomatik temizler.
 */
const VerificationCodeSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },

    // Amaç: e-posta doğrulama, login, şifre sıfırlama, 2FA...
    purpose: {
      type: String,
      enum: ["verify_email", "login", "reset_password", "2fa"],
      default: "verify_email",
      index: true,
    },

    // Kod HASH'i (ham kod asla tutulmaz)
    codeHash: { type: String, required: true, select: false },

    // Durum / sınırlar
    attempts: { type: Number, default: 0, select: false },
    usedAt: { type: Date, default: null, index: true },

    // Yaşam süresi: doc başına esnek TTL
    expiresAt: { type: Date, required: true },

    // Telemetri / oran sınırlama yardımcıları (opsiyonel)
    ip: { type: String, trim: true },
    ua: { type: String, trim: true },
    fp: { type: String, trim: true },
  },
  {
    timestamps: true,
    collation: { locale: "tr", strength: 2 },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    strict: true,
  }
);

/* ===== Indexes ===== */
// TTL: expiresAt alanına göre otomatik düşür (expireAfterSeconds: 0 => doğrudan alanı kullan)
VerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Sık sorgu paterni: son oluşturulan aktif kayıt
VerificationCodeSchema.index({ email: 1, purpose: 1, createdAt: -1 });

/* ===== Instance Helpers ===== */
VerificationCodeSchema.methods.isExpired = function () {
  return this.expiresAt && this.expiresAt < new Date();
};

/* ===== Statics ===== */

/**
 * Yeni kod üretir (hash’ler), aynı (email,purpose) için önceki kodları kaldırır
 * ve HAM kodu geri döndürür.
 * @returns {Promise<{doc: any, code: string, ttlSeconds: number}>}
 */
VerificationCodeSchema.statics.issue = async function ({
  email,
  purpose = "verify_email",
  ttlSeconds = 300,      // 5 dk
  codeLength = 6,        // 6 haneli
  meta = {},             // { ip, ua, fp }
} = {}) {
  const em = normEmail(email);
  const ttl = Math.max(30, Math.min(3600, Number(ttlSeconds) || 300)); // 30sn–60dk
  const code = genNumericCode(codeLength);
  const codeHash = await bcrypt.hash(code, COST);
  const expiresAt = new Date(Date.now() + ttl * 1000);

  // Tek aktif kod politikası: aynı amaçtaki eski kayıtları temizle
  await this.deleteMany({ email: em, purpose });

  const doc = await this.create({
    email: em,
    purpose,
    codeHash,
    expiresAt,
    ip: meta.ip,
    ua: meta.ua,
    fp: meta.fp,
  });

  return { doc, code, ttlSeconds: ttl };
};

/**
 * Kodu doğrular; başarıda tüketir (usedAt set) ve kalan deneme sayısını korur.
 * @returns {Promise<{ok:boolean, reason?:string, attempts?:number, doc?:any}>}
 */
VerificationCodeSchema.statics.verify = async function ({
  email,
  purpose = "verify_email",
  code,
  maxAttempts = 5,
} = {}) {
  const em = normEmail(email);
  const now = new Date();

  // En son kaydı getir (aktif olan)
  const rec = await this.findOne({ email: em, purpose })
    .sort({ createdAt: -1 })
    .select("+codeHash +attempts");

  if (!rec) return { ok: false, reason: "not_found" };
  if (rec.usedAt) return { ok: false, reason: "used" };
  if (rec.expiresAt <= now) return { ok: false, reason: "expired" };
  if ((rec.attempts || 0) >= maxAttempts) return { ok: false, reason: "locked" };

  const match = await bcrypt.compare(String(code || ""), rec.codeHash);
  if (!match) {
    rec.attempts = (rec.attempts || 0) + 1;
    await rec.save({ validateBeforeSave: false });
    return { ok: false, reason: "mismatch", attempts: rec.attempts };
  }

  rec.usedAt = new Date();
  await rec.save({ validateBeforeSave: false });
  return { ok: true, doc: rec };
};

/* ===== Output shaping ===== */
VerificationCodeSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.codeHash;
    delete ret.attempts;
    return ret;
  },
});

export default mongoose.models.VerificationCode ||
  mongoose.model("VerificationCode", VerificationCodeSchema);
