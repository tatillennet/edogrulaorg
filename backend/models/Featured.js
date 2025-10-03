import mongoose from "mongoose";
const { Schema } = mongoose;

const FeaturedSchema = new Schema(
  {
    place:   { type: String, trim: true, index: true }, // örn: "Sapanca"
    type:    { type: String, trim: true, index: true }, // örn: "bungalov"
    business:{ type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    order:   { type: Number, default: 0 },              // küçük önce
    active:  { type: Boolean, default: true },
    startAt: { type: Date, default: null },             // opsiyonel
    endAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

// Aynı kombinasyon tekil olsun
FeaturedSchema.index({ place: 1, type: 1, business: 1 }, { unique: true });

export default mongoose.model("Featured", FeaturedSchema);
