// backend/models/Blacklist.js
import mongoose from "mongoose";

const FingerprintSchema = new mongoose.Schema(
  {
    // örn: "phone", "instagram", "custom"
    type: { type: String, trim: true },
    value: { type: String, trim: true },
    note: { type: String, trim: true },
  },
  { _id: false, timestamps: { createdAt: "createdAt", updatedAt: false } }
);

const BlacklistSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, index: true },
    instagramUsername: { type: String, trim: true, index: true },
    instagramUrl: { type: String, trim: true },
    phone: { type: String, trim: true, index: true },
    desc: { type: String, trim: true },
    fingerprints: { type: [FingerprintSchema], default: [] },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    collection: "blacklists",
    collation: { locale: "tr", strength: 2 },
  }
);

// text arama (opsiyonel)
BlacklistSchema.index({
  name: "text",
  instagramUsername: "text",
  desc: "text",
});

export default mongoose.models.Blacklist ||
  mongoose.model("Blacklist", BlacklistSchema, "blacklists");
