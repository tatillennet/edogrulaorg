// backend/routes/businesses.js
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import Business from "../models/Business.js";
import Blacklist from "../models/Blacklist.js";

const router = express.Router();

/* --------------------------------- utils --------------------------------- */
const isObjId = (s) => mongoose.isValidObjectId(String(s || ""));
const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);

// slug
const makeSlug = (str = "") =>
  String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// instagram
const normHandle = (h = "") => String(h || "").trim().replace(/^@+/, "");
const normIgUrl = (u = "") => {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `https://instagram.com/${normHandle(u)}`;
};

// phone (E.164, TR varsayılan)
function normPhone(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    const p = parsePhoneNumberFromString(s, "TR");
    if (p?.isValid()) return p.number; // +90...
  } catch {}
  return s.replace(/[^\d+]/g, "");
}

const escapeRegex = (s = "") => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* -------------------------- classify incoming query ----------------------- */
function classifyQuery(qRaw = "", hintedType = "") {
  const q = String(qRaw || "").trim();
  if (!q) return { ok: false, reason: "empty" };

  const igUrlRe = /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\/([A-Za-z0-9._]{1,30})(\/)?(\?.*)?$/i;
  const igUserRe = /^@?([A-Za-z0-9._]{1,30})$/;
  const phoneRe = /^\+?[0-9 ()\-\.]{10,20}$/;
  const siteRe = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}([:/?#].*)?$/i;

  const type = String(hintedType || "").toLowerCase();

  if (type === "ig_url" && igUrlRe.test(q)) {
    const username = q.replace(igUrlRe, "$4");
    return { ok: true, type: "ig_url", value: `https://instagram.com/${username}`, username };
  }
  if (type === "ig_username" && igUserRe.test(q)) {
    const username = q.replace(/^@/, "");
    return { ok: true, type: "ig_username", value: username, username };
  }
  if (type === "phone" && phoneRe.test(q)) {
    const e164 = normPhone(q);
    return { ok: true, type: "phone", value: e164 };
  }
  if (type === "website" && siteRe.test(q)) {
    const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    return { ok: true, type: "website", value: url };
  }

  // Otomatik
  if (igUrlRe.test(q)) {
    const username = q.replace(igUrlRe, "$4");
    return { ok: true, type: "ig_url", value: `https://instagram.com/${username}`, username };
  }
  if (igUserRe.test(q)) {
    const username = q.replace(/^@/, "");
    return { ok: true, type: "ig_username", value: username, username };
  }
  if (siteRe.test(q)) {
    const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    return { ok: true, type: "website", value: url };
  }
  if (phoneRe.test(q)) {
    const e164 = normPhone(q);
    return { ok: true, type: "phone", value: e164 };
  }

  // plain text → name/slug/handle denenecek
  return { ok: true, type: "text", value: q };
}

/* ----------------------------- tiny in-memory cache ----------------------------- */
// Basit, süreç içi, TTL cache (prod’da Redis tercih edin)
const CACHE_TTL = Number(process.env.BUSINESS_SEARCH_TTL_MS || 15_000); // 15 sn
const _cache = new Map(); // key -> { ts, data }
const cacheKey = (q, type, limit) => `search|${type}|${q}|${limit}`;
function cacheGet(key) {
  const rec = _cache.get(key);
  if (!rec) return null;
  if (Date.now() - rec.ts > CACHE_TTL) {
    _cache.delete(key);
    return null;
  }
  return rec.data;
}
function cacheSet(key, data) {
  _cache.set(key, { ts: Date.now(), data });
}

/* ---------------------------------- admin auth --------------------------------- */
// JWT (payload.role === "admin") veya ADMIN_KEY ile erişim
function requireAdmin(req, res, next) {
  try {
    const needed = process.env.ADMIN_KEY;
    // JWT
    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (bearer) {
      try {
        const dec = jwt.verify(bearer, process.env.JWT_SECRET || "change_me");
        if (dec?.role === "admin" || dec?.isAdmin === true) return next();
      } catch {}
    }
    // ADMIN_KEY
    const sent = req.headers["x-admin-key"] || bearer;
    if (needed && sent && String(sent) === String(needed)) return next();

    return res.status(401).json({ success: false, message: "Yetkisiz" });
  } catch (e) {
    return res.status(401).json({ success: false, message: "Yetkilendirme hatası" });
  }
}

/* ------------------------------ PUBLIC: /search ------------------------------ */
/**
 * GET /api/businesses/search?q=...&type=ig_url|ig_username|phone|website|text
 * Döner:
 *  - { status:"verified", business, businesses:[...] }
 *  - { status:"blacklist", business }
 *  - { status:"not_found", businesses:[] }
 */
router.get("/search", async (req, res) => {
  try {
    const raw = String(req.query.q || "").trim();
    const hintedType = String(req.query.type || "");
    const limit = Math.max(1, Math.min(+req.query.limit || 10, 25));

    const cls = classifyQuery(raw, hintedType);
    if (!cls.ok) {
      return res.json({ success: true, status: "not_found", reason: cls.reason, businesses: [] });
    }

    const key = cacheKey(cls.value, cls.type, limit);
    const cached = cacheGet(key);
    if (cached) return res.json(cached);

    // normalize’lar
    const qText = String(cls.value || "").trim();
    const qSlug = makeSlug(qText);
    const qHandle = normHandle(cls.username || qText);
    const rxAny = new RegExp(escapeRegex(qText), "i");
    const rxSlugExact = new RegExp(`^${escapeRegex(qSlug)}$`, "i");
    const rxHandleExact = new RegExp(`^${escapeRegex(qHandle)}$`, "i");
    const rxIgUser = new RegExp(`^@?${escapeRegex(qHandle)}$`, "i");
    const phone = cls.type === "phone" ? normPhone(qText) : "";

    // --- 1) Verified işletmeler
    const or = [{ name: rxAny }, { slug: rxSlugExact }, { handle: rxHandleExact }, { instagramUsername: rxIgUser }];

    if (cls.type === "ig_url" || cls.type === "website" || cls.type === "text") {
      or.push({ instagramUrl: rxAny }, { website: rxAny });
    }
    if (cls.type === "phone") {
      if (phone) or.push({ phone: new RegExp(escapeRegex(phone), "i") });
      // kullanıcı farklı format girmiş olabilir; digits-only ile kaba arama:
      const digits = phone.replace(/\D/g, "");
      if (digits) or.push({ phone: new RegExp(digits.slice(-10)) }); // son 10 haneye bakan match
    }

    const verified = await Business.find({ $or: or }).limit(limit).lean();

    if (verified.length) {
      const payload = { success: true, status: "verified", business: verified[0], businesses: verified };
      cacheSet(key, payload);
      return res.json(payload);
    }

    // --- 2) Blacklist
    const blOr = [{ name: rxAny }, { instagramUsername: rxIgUser }, { instagramUrl: rxAny }];
    if (phone) blOr.push({ phone: new RegExp(escapeRegex(phone), "i") });

    const black = await Blacklist.findOne({ $or: blOr }).lean();
    if (black) {
      const payload = { success: true, status: "blacklist", business: black };
      cacheSet(key, payload);
      return res.json(payload);
    }

    const payload = { success: true, status: "not_found", businesses: [] };
    cacheSet(key, payload);
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ success: false, status: "error", message: "Search error", error: err.message });
  }
});

/* ------------------------------ PUBLIC: by-slug ------------------------------ */
/**
 * GET /api/businesses/by-slug/:slug
 */
router.get("/by-slug/:slug", async (req, res) => {
  try {
    const slug = makeSlug(req.params.slug || "");
    if (!slug) return res.status(400).json({ success: false, status: "error", message: "Geçersiz slug" });

    const business = await Business.findOne({ slug }).lean();
    if (!business) return res.status(404).json({ success: true, status: "not_found" });

    return res.json({ success: true, status: "verified", business });
  } catch (err) {
    return res.status(500).json({ success: false, status: "error", message: "Detail error", error: err.message });
  }
});

/* ------------------------------ PUBLIC: by-handle ------------------------------ */
/**
 * GET /api/businesses/handle/:handle
 */
router.get("/handle/:handle", async (req, res) => {
  try {
    const handle = normHandle(req.params.handle || "");
    if (!handle) return res.status(400).json({ success: false, status: "error", message: "Geçersiz handle" });

    const rxHandleExact = new RegExp(`^${escapeRegex(handle)}$`, "i");

    const business = await Business.findOne({
      $or: [{ handle: rxHandleExact }, { instagramUsername: new RegExp(`^@?${escapeRegex(handle)}$`, "i") }],
    }).lean();

    if (!business) return res.status(404).json({ success: true, status: "not_found" });
    return res.json({ success: true, status: "verified", business });
  } catch (err) {
    return res.status(500).json({ success: false, status: "error", message: "Detail error", error: err.message });
  }
});

/* ------------------------------ PUBLIC: get by id/slug/handle ------------------------------ */
/**
 * GET /api/businesses/:id
 * - id ObjectId ise byId
 * - değilse slug/handle dene
 * - eğer id ObjectId ve Business bulunamazsa Blacklist’e bak
 */
router.get("/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");

    if (isObjId(id)) {
      const b = await Business.findById(id).lean();
      if (b) return res.json({ success: true, status: "verified", business: b });
    }

    // değilse slug/handle
    const slug = makeSlug(id);
    const handle = normHandle(id);
    const rxHandleExact = new RegExp(`^${escapeRegex(handle)}$`, "i");

    const b2 = await Business.findOne({
      $or: [{ slug }, { handle: rxHandleExact }, { instagramUsername: new RegExp(`^@?${escapeRegex(handle)}$`, "i") }],
    }).lean();
    if (b2) return res.json({ success: true, status: "verified", business: b2 });

    // blacklist fallback (objId ise)
    if (isObjId(id)) {
      const bl = await Blacklist.findById(id).lean();
      if (bl) return res.json({ success: true, status: "blacklist", business: bl });
    }

    return res.status(404).json({ success: true, status: "not_found", message: "İşletme bulunamadı" });
  } catch (err) {
    return res.status(500).json({ success: false, status: "error", message: "Detail error", error: err.message });
  }
});

/* -------------------------------- ADMIN: list -------------------------------- */
/**
 * GET /api/businesses
 * Tüm kayıtlar — admin
 * Query: q, page, limit, sort, fields
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(+req.query.limit || 50, 200));
    const page = Math.max(1, +req.query.page || 1);
    const skip = (page - 1) * limit;

    // sort=-createdAt,name → {createdAt:-1, name:1}
    const sort = {};
    const sortParam = String(req.query.sort || "-createdAt");
    for (const part of sortParam.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (part.startsWith("-")) sort[part.slice(1)] = -1;
      else sort[part] = 1;
    }

    // fields=name,email → "name email"
    let fields;
    if (req.query.fields) {
      fields = String(req.query.fields)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ");
    }

    // basit arama
    const q = String(req.query.q || "").trim();
    const rx = q ? new RegExp(escapeRegex(q), "i") : null;
    const filter = rx
      ? {
          $or: [
            { name: rx },
            { slug: rx },
            { handle: rx },
            { instagramUsername: rx },
            { instagramUrl: rx },
            { phone: rx },
            { email: rx },
            { website: rx },
            { address: rx },
          ],
        }
      : {};

    const query = Business.find(filter).sort(sort).skip(skip).limit(limit).lean();
    if (fields) query.select(fields);

    const [items, total] = await Promise.all([query, Business.countDocuments(filter)]);
    res.json({ success: true, businesses: items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: "List failed", error: err.message });
  }
});

/* ------------------------------- ADMIN: create ------------------------------- */
/**
 * POST /api/businesses
 */
router.post("/", requireAdmin, async (req, res) => {
  try {
    const body = { ...req.body };

    if (!body.slug && body.name) body.slug = makeSlug(body.name);

    if (body.instagramUsername) body.instagramUsername = `@${normHandle(body.instagramUsername)}`;
    if (body.handle || body.instagramUsername) body.handle = normHandle(body.handle || body.instagramUsername);
    if (body.instagramUrl || body.handle) body.instagramUrl = normIgUrl(body.instagramUrl || body.handle);

    if (body.phone) body.phone = normPhone(body.phone);
    if (body.phones) body.phones = toArray(body.phones).map(normPhone).filter(Boolean);

    if (body.gallery) body.gallery = toArray(body.gallery).slice(0, 5);

    const created = await new Business(body).save();
    res.json({ success: true, business: created });
  } catch (err) {
    res.status(500).json({ success: false, message: "Create failed", error: err.message });
  }
});

/* ------------------------------- ADMIN: update ------------------------------- */
/**
 * PUT /api/businesses/:id
 */
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const body = { ...req.body };

    if (!body.slug && body.name) body.slug = makeSlug(body.name);

    if (body.instagramUsername) body.instagramUsername = `@${normHandle(body.instagramUsername)}`;
    if (body.handle || body.instagramUsername) body.handle = normHandle(body.handle || body.instagramUsername);
    if (body.instagramUrl || body.handle) body.instagramUrl = normIgUrl(body.instagramUrl || body.handle);

    if (body.phone) body.phone = normPhone(body.phone);
    if (body.phones) body.phones = toArray(body.phones).map(normPhone).filter(Boolean);

    if (body.gallery) body.gallery = toArray(body.gallery).slice(0, 5);

    const updated = await Business.findByIdAndUpdate(req.params.id, body, {
      new: true,
      runValidators: true,
    }).lean();

    if (!updated) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, business: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: "Update failed", error: err.message });
  }
});

/* ------------------------------- ADMIN: delete ------------------------------- */
/**
 * DELETE /api/businesses/:id
 */
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const del = await Business.findByIdAndDelete(req.params.id).lean();
    if (!del) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Delete failed", error: err.message });
  }
});

export default router;
