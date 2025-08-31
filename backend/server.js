import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import morgan from "morgan";
import bcrypt from "bcryptjs";

import authRoutes from "./routes/auth.js";
import businessRoutes from "./routes/business.js";
import applyRoutes from "./routes/apply.js";   // ✅ doğrulama başvuruları
import reportRoutes from "./routes/report.js"; // ✅ dolandırıcılık ihbarları
import User from "./models/User.js";           // ✅ kullanıcı modeli

dotenv.config();
const app = express();

/* -------------------------
   Middleware
------------------------- */
app.use(cors({
  origin: process.env.CLIENT_URL || "*", // canlıda: https://edogrula.org
  credentials: true
}));
app.use(express.json());
app.use(morgan("dev"));

/* -------------------------
   API Routes
------------------------- */
app.use("/api/auth", authRoutes);
app.use("/api/businesses", businessRoutes);
app.use("/api/apply", applyRoutes);
app.use("/api/report", reportRoutes);

/* -------------------------
   MongoDB Bağlantısı + Admin Kullanıcı Oluşturma
------------------------- */
mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000, // bağlantı sorunu olursa hızlı hata
  })
  .then(async () => {
    console.log("✅ MongoDB Atlas bağlantısı başarılı");

    // 👑 Admin kullanıcı kontrolü
    const adminEmail = "admin@edogrula.org";
    const adminPassword = "287388726Bt.";

    const existingAdmin = await User.findOne({ email: adminEmail });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      await User.create({
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
      });

      console.log("👑 Admin kullanıcı oluşturuldu:", adminEmail);
    } else {
      console.log("👑 Admin kullanıcı zaten mevcut:", adminEmail);
    }

    // 🚀 Server başlat
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => console.error("❌ MongoDB bağlantı hatası:", err.message));
