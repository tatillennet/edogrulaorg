import express from "express";
import Business from "../models/Business.js";
import Blacklist from "../models/Blacklist.js"; // ⚠️ Blacklist modelini ekledik
import jwt from "jsonwebtoken";

const router = express.Router();

/* ------------------------------
   ✅ Auth Middleware
-------------------------------*/
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "No token" });

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

/* ------------------------------
   🔍 İşletme Arama
   - Business tablosu (verified işletmeler)
   - Blacklist tablosu (dolandırıcı işletmeler)
-------------------------------*/
router.get("/search", async (req, res) => {
  try {
    let q = req.query.q?.trim() || "";

    // Instagram URL normalization
    if (q.includes("instagram.com")) {
      q = q
        .replace("https://", "")
        .replace("http://", "")
        .replace("www.", "")
        .replace("instagram.com/", "")
        .replace(/\/$/, ""); // sondaki "/" işaretini sil
    }

    // ✅ Önce doğrulanmış işletmelerde ara
    const business = await Business.findOne({
      $or: [
        { name: new RegExp(q, "i") },
        { instagramUsername: new RegExp(q, "i") },
        { instagramUrl: new RegExp(q, "i") },
        { phone: new RegExp(q, "i") }
      ]
    });

    if (business) {
      return res.json({ status: "verified", business });
    }

    // ⚠️ Eğer Business’te yoksa Blacklist içinde ara
    const blacklisted = await Blacklist.findOne({
      $or: [
        { name: new RegExp(q, "i") },
        { instagramUsername: new RegExp(q, "i") },
        { instagramUrl: new RegExp(q, "i") },
        { phone: new RegExp(q, "i") }
      ]
    });

    if (blacklisted) {
      return res.json({ status: "blacklist", business: blacklisted });
    }

    // ❌ Hiçbir yerde bulunamadı
    return res.json({ status: "not_found" });

  } catch (err) {
    return res.status(500).json({ success: false, message: "Search error", error: err.message });
  }
});

/* ------------------------------
   📄 Tekil İşletme Getir
   - ID'ye göre Business → yoksa Blacklist
-------------------------------*/
router.get("/:id", async (req, res) => {
  try {
    // Önce normal işletmelerde ara
    let business = await Business.findById(req.params.id);
    if (business) {
      return res.json({ status: "verified", business });
    }

    // Yoksa kara listeyi kontrol et
    let blacklisted = await Blacklist.findById(req.params.id);
    if (blacklisted) {
      return res.json({ status: "blacklist", business: blacklisted });
    }

    // Hiçbirinde bulunamadı
    return res.status(404).json({ status: "not_found", message: "İşletme bulunamadı" });

  } catch (err) {
    return res.status(500).json({ success: false, message: "Detail error", error: err.message });
  }
});

/* ------------------------------
   ➕ Yeni İşletme Ekle
-------------------------------*/
router.post("/", auth, async (req, res) => {
  try {
    const b = new Business(req.body);
    await b.save();
    res.json({ success: true, business: b });
  } catch (err) {
    res.status(500).json({ success: false, message: "Create failed", error: err.message });
  }
});

/* ------------------------------
   📋 Tüm İşletmeleri Listele
-------------------------------*/
router.get("/", auth, async (req, res) => {
  try {
    const list = await Business.find();
    res.json({ success: true, businesses: list });
  } catch (err) {
    res.status(500).json({ success: false, message: "List failed", error: err.message });
  }
});

/* ------------------------------
   ✏️ İşletme Güncelle
-------------------------------*/
router.put("/:id", auth, async (req, res) => {
  try {
    const updated = await Business.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, business: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: "Update failed", error: err.message });
  }
});

/* ------------------------------
   ❌ İşletme Sil
-------------------------------*/
router.delete("/:id", auth, async (req, res) => {
  try {
    await Business.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Delete failed", error: err.message });
  }
});

export default router;
