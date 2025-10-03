import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import Article from "../models/Article.js";
import Page from "../models/Page.js";

/* -------- utils (mevcut utils ile uyumlu) -------- */
const escapeRegex = (s = "") => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const makeSlug = (str = "") =>
  String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* -------- admin guard (businesses.js’teki ile birebir) -------- */
function requireAdmin(req, res, next) {
  try {
    const needed = process.env.ADMIN_KEY;
    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (bearer) {
      try {
        const dec = jwt.verify(bearer, process.env.JWT_SECRET || "change_me");
        if (dec?.role === "admin" || dec?.isAdmin === true) return next();
      } catch {}
    }
    const sent = req.headers["x-admin-key"] || bearer;
    if (needed && sent && String(sent) === String(needed)) return next();
    return res.status(401).json({ success: false, message: "Yetkisiz" });
  } catch {
    return res.status(401).json({ success: false, message: "Yetkilendirme hatası" });
  }
}

const router = express.Router();

/* ===================== PUBLIC ===================== */

// Featured articles (Planlayın kartları)
router.get("/articles/featured", async (req, res) => {
  try {
    const { place = "", limit = "3" } = req.query;
    const q = { status: "published", pinned: true };
    if (place) q.place = { $regex: new RegExp(escapeRegex(place), "i") };

    const items = await Article.find(q)
      .sort({ order: 1, datePublished: -1, _id: -1 })
      .limit(Math.min(12, Math.max(1, parseInt(limit, 10) || 3)))
      .lean();

    res.json({
      success: true,
      items: items.map((a) => ({
        id: a._id,
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        image: a.coverImage || "",
        to: `/blog/${a.slug}`,
        datePublished: a.datePublished || a.createdAt,
        dateModified: a.dateModified || a.updatedAt,
      })),
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "featured_failed", error: e.message });
  }
});

// Public article fetch
router.get("/article/by-slug/:slug", async (req, res) => {
  const slug = makeSlug(req.params.slug || "");
  const art = await Article.findOne({ slug, status: "published" }).lean();
  if (!art) return res.status(404).json({ success: false, message: "not_found" });
  res.json({ success: true, article: art });
});

// Public page fetch (KVKK vb.)
router.get("/page/by-slug/:slug", async (req, res) => {
  const slug = makeSlug(req.params.slug || "");
  const page = await Page.findOne({ slug, status: "published" }).lean();
  if (!page) return res.status(404).json({ success: false, message: "not_found" });
  res.json({ success: true, page });
});

/* ===================== ADMIN (CRUD) ===================== */
// Articles
router.get("/articles", requireAdmin, async (req, res) => {
  const { q = "", place = "", status = "", page = "1", limit = "50" } = req.query;
  const filter = {};
  if (q) filter.$or = [{ title: new RegExp(escapeRegex(q), "i") }, { slug: new RegExp(escapeRegex(q), "i") }];
  if (place) filter.place = new RegExp(escapeRegex(place), "i");
  if (status) filter.status = status;

  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  const [items, total] = await Promise.all([
    Article.find(filter).sort({ updatedAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    Article.countDocuments(filter),
  ]);
  res.json({ success: true, items, total, page: p, limit: l });
});

router.post("/articles", requireAdmin, async (req, res) => {
  const body = { ...req.body };
  if (!body.slug && body.title) body.slug = makeSlug(body.title);
  const created = await new Article(body).save();
  res.json({ success: true, article: created });
});

router.put("/articles/:id", requireAdmin, async (req, res) => {
  const body = { ...req.body };
  if (!body.slug && body.title) body.slug = makeSlug(body.title);
  body.dateModified = new Date();
  const up = await Article.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true }).lean();
  if (!up) return res.status(404).json({ success: false, message: "not_found" });
  res.json({ success: true, article: up });
});

router.delete("/articles/:id", requireAdmin, async (req, res) => {
  const del = await Article.findByIdAndDelete(req.params.id).lean();
  if (!del) return res.status(404).json({ success: false, message: "not_found" });
  res.json({ success: true, message: "deleted" });
});

// Pages (KVKK, Gizlilik, Hakkımızda…)
router.get("/pages", requireAdmin, async (req, res) => {
  const { q = "", page = "1", limit = "50" } = req.query;
  const filter = q ? { $or: [{ title: new RegExp(escapeRegex(q), "i") }, { slug: new RegExp(escapeRegex(q), "i") }] } : {};
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  const [items, total] = await Promise.all([
    Page.find(filter).sort({ updatedAt: -1 }).skip((p - 1) * l).limit(l).lean(),
    Page.countDocuments(filter),
  ]);
  res.json({ success: true, items, total, page: p, limit: l });
});

router.post("/pages", requireAdmin, async (req, res) => {
  const body = { ...req.body };
  if (!body.slug && body.title) body.slug = makeSlug(body.title);
  const created = await new Page(body).save();
  res.json({ success: true, page: created });
});

router.put("/pages/:id", requireAdmin, async (req, res) => {
  const body = { ...req.body };
  if (!body.slug && body.title) body.slug = makeSlug(body.title);
  const up = await Page.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true }).lean();
  if (!up) return res.status(404).json({ success: false, message: "not_found" });
  res.json({ success: true, page: up });
});

router.delete("/pages/:id", requireAdmin, async (req, res) => {
  const del = await Page.findByIdAndDelete(req.params.id).lean();
  if (!del) return res.status(404).json({ success: false, message: "not_found" });
  res.json({ success: true, message: "deleted" });
});

export default router;
