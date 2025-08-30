import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import morgan from "morgan";

import authRoutes from "./routes/auth.js";
import businessRoutes from "./routes/business.js";
import applyRoutes from "./routes/apply.js";   // ✅ doğrulama başvuruları
import reportRoutes from "./routes/report.js"; // ✅ dolandırıcılık ihbarları

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
   MongoDB Bağlantısı
------------------------- */
mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000, // bağlantı sorunu olursa hızlı hata
  })
  .then(() => {
    console.log("✅ MongoDB Atlas bağlantısı başarılı");
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => console.error("❌ MongoDB bağlantı hatası:", err.message));
