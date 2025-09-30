// backend/models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

/* ========= Config ========= */
const COST = (() => {
  const n = parseInt(process.env.BCRYPT_COST || "10", 10);
  return Number.isFinite(n) ? Math.min(14, Math.max(8, n)) : 10;
})();

/* ========= Schema ========= */
const UserSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 120 },

    // DİKKAT: Burada unique/index yok; tekil index aşağıda schema.index ile verilecek
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },

    // Parola hassas: select:false
    password: { type: String, required: true, minlength: 6, select: false },

    role: { type: String, enum: ["admin", "user"], default: "user", index: true },

    /* Hesap durumu */
    isVerified: { type: Boolean, default: false, index: true },
    lastLoginAt: { type: Date },

    /* Brute-force koruması */
    loginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },

    /* Token alanları (gizli) */
    emailVerifyToken: { type: String, select: false },
    emailVerifyExpires: { type: Date, select: false },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
  },
  {
    timestamps: true,
    collation: { locale: "tr", strength: 2 },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    strict: true,
  }
);

/* ========= Indexes (TEK YER) ========= */
// Tekil e-posta index’i (boş/eksik olmayan kayıtlar için). Alan üzerinde unique yok!
UserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $exists: true, $ne: "" } } }
);

// Sık sorgular
UserSchema.index({ isVerified: 1, role: 1, createdAt: -1 });

/* ========= Hooks ========= */
UserSchema.pre("save", async function (next) {
  if (this.isModified("email") && this.email) {
    this.email = this.email.trim().toLowerCase();
  }
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(COST);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// findOneAndUpdate ile güncellemelerde de e-posta normalize + parola hash
UserSchema.pre("findOneAndUpdate", async function (next) {
  const upd = this.getUpdate() || {};
  const $set = { ...(upd.$set || {}) };

  if (typeof $set.email === "string") {
    $set.email = $set.email.trim().toLowerCase();
  }
  if (typeof $set.password === "string" && $set.password.length >= 6) {
    const salt = await bcrypt.genSalt(COST);
    $set.password = await bcrypt.hash($set.password, salt);
  }

  this.setUpdate({ ...upd, $set });
  next();
});

/* ========= Methods / Statics ========= */
UserSchema.methods.comparePassword = function (candidate) {
  // Bu methodu çağırırken modeli select('+password') ile çektiğinden emin ol
  return bcrypt.compare(candidate, this.password);
};

UserSchema.methods.markLoginSuccess = async function () {
  this.loginAttempts = 0;
  this.lockedUntil = null;
  this.lastLoginAt = new Date();
  await this.save({ validateBeforeSave: false });
};

UserSchema.methods.markLoginFailure = async function (maxAttempts = 5, lockMinutes = 15) {
  const now = new Date();
  if (this.lockedUntil && this.lockedUntil > now) return; // kilitliyse artırma

  this.loginAttempts = (this.loginAttempts || 0) + 1;
  if (this.loginAttempts >= maxAttempts) {
    this.lockedUntil = new Date(now.getTime() + lockMinutes * 60 * 1000);
    this.loginAttempts = 0;
  }
  await this.save({ validateBeforeSave: false });
};

/**
 * Güvenli oturum açma akışı:
 * - Başarılıysa kullanıcı (parolasız) döndürür
 * - Başarısızsa null
 * - Kilitliyse { lockedUntil } döndürür
 */
UserSchema.statics.authenticate = async function (email, password) {
  const user = await this.findOne({ email: String(email || "").toLowerCase().trim() })
    .select("+password +loginAttempts +lockedUntil");

  if (!user) return null;

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    return { lockedUntil: user.lockedUntil };
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    await user.markLoginFailure();
    return null;
  }

  await user.markLoginSuccess();
  return await this.findById(user._id); // parolasız döndür
};

/* ========= Output shaping ========= */
UserSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.loginAttempts;
    delete ret.lockedUntil;
    delete ret.emailVerifyToken;
    delete ret.emailVerifyExpires;
    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpires;
    return ret;
  },
});

export default mongoose.models.User || mongoose.model("User", UserSchema);
