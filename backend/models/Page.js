import mongoose from "mongoose";

const PageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true }, // kvkk, gizlilik, hakkimizda
    content: { type: String, default: "" },           // HTML/Markdown
    status: { type: String, enum: ["draft", "published"], default: "published" },
    order: { type: Number, default: 0 },

    // SEO
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },
    coverImage: { type: String, default: "" },
  },
  { timestamps: true }
);

// unique:true zaten bir indeks oluşturduğu için bu satır gereksizdi ve kaldırıldı.
// PageSchema.index({ slug: 1 });

export default mongoose.model("Page", PageSchema);