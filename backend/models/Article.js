import mongoose from "mongoose";

const ArticleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    excerpt: { type: String, default: "" },         // kart altındaki özet
    content: { type: String, default: "" },        // HTML veya Markdown
    coverImage: { type: String, default: "" },     // kart görseli (opsiyonel)
    place: { type: String, default: "" },          // Sapanca vb. filtre
    tags: [{ type: String }],
    pinned: { type: Boolean, default: false },     // “Planlayın” bölümünde görünür
    status: { type: String, enum: ["draft", "published"], default: "published" },
    order: { type: Number, default: 0 },

    // SEO
    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },

    datePublished: { type: Date },
    dateModified: { type: Date },
  },
  { timestamps: true }
);

// unique:true zaten bir indeks oluşturduğu için bu satır gereksizdi ve kaldırıldı.
// ArticleSchema.index({ slug: 1 }); 

ArticleSchema.index({ place: 1, pinned: 1, status: 1 });

export default mongoose.model("Article", ArticleSchema);