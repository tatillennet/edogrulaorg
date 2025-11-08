// backend/routes/admin/applications.js
import express from "express";
import VerificationRequest from "../../models/VerificationRequest.js";
import { requireAdmin } from "../_helpers/requireAdmin.js";

const router = express.Router();

// ... mevcut liste/bulk/approve vs ...

// ✅ Detay: /api/admin/applications/:id
router.get("/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const doc = await VerificationRequest.findById(id)
    .populate("business", "_id name slug")
    .lean();

  if (!doc) return res.status(404).json({ message: "Başvuru bulunamadı" });

  // toJSON transform’u .lean() ile çalışmadığı için manuel normalize:
  const json = VerificationRequest.hydrate(doc).toJSON();

  // Eski kayıtlar için özet (varsa)
  json._legacy = {
    docCount: Number(doc.docCount || 0),
    imageCount: Number(doc.imageCount || 0),
    folder: doc.folder || undefined,
  };

  return res.json({ application: json });
});

export default router;
