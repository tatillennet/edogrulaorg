// backend/routes/blacklist.js
import express from 'express';
import mongoose from 'mongoose';
import Blacklist from '../models/Blacklist.js';

const router = express.Router();

// GET /api/blacklist/:slug -> URL'den gelen kimlikle tek bir kara liste kaydını bulur
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    // Gelen 'slug' bir MongoDB ID'si olabilir veya metin olabilir. İkisini de arayalım.
    const isObjectId = mongoose.Types.ObjectId.isValid(slug);
    const query = isObjectId ? { $or: [{ _id: slug }, { slug: slug }] } : { slug: slug };

    const blacklistEntry = await Blacklist.findOne(query).lean();

    if (!blacklistEntry) {
      return res.status(404).json({ success: false, message: 'Kara liste kaydı bulunamadı' });
    }

    // Frontend'in beklediği formatta cevabı gönder
    res.json({ success: true, blacklist: blacklistEntry });

  } catch (error) {
    console.error('[GET /api/blacklist/:slug] Hata:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

export default router;