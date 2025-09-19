// backend/routes/businesses.js
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Business from "../models/Business.js";
import Blacklist from "../models/Blacklist.js";

const router = express.Router();

/* ------------------------------ helpers ------------------------------ */
const isObjId = (s) => mongoose.Types.ObjectId.isValid(String(s || ""));
const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);

// basit slug üretici
const makeSlug = (str = "") =>
  String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// instagram handle normalizasyonu
const normHandle = (h = "") => String(h).replace(/^@+/, "");
const normIgUrl = (u = "") => {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `https://instagram.com/${normHandle(u)}`;
};

/* ------------------------------ auth (admin) ------------------------------ */
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

/* ------------------------------ PUBLIC: search ------------------------------ */
// /api/businesses/search?q=...
router.get("/search", async (req, res) => {
  try {
    let q = (req.query.q || "").trim();

    // instagram URL -> handle
    if (/instagram\.com/i.test(q)) {
      q = q
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .replace(/instagram\.com\//i, "")
        .replace(/\/+$/g, "");
    }

    // doğrulanmış işletmeler
    const verified = await Business.find({
      $or: [
        { name: new RegExp(q, "i") },
        { slug: new RegExp(`^${makeSlug(q)}$`, "i") },
        { handle: new RegExp(normHandle(q), "i") },
        { instagramUsername: new RegExp(q, "i") },
        { instagramUrl: new RegExp(q, "i") },
        { phone: new RegExp(q, "i") },
      ],
    })
      .limit(10)
      .lean();

    if (verified.length) {
      return res.json({
        status: "verified",
        business: verified[0],       // ön yüz bu alanı okuyabiliyor
        businesses: verified,        // aynı zamanda liste de veriyoruz
      });
    }

    // kara liste
    const black = await Blacklist.findOne({
      $or: [
        { name: new RegExp(q, "i") },
        { instagramUsername: new RegExp(q, "i") },
        { instagramUrl: new RegExp(q, "i") },
        { phone: new RegExp(q, "i") },
      ],
    }).lean();

    if (black) return res.json({ status: "blacklist", business: black });

    return res.json({ status: "not_found", businesses: [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Search error", error: err.message });
  }
});

/* ------------------------------ PUBLIC: by-slug & by-handle ------------------------------ */
// /api/businesses/by-slug/:slug
router.get("/by-slug/:slug", async (req, res) => {
  try {
    const slug = makeSlug(req.params.slug || "");
    const business = await Business.findOne({ slug }).lean();
    if (!business) return res.status(404).json({ status: "not_found" });
    return res.json({ status: "verified", business });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Detail error", error: err.message });
  }
});

// /api/businesses/handle/:handle (alias)
router.get("/handle/:handle", async (req, res) => {
  try {
    const handle = normHandle(req.params.handle || "");
    const business = await Business.findOne({
      $or: [{ handle: new RegExp(`^${handle}$`, "i") }, { instagramUsername: new RegExp(`^@?${handle}$`, "i") }],
    }).lean();
    if (!business) return res.status(404).json({ status: "not_found" });
    return res.json({ status: "verified", business });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Detail error", error: err.message });
  }
});

/* ------------------------------ PUBLIC: get by id or slug ------------------------------ */
// /api/businesses/:id  (ObjectId ise byId; değilse slug gibi dener)
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (isObjId(id)) {
      const b = await Business.findById(id).lean();
      if (b) return res.json({ status: "verified", business: b });
    }
    // değilse slug/handle dene
    const slug = makeSlug(id);
    const b2 = await Business.findOne({
      $or: [{ slug }, { handle: new RegExp(`^${normHandle(id)}$`, "i") }],
    }).lean();
    if (b2) return res.json({ status: "verified", business: b2 });

    // blacklist fallback (id ise)
    if (isObjId(id)) {
      const bl = await Blacklist.findById(id).lean();
      if (bl) return res.json({ status: "blacklist", business: bl });
    }
    return res.status(404).json({ status: "not_found", message: "İşletme bulunamadı" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Detail error", error: err.message });
  }
});

/* ------------------------------ ADMIN: list ------------------------------ */
// tamamını listeleme – admin
router.get("/", auth, async (_req, res) => {
  try {
    const list = await Business.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, businesses: list });
  } catch (err) {
    res.status(500).json({ success: false, message: "List failed", error: err.message });
  }
});

/* ------------------------------ ADMIN: create ------------------------------ */
router.post("/", auth, async (req, res) => {
  try {
    const body = { ...req.body };

    // slug/handle/instagram normalize
    if (!body.slug && body.name) body.slug = makeSlug(body.name);
    if (body.instagramUsername) body.instagramUsername = `@${normHandle(body.instagramUsername)}`;
    if (body.handle || body.instagramUsername) {
      body.handle = normHandle(body.handle || body.instagramUsername);
    }
    if (body.instagramUrl || body.handle) {
      body.instagramUrl = normIgUrl(body.instagramUrl || body.handle);
    }
    // gallery her ihtimale karşı diziye çek
    body.gallery = toArray(body.gallery);

    const created = await new Business(body).save();
    res.json({ success: true, business: created });
  } catch (err) {
    res.status(500).json({ success: false, message: "Create failed", error: err.message });
  }
});

/* ------------------------------ ADMIN: update ------------------------------ */
router.put("/:id", auth, async (req, res) => {
  try {
    const body = { ...req.body };

    if (!body.slug && body.name) body.slug = makeSlug(body.name);
    if (body.instagramUsername) body.instagramUsername = `@${normHandle(body.instagramUsername)}`;
    if (body.handle || body.instagramUsername) {
      body.handle = normHandle(body.handle || body.instagramUsername);
    }
    if (body.instagramUrl || body.handle) {
      body.instagramUrl = normIgUrl(body.instagramUrl || body.handle);
    }
    if (body.gallery) body.gallery = toArray(body.gallery);

    const updated = await Business.findByIdAndUpdate(req.params.id, body, { new: true });
    res.json({ success: true, business: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: "Update failed", error: err.message });
  }
});

/* ------------------------------ ADMIN: delete ------------------------------ */
router.delete("/:id", auth, async (req, res) => {
  try {
    await Business.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Delete failed", error: err.message });
  }
});

export default router;
