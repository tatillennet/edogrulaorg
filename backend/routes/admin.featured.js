import express from "express";
import Featured from "../models/Featured.js";
import Business from "../models/Business.js";

const DEFAULT_IMG = "/defaults/edogrula-default.webp.png";

/* ------------ helpers ------------- */
function normalizeBusiness(b) {
  if (!b) return null;
  const photo = (Array.isArray(b.gallery) && b.gallery[0]) || b.photo || DEFAULT_IMG;
  return {
    _id: b._id,
    id: b._id,
    slug: b.slug || b._id?.toString(),
    name: b.name || "İsimsiz İşletme",
    address: b.address || "",
    verified: !!b.verified,
    type: b.type || "",
    photo,
    rating: Number(b.rating ?? 0),
    reviewsCount: Number(b.reviewsCount ?? 0),
    googleRating: Number(b.googleRating ?? b.google_rate ?? b.google?.rating ?? 0),
    googleReviewsCount: Number(b.googleReviewsCount ?? b.google_reviews ?? b.google?.reviewsCount ?? 0),
    instagramUsername: b.instagramUsername || b.handle || "",
    instagramUrl: b.instagramUrl || "",
    phone: b.phone || "",
  };
}

/* ============== PUBLIC: /api/featured ============== */
const publicFeaturedRouter = express.Router();

/** GET /api/featured?place=Sapanca&type=bungalov&limit=8 */
publicFeaturedRouter.get("/", async (req, res) => {
  try {
    const place = String(req.query.place || "").trim();
    const type  = String(req.query.type  || "").trim();
    const limit = Math.max(1, Math.min(20, parseInt(req.query.limit || "8", 10)));
    const now = new Date();

    const q = { active: true };
    if (place) q.place = new RegExp(place, "i");
    if (type)  q.type  = new RegExp(type, "i");
    q.$and = [
      { $or: [{ startAt: { $exists: false } }, { startAt: null }, { startAt: { $lte: now } }] },
      { $or: [{ endAt: { $exists: false } }, { endAt: null }, { endAt: { $gte: now } }] },
    ];

    const feats = await Featured.find(q)
      .sort({ order: 1, createdAt: -1 })
      .limit(limit)
      .populate({
        path: "business",
        select:
          "name slug address verified photo gallery rating reviewsCount googleRating googleReviewsCount type instagramUsername handle instagramUrl phone",
      })
      .lean();

    let items = feats.map((f) => normalizeBusiness(f.business)).filter(Boolean);

    // fallback: hiç featured yoksa en iyi işletmeler
    if (items.length === 0) {
      const qb = {};
      if (place) qb.address = { $regex: place, $options: "i" };
      if (type)  qb.type    = { $regex: type,  $options: "i" };
      const top = await Business.find(qb)
        .sort({ rating: -1, reviewsCount: -1, googleRating: -1, createdAt: -1 })
        .limit(limit)
        .lean();
      items = top.map(normalizeBusiness).filter(Boolean);
    }

    return res.json({ success: true, items });
  } catch (e) {
    console.error("featured public error:", e);
    return res.status(500).json({ success: false, message: "FEATURED_PUBLIC_ERROR" });
  }
});

/* ============== ADMIN: /api/admin/featured ============== */
const adminFeaturedRouter = express.Router();

/** GET /api/admin/featured?place=&type= */
adminFeaturedRouter.get("/", async (req, res) => {
  try {
    const place = String(req.query.place || "").trim();
    const type  = String(req.query.type  || "").trim();
    const q = {};
    if (place) q.place = new RegExp(place, "i");
    if (type)  q.type  = new RegExp(type, "i");

    const rows = await Featured.find(q)
      .sort({ place: 1, type: 1, order: 1, createdAt: -1 })
      .populate({ path: "business", select: "name slug address verified photo gallery type" })
      .lean();

    return res.json({ success: true, items: rows });
  } catch (e) {
    console.error("featured admin list error:", e);
    return res.status(500).json({ success: false, message: "FEATURED_LIST_ERROR" });
  }
});

/** POST /api/admin/featured  body: { businessId, place, type, order?, active?, startAt?, endAt? } */
adminFeaturedRouter.post("/", async (req, res) => {
  try {
    const { businessId, place, type, order = 0, active = true, startAt = null, endAt = null } = req.body || {};
    if (!businessId || !place || !type)
      return res.status(400).json({ success: false, message: "businessId, place, type zorunlu" });

    const biz = await Business.findById(businessId).lean();
    if (!biz) return res.status(404).json({ success: false, message: "İşletme bulunamadı" });

    const doc = await Featured.findOneAndUpdate(
      { business: businessId, place, type },
      { $set: { business: businessId, place, type, order, active, startAt, endAt } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.json({ success: true, item: doc });
  } catch (e) {
    console.error("featured admin create error:", e);
    const msg = e?.code === 11000 ? "Aynı kayıt zaten var." : "FEATURED_CREATE_ERROR";
    return res.status(500).json({ success: false, message: msg });
  }
});

/** PUT /api/admin/featured/:id */
adminFeaturedRouter.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const patch = {};
    for (const k of ["place", "type", "order", "active", "startAt", "endAt"]) {
      if (k in req.body) patch[k] = req.body[k];
    }
    if ("businessId" in req.body) patch.business = req.body.businessId;

    const doc = await Featured.findByIdAndUpdate(id, { $set: patch }, { new: true });
    if (!doc) return res.status(404).json({ success: false, message: "Kayıt bulunamadı" });
    return res.json({ success: true, item: doc });
  } catch (e) {
    console.error("featured admin update error:", e);
    return res.status(500).json({ success: false, message: "FEATURED_UPDATE_ERROR" });
  }
});

/** DELETE /api/admin/featured/:id */
adminFeaturedRouter.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const r = await Featured.findByIdAndDelete(id);
    if (!r) return res.status(404).json({ success: false, message: "Kayıt bulunamadı" });
    return res.json({ success: true, removed: true });
  } catch (e) {
    console.error("featured admin delete error:", e);
    return res.status(500).json({ success: false, message: "FEATURED_DELETE_ERROR" });
  }
});

export { publicFeaturedRouter, adminFeaturedRouter };
