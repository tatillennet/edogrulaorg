// backend/routes/reviews.js
import express from "express";
import mongoose from "mongoose";
import Review from "../models/Review.js";
import Business from "../models/Business.js";

const router = express.Router();

/* ───────────── Helpers ───────────── */
const isObjId = (s) => mongoose.isValidObjectId(String(s || ""));
const makeSlug = (str = "") =>
  String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const sanitize = (v, max = 400) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const stripTags = (s = "") => s.replace(/<[^>]*>/g, "");

/** id veya slug ile Business bul (yalın ve hafif projection) */
async function findBusiness(idOrSlug) {
  if (!idOrSlug) return null;
  const s = String(idOrSlug);
  if (isObjId(s)) {
    const byId = await Business.findById(s).select("_id name slug").lean();
    if (byId) return byId;
  }
  const slug = makeSlug(s);
  if (!slug) return null;
  return await Business.findOne({ slug }).select("_id name slug").lean();
}

/** Tek aggregation ile meta + items (sayfalı) */
async function getReviewsFor(bizId, { page = 1, limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const [agg] = await Review.aggregate([
    { $match: { business: new mongoose.Types.ObjectId(bizId) } },
    {
      $facet: {
        items: [
          { $sort: { createdAt: -1, _id: -1 } },
          { $skip: skip },
          { $limit: safeLimit },
          {
            $project: {
              _id: 0,
              author: { $ifNull: ["$author", "Kullanıcı"] },
              rating: 1,
              text: { $ifNull: ["$comment", ""] },
              date: "$createdAt",
            },
          },
        ],
        stats: [
          {
            $group: {
              _id: "$business",
              count: { $sum: 1 },
              avg: { $avg: "$rating" },
              h1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
              h2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
              h3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
              h4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
              h5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
            },
          },
        ],
      },
    },
  ]);

  const stats = (agg?.stats && agg.stats[0]) || null;
  const count = stats?.count || 0;
  const avg =
    typeof stats?.avg === "number"
      ? Math.round(stats.avg * 10) / 10 // 1 ondalık
      : null;

  return {
    rating: { average: avg, histogram: {
      1: stats?.h1 || 0, 2: stats?.h2 || 0, 3: stats?.h3 || 0, 4: stats?.h4 || 0, 5: stats?.h5 || 0
    }},
    count,
    reviews: agg?.items || [],
    meta: {
      page: safePage,
      limit: safeLimit,
      pages: count ? Math.ceil(count / safeLimit) : 0,
      total: count,
    },
  };
}

/* ───────────── Basit rate-limit (IP+business başına /dk) ───────────── */
const RATE_LIMIT = Number(process.env.REVIEW_RATE_LIMIT_PER_MIN || 8);
const buckets = new Map(); // key: `${ip}:${bizId}` -> [timestamps]

function allowPost(ip, bizId) {
  const key = `${ip}:${bizId}`;
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < 60_000);
  if (arr.length >= RATE_LIMIT) return false;
  arr.push(now);
  buckets.set(key, arr);
  return true;
}

/* ───────────── Routes ───────────── */
/** GET /api/reviews/for/:idOrSlug */
router.get("/for/:idOrSlug", async (req, res) => {
  try {
    const biz = await findBusiness(req.params.idOrSlug);
    if (!biz) return res.status(200).json({ rating: null, count: 0, reviews: [], meta: { page: 1, limit: 20, pages: 0, total: 0 } });
    const data = await getReviewsFor(biz._id, { page: req.query.page, limit: req.query.limit });
    return res.json({ success: true, business: biz, ...data });
  } catch (e) {
    // frontend kırılmasın diye boş dön
    return res.status(200).json({ rating: null, count: 0, reviews: [], meta: { page: 1, limit: 20, pages: 0, total: 0 } });
  }
});

/** Alias: GET /api/reviews?business=:idOrSlug */
router.get("/", async (req, res) => {
  try {
    const biz = await findBusiness(req.query.business);
    if (!biz) return res.status(200).json({ rating: null, count: 0, reviews: [], meta: { page: 1, limit: 20, pages: 0, total: 0 } });
    const data = await getReviewsFor(biz._id, { page: req.query.page, limit: req.query.limit });
    return res.json({ success: true, business: biz, ...data });
  } catch {
    return res.status(200).json({ rating: null, count: 0, reviews: [], meta: { page: 1, limit: 20, pages: 0, total: 0 } });
  }
});

/** POST /api/reviews  body: { business, rating, comment?, author? } */
router.post("/", async (req, res) => {
  try {
    const biz = await findBusiness(req.body.business);
    if (!biz) return res.status(400).json({ success: false, message: "İşletme bulunamadı" });

    // Rate limit
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || req.connection?.remoteAddress || "ip";
    if (!allowPost(ip, String(biz._id))) {
      return res.status(429).json({ success: false, message: "Lütfen daha sonra tekrar deneyin." });
    }

    // Validasyon
    const ratingNum = Number(req.body.rating);
    if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, message: "Puan 1 ile 5 arasında olmalıdır." });
    }

    const comment = stripTags(sanitize(req.body.comment, 400));
    const author = sanitize(req.body.author, 60) || "Misafir";

    const created = await Review.create({
      business: biz._id,
      rating: Math.round(ratingNum),
      comment,
      author,
    });

    return res.json({
      success: true,
      review: {
        author: created.author || "Kullanıcı",
        rating: created.rating,
        text: created.comment || "",
        date: created.createdAt,
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Bir hata oluştu" });
  }
});

export default router;
