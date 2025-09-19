// backend/models/Report.js
import mongoose from "mongoose";

const ReportSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },                 // şikayet başlığı / işletme adı
    instagramUsername: { type: String, trim: true },    // @kullanici
    instagramUrl: { type: String, trim: true },
    phone: { type: String, trim: true },
    desc: { type: String, trim: true },                 // açıklama / detay
    reporterEmail: { type: String, trim: true, lowercase: true },
    evidenceFiles: [{ type: String }],
  },
  {
    timestamps: true,
    collation: { locale: "tr", strength: 2 },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ----------------------- Indexes (tek yer) ----------------------- */
// Sık filtrelenen alanlar
ReportSchema.index({ reporterEmail: 1 });
ReportSchema.index({ instagramUsername: 1 });
ReportSchema.index({ phone: 1 });

// Listeleme/sıralama
ReportSchema.index({ createdAt: -1 });

// Text arama (koleksiyon başına 1 adet)
ReportSchema.index(
  { name: "text", desc: "text", instagramUsername: "text" },
  { weights: { name: 5, desc: 3, instagramUsername: 2 } }
);

/* ----------------------- Output temizlik ----------------------- */
ReportSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.models.Report || mongoose.model("Report", ReportSchema);
