import mongoose from "mongoose";

const VerificationRequestSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true }, // ✅ Eksik olan alan eklendi
  instagramUsername: { type: String, required: true },
  instagramUrl: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  email: { type: String, required: true },
  status: { type: String, default: "pending" } // pending, approved, rejected
}, { timestamps: true });

export default mongoose.model("VerificationRequest", VerificationRequestSchema);
