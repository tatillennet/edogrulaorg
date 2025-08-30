import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const router = express.Router();

/* 📌 Report Schema */
const ReportSchema = new mongoose.Schema({
  name: String,
  instagramUsername: String,
  instagramUrl: String,
  phone: String,
  desc: String,
  status: { type: String, default: "pending" } // pending | rejected
}, { timestamps: true });

const Report = mongoose.models.Report || mongoose.model("Report", ReportSchema);

/* 📌 Blacklist Schema */
const BlacklistSchema = new mongoose.Schema({
  name: String,
  instagramUsername: String,
  instagramUrl: String,
  phone: String,
  desc: String,
}, { timestamps: true });

const Blacklist = mongoose.models.Blacklist || mongoose.model("Blacklist", BlacklistSchema);

/* 🔒 Admin kontrolü */
const requireAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Yetkisiz erişim" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Admin yetkisi gerekli" });
    }
    next();
  } catch {
    return res.status(401).json({ message: "Geçersiz token" });
  }
};

/* ---------------------------
   📌 Yeni ihbar oluşturma (herkese açık)
---------------------------- */
router.post("/", async (req, res) => {
  try {
    const rep = new Report(req.body);
    await rep.save();
    res.status(201).json({ success: true, message: "İhbar alındı", report: rep });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ---------------------------
   📌 Admin tüm ihbarları listeler
---------------------------- */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 });
    res.json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ---------------------------
   📌 Admin ihbarı onaylar → Blacklist’e taşır ve Report’tan siler
---------------------------- */
router.post("/:id/approve", requireAdmin, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: "İhbar bulunamadı" });

    // ✅ Blacklist’e ekle
    const black = new Blacklist({
      name: report.name,
      instagramUsername: report.instagramUsername,
      instagramUrl: report.instagramUrl,
      phone: report.phone,
      desc: report.desc
    });
    await black.save();

    // ✅ Report tablosundan tamamen sil
    await Report.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: "İhbar Blacklist’e taşındı", blacklist: black });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ---------------------------
   📌 Admin ihbarı reddeder
---------------------------- */
router.post("/:id/reject", requireAdmin, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: "İhbar bulunamadı" });

    report.status = "rejected";
    await report.save();

    res.json({ success: true, message: "İhbar reddedildi" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ---------------------------
   📌 Admin ihbarı tamamen siler
---------------------------- */
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await Report.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "İhbar silindi" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ---------------------------
   📌 Blacklist listeleme
---------------------------- */
router.get("/blacklist/all", requireAdmin, async (req, res) => {
  try {
    const list = await Blacklist.find().sort({ createdAt: -1 });
    res.json({ success: true, blacklist: list });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ---------------------------
   📌 Blacklist düzenle
---------------------------- */
router.put("/blacklist/:id", requireAdmin, async (req, res) => {
  try {
    const updated = await Blacklist.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: "Blacklist kaydı bulunamadı" });
    res.json({ success: true, message: "Blacklist kaydı güncellendi", blacklist: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

/* ---------------------------
   📌 Blacklist sil
---------------------------- */
router.delete("/blacklist/:id", requireAdmin, async (req, res) => {
  try {
    await Blacklist.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Blacklist kaydı silindi" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Hata oluştu", error: err.message });
  }
});

export default router;
