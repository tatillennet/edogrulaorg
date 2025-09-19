import mongoose from "mongoose";

const VerificationCodeSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  code: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now, expires: 300 }, // 5 dk
});

// Aynı e-posta + kod kombinasyonunu tekilleştir (opsiyonel ama faydalı)
VerificationCodeSchema.index({ email: 1, code: 1 }, { unique: true });

export default mongoose.models.VerificationCode || mongoose.model("VerificationCode", VerificationCodeSchema);
