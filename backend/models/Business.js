import mongoose from "mongoose";

const BusinessSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },       // İşletme adı
    type: { type: String, default: "Bilinmiyor", trim: true },// İşletme türü (otel, kafe, bungalov, vb.)
    
    instagramUsername: { type: String, index: true, trim: true }, // Instagram kullanıcı adı (@kulesapanca)
    instagramUrl: { type: String, index: true, trim: true },      // Instagram profil URL (https://instagram.com/kulesapanca)
    
    phone: { type: String, index: true, trim: true },         // Telefon numarası
    address: { type: String, trim: true },                    // İşletme adresi
    licenceNo: { type: String, trim: true },                  // Opsiyonel: ruhsat/izin numarası
    
    verified: { type: Boolean, default: true },               // Doğrulama durumu
    status: { type: String, enum: ["approved", "pending", "rejected"], default: "approved" } // Ek kontrol
  },
  { timestamps: true } // createdAt & updatedAt otomatik eklenecek
);

export default mongoose.model("Business", BusinessSchema);
