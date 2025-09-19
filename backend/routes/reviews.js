import express from "express";
import mongoose from "mongoose";
import Review from "../models/Review.js";
import Business from "../models/Business.js";

const router = express.Router();

/** ortaktır: id veya slug ile Business bul */
async function findBusiness(idOrSlug) {
  if (!idOrSlug) return null;
  if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
    const byId = await Business.findById(idOrSlug);
    if (byId) return byId;
  }
  return await Business.findOne({ slug: idOrSlug }) || null;
}

/** rating + listeyi normalize ederek döner */
async function buildResponse(bizId) {
  const reviews = await Review.find({ business: bizId }).sort({ createdAt: -1 }).limit(50);
  const count = await Review.countDocuments({ business: bizId });
  const avgAgg = await Review.aggregate([
    { $match: { business: new mongoose.Types.ObjectId(bizId) } },
    { $group: { _id: null, avg: { $avg: "$rating" } } }
  ]);
  const rating = avgAgg[0]?.avg || null;

  return {
    rating,
    count,
    reviews: reviews.map(r => ({
      author: r.author || "Kullanıcı",
      rating: r.rating,
      text: r.comment || "",
      date: r.createdAt
    }))
  };
}

/** GET /api/businesses/:idOrSlug/reviews */
router.get("/for/:idOrSlug", async (req, res) => {
  try {
    const biz = await findBusiness(req.params.idOrSlug);
    if (!biz) return res.status(200).json({ rating: null, count: 0, reviews: [] }); // 404 yerine boş dön
    const resp = await buildResponse(biz._id);
    return res.json(resp);
  } catch (e) {
    return res.status(200).json({ rating: null, count: 0, reviews: [] }); // asla 500 atma
  }
});

/** Alias: /api/businesses/:idOrSlug/reviews */
router.get("/:idOrSlug", async (req, res) => {
  req.params.idOrSlug && (req.url = `/for/${req.params.idOrSlug}`);
  return router.handle(req, res);
});

/** Alias: GET /api/reviews?business=:idOrSlug */
router.get("/", async (req, res) => {
  try {
    const biz = await findBusiness(req.query.business);
    if (!biz) return res.status(200).json({ rating: null, count: 0, reviews: [] });
    const resp = await buildResponse(biz._id);
    return res.json(resp);
  } catch {
    return res.status(200).json({ rating: null, count: 0, reviews: [] });
  }
});

/** POST /api/reviews { business, rating, comment } */
router.post("/", async (req, res) => {
  try {
    const biz = await findBusiness(req.body.business);
    if (!biz) return res.status(400).json({ success: false, message: "Business bulunamadı" });
    const r = await Review.create({
      business: biz._id,
      rating: Number(req.body.rating),
      comment: req.body.comment || "",
      author: req.user?.name || "Misafir"
    });
    return res.json({ success: true, review: r });
  } catch (e) {
    return res.status(400).json({ success: false, message: "Geçersiz veri" });
  }
});

export default router;
