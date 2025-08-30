import express from "express";
import jwt from "jsonwebtoken";
import VerificationRequest from "../models/VerificationRequest.js";
import Business from "../models/Business.js";

const router = express.Router();

/* ------------------------------
   ✅ Kullanıcı başvuru gönderir
-------------------------------*/
router.post("/", async (req, res) => {
  try {
    const request = new VerificationRequest(req.body);
    await request.save();

    return res.status(201).json({
      success: true,
      message: "Başvurunuz alınmıştır. En kısa sürede incelenecektir.",
      requestId: request._id,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Bir hata oluştu",
      error: err.message,
    });
  }
});

/* ------------------------------
   🔒 Admin Middleware
-------------------------------*/
const requireAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return res.status(401).json({ success: false, message: "Yetkisiz erişim" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "Admin yetkisi gerekli" });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Geçersiz token",
      error: err.message,
    });
  }
};

/* ------------------------------
   📋 Admin başvuruları listeler
   → pending / approved / rejected
-------------------------------*/
router.get("/", requireAdmin, async (req, res) => {
  try {
    const pending = await VerificationRequest.find({ status: "pending" }).sort({ createdAt: -1 });
    const approved = await VerificationRequest.find({ status: "approved" }).sort({ createdAt: -1 });
    const rejected = await VerificationRequest.find({ status: "rejected" }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      pending,
      approved,
      rejected,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Bir hata oluştu",
      error: err.message,
    });
  }
});

/* ------------------------------
   ✅ Başvuru Onaylama
   - İşletmeyi Business tablosuna ekler
   - Başvuru durumunu "approved" yapar
-------------------------------*/
router.post("/:id/approve", requireAdmin, async (req, res) => {
  try {
    const request = await VerificationRequest.findById(req.params.id);
    if (!request)
      return res.status(404).json({ success: false, message: "Başvuru bulunamadı" });

    // ✅ İşletmeye doğru alanları kaydet
    const business = new Business({
      name: request.name,
      type: request.type || req.body.type || "Bilinmiyor", // Başvuruda varsa onu al
      instagramUsername: request.instagramUsername,
      instagramUrl: request.instagramUrl,
      phone: request.phone,
      address: request.address,
    });
    await business.save();

    // ✅ Başvuru durumunu güncelle
    request.status = "approved";
    await request.save();

    return res.json({
      success: true,
      message: "Başvuru onaylandı ve işletme sisteme eklendi",
      business,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Bir hata oluştu",
      error: err.message,
    });
  }
});

/* ------------------------------
   ❌ Başvuru Reddetme
   - Durumu "rejected" yapar
-------------------------------*/
router.post("/:id/reject", requireAdmin, async (req, res) => {
  try {
    const request = await VerificationRequest.findById(req.params.id);
    if (!request)
      return res.status(404).json({ success: false, message: "Başvuru bulunamadı" });

    request.status = "rejected";
    await request.save();

    return res.json({
      success: true,
      message: "Başvuru reddedildi",
      request,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Bir hata oluştu",
      error: err.message,
    });
  }
});

export default router;
