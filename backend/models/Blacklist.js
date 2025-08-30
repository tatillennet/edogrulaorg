import mongoose from "mongoose";

const BlacklistSchema = new mongoose.Schema(
  {
    name: String,
    instagramUsername: String,
    instagramUrl: String,
    phone: String,
    desc: String,
  },
  { timestamps: true }
);

// ✅ Eğer model önceden yüklendiyse yeniden tanımlama
export default mongoose.models.Blacklist || mongoose.model("Blacklist", BlacklistSchema);
