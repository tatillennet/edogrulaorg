// backend/controllers/admin/applications.js
const mongoose = require('mongoose');
const slugify = require('slugify');

// ⚠️ Bu iki require'ın yolunu SENDEKİ gerçek model yollarına göre düzelt.
// Koleksiyon adın "applyrequests" olduğuna göre model dosyan büyük ihtimalle ApplyRequest.js.
const Application = require('../../models/ApplyRequest');
const Business = require('../../models/Business');

const toSlug = (n) => slugify(n || 'isimsiz', { lower: true, strict: true, locale: 'tr' });

async function uniqueSlug(name, session) {
  const base = toSlug(name);
  const re = new RegExp(`^${base}(?:-(\\d+))?$`, 'i');
  const dupes = await Business.find({ slug: re }).session(session).select('slug').lean();
  if (dupes.length === 0) return base;
  const nums = dupes.map(d => {
    const m = d.slug.match(/-(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  });
  return `${base}-${Math.max(...nums) + 1}`;
}

exports.approveApplication = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const app = await Application.findById(req.params.id).session(session);
    if (!app) return res.status(404).json({ ok:false, message:'Application not found' });

    // Idempotent: zaten business bağlıysa aynı sonucu dön
    if (app.status === 'approved' && app.business) {
      const biz = await Business.findById(app.business).session(session).lean();
      await session.commitTransaction();
      return res.json({ ok:true, message:'Already approved', business: biz });
    }

    // Business oluştur
    const slug = await uniqueSlug(app.businessName, session);
    const [biz] = await Business.create([{
      name: app.businessName?.trim() || 'İsimsiz İşletme',
      slug,
      phone: app.phone,
      instagramUrl: app.website?.includes('instagram.com') ? app.website : undefined,
      verified: true,
      status: 'approved',
      address: app.place || app.address || 'Sapanca',
    }], { session });

    // Başvuruyu güncelle ve bağla
    app.status = 'approved';
    app.business = biz._id;
    await app.save({ session });

    await session.commitTransaction();
    res.json({ ok:true, business: biz });
  } catch (err) {
    await session.abortTransaction();
    if (err.code === 11000) {
      return res.status(409).json({ ok:false, message:'Duplicate slug/business' });
    }
    console.error('approve error:', err);
    res.status(500).json({ ok:false, message: process.env.NODE_ENV==='development' ? err.message : 'Sunucu hatası' });
  } finally {
    session.endSession();
  }
};
