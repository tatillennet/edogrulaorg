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

    email: {
  type: String,
  required: true,
  trim: true,
  lowercase: true,
  maxlength: 254,
  unique: true,   // ✅ ekle
  index: true,    // ✅ ekle
},

    // NOT: select:false -> authenticate sırasında +password ile seçiyoruz
    password: { type: String, required: true, minlength: 6, select: false },

    role: { type: String, enum: ["admin", "user"], default: "user", index: true },

    isVerified: { type: Boolean, default: false, index: true },
    lastLoginAt: { type: Date },

    loginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },

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
  if (!this.password) {
    // Bu dokümanda password seçilmemiş olabilir (select:false)
    return Promise.resolve(false);
  }
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
  if (this.lockedUntil && this.lockedUntil > now) return;

  this.loginAttempts = (this.loginAttempts || 0) + 1;
  if (this.loginAttempts >= maxAttempts) {
    this.lockedUntil = new Date(now.getTime() + lockMinutes * 60 * 1000);
    this.loginAttempts = 0;
  }
  await this.save({ validateBeforeSave: false });
};

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
  // Dönerken gizli alanlar olmadan dönelim
  return await this.findById(user._id);
};

/**
 * Admin seed: Ortam değişkenlerinden admin kullanıcısı oluştur.
 * - ADMIN_EMAIL zorunlu
 * - ADMIN_PASSWORD_HASH varsa direkt kullan
 * - Yoksa ADMIN_PASSWORD'ı COST ile hash'le
 */
UserSchema.statics.ensureAdminSeed = async function () {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!email) return;

  let user = await this.findOne({ email });
  if (user) {
    // varsa rolünü admin'e yükselt
    if (user.role !== "admin") {
      user.role = "admin";
      await user.save({ validateBeforeSave: false });
    }
    return;
  }

  let passwordHash = process.env.ADMIN_PASSWORD_HASH || "";
  if (!passwordHash && process.env.ADMIN_PASSWORD) {
    const salt = await bcrypt.genSalt(COST);
    passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, salt);
  }

  if (!passwordHash) {
    console.warn("[User.ensureAdminSeed] ADMIN_PASSWORD_HASH veya ADMIN_PASSWORD tanımlı değil; admin oluşturulmadı.");
    return;
  }

  await this.create({
    email,
    password: passwordHash, // pre('save') ikinci kez hashlemez çünkü set edilmiyor
    role: "admin",
    isVerified: true,
    name: "Platform Admin",
  });

  console.log(`[User.ensureAdminSeed] Admin kullanıcı oluşturuldu: ${email}`);
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

const User = mongoose.models.User || mongoose.model("User", UserSchema);
export default User;
