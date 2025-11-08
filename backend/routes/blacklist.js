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
const toArray = (v) =>
  (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);
const escapeRegex = (s = "") =>
  String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// güvenli sayı (virgüllü stringleri de çevirir)
const toNum = (v, def = 0) => {
  if (v == null) return def;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : def;
};

// slug
const makeSlug = (str = "") =>
  String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// instagram
const normHandle = (h = "") =>
  String(h || "").trim().replace(/^@+/, "");
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

/* -------------------------- classify incoming query ----------------------- */
function classifyQuery(qRaw = "", hintedType = "") {
  const q = String(qRaw || "").trim();
  if (!q) return { ok: false, reason: "empty" };

  const igUrlRe =
    /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\/([A-Za-z0-9._]{1,30})(\/)?(\?.*)?$/i;
  const igUserRe = /^@?([A-Za-z0-9._]{1,30})$/;
  const phoneRe = /^\+?[0-9 ()\-\.]{10,20}$/;
  const siteRe =
    /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}([:/?#].*)?$/i;

  const type = String(hintedType || "").toLowerCase();

  if (type === "ig_url" && igUrlRe.test(q)) {
    const username = q.replace(igUrlRe, "$4");
    return {
      ok: true,
      type: "ig_url",
      value: `https://instagram.com/${username}`,
      username,
    };
  }
  if (type === "ig_username" && igUserRe.test(q)) {
    const username = q.replace(/^@/, "");
    return {
      ok: true,
      type: "ig_username",
      value: username,
      username,
    };
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
    return {
      ok: true,
      type: "ig_url",
      value: `https://instagram.com/${username}`,
      username,
    };
  }
  if (igUserRe.test(q)) {
    const username = q.replace(/^@/, "");
    return {
      ok: true,
      type: "ig_username",
      value: username,
      username,
    };
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
const CACHE_TTL = Number(
  process.env.BUSINESS_SEARCH_TTL_MS || 15_000
); // 15 sn
const _cache = new Map(); // key -> { ts, data }
const cacheKey = (q, type, limit) =>
  `search|${type}|${q}|${limit}`;
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
function requireAdmin(req, res, next) {
  try {
    const needed = process.env.ADMIN_KEY;

    const bearer = (req.headers.authorization || "").replace(
      /^Bearer\s+/i,
      ""
    );
    if (bearer) {
      try {
        const dec = jwt.verify(
          bearer,
          process.env.JWT_SECRET || "change_me"
        );
        if (dec?.role === "admin" || dec?.isAdmin === true)
          return next();
      } catch {}
    }

    const sent = req.headers["x-admin-key"] || bearer;
    if (needed && sent && String(sent) === String(needed))
      return next();

    return res
      .status(401)
      .json({ success: false, message: "Yetkisiz" });
  } catch (e) {
    return res
      .status(401)
      .json({ success: false, message: "Yetkilendirme hatası" });
  }
}

/* ------------------------------ PUBLIC: /filter ------------------------------ */
/**
 * GET /api/businesses/filter
 * Query:
 *  - address=Sapanca (regex, i)
 *  - type=bungalov (bungalov|bungalow eşleşir)
 *  - onlyVerified=true|false
 *  - sort=rating|reviews (default: rating)
 *  - page, perPage
 * Döner: { items:[...], total, page, perPage }
 */
router.get("/filter", async (req, res) => {
  try {
    const {
      address = "",
      type = "",
      onlyVerified = "false",
      sort = "rating", // "rating" | "reviews"
      page = "1",
      perPage = "20",
    } = req.query;

    const q = {};

    // Adres
    if (address) {
      q.address = {
        $regex: new RegExp(escapeRegex(address), "i"),
      };
    }

    // Tür
    if (type) {
      const t = String(type).toLowerCase();
      if (t === "bungalov") {
        q.$or = [
          { type: { $regex: /bungalov/i } },
          { type: { $regex: /bungalow/i } },
        ];
      } else {
        q.type = {
          $regex: new RegExp(escapeRegex(type), "i"),
        };
      }
    }

    // Sadece doğrulanmış
    if (
      String(onlyVerified).toLowerCase() === "true"
    ) {
      q.verified = true;
    }

    const pageNum = Math.max(
      1,
      parseInt(page, 10) || 1
    );
    const limitNum = Math.min(
      50,
      Math.max(1, parseInt(perPage, 10) || 20)
    );
    const skip = (pageNum - 1) * limitNum;

    // Sadece gereken alanlar:
    const projection = {
      name: 1,
      slug: 1,
      verified: 1,
      address: 1,
      phone: 1,
      website: 1,
      handle: 1,
      instagramUsername: 1,
      instagramUrl: 1,
      type: 1,
      summary: 1,
      description: 1,
      gallery: 1,
      rating: 1,
      reviewsCount: 1,

      // Google alanları (model ile uyumlu)
      google: 1,
      googleRating: 1,
      googleReviewsCount: 1,
    };

    const [rows, total] = await Promise.all([
      Business.find(q)
        .select(projection)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Business.countDocuments(q),
    ]);

    const items = rows.map((b) => {
      const g = b.google || {};

      // Google rating
      const googleRating = toNum(
        b.googleRating ??
          g.rating ??
          g.ratingValue ??
          g.rating_value
      );

      // Google yorum sayısı
      const googleReviewsCount = toNum(
        b.googleReviewsCount ??
          g.user_ratings_total ??
          g.reviewsCount ??
          g.total_reviews ??
          g.reviewCount
      );

      const photo =
        (Array.isArray(b.gallery) &&
          b.gallery[0]) || null;

      return {
        _id: b._id,
        slug: b.slug || String(b._id),
        name: b.name || "İsimsiz İşletme",
        verified: !!b.verified,
        address: b.address || "",
        phone: b.phone || "",
        website: b.website || "",
        instagramUsername:
          b.instagramUsername || b.handle || "",
        instagramUrl: b.instagramUrl || "",
        type: b.type || "Bungalov",
        gallery: Array.isArray(b.gallery)
          ? b.gallery.slice(0, 5)
          : [],
        photo,
        summary:
          (b.summary || "").trim() ||
          (b.description || "").trim() ||
          "",
        rating: toNum(b.rating),
        reviewsCount: toNum(b.reviewsCount),
        googleRating,
        googleReviewsCount,
      };
    });

    // Sıralama: önce E-Doğrula, yoksa Google
    const score = (x) =>
      x.rating > 0
        ? x.rating
        : x.googleRating > 0
        ? x.googleRating
        : 0;

    const rev = (x) =>
      x.reviewsCount > 0
        ? x.reviewsCount
        : x.googleReviewsCount > 0
        ? x.googleReviewsCount
        : 0;

    items.sort((a, b) =>
      sort === "reviews"
        ? rev(b) - rev(a)
        : score(b) - score(a)
    );

    return res.json({
      items,
      total,
      page: pageNum,
      perPage: limitNum,
    });
  } catch (err) {
    console.error("filter_error", err);
    return res.status(500).json({
      error: "filter_failed",
      message: err.message,
    });
  }
});

/* ------------------------------ PUBLIC: /search ------------------------------ */
router.get("/search", async (req, res) => {
  try {
    const raw = String(req.query.q || "").trim();
    const hintedType = String(req.query.type || "");
    const limit = Math.max(
      1,
      Math.min(+req.query.limit || 10, 25)
    );

    const cls = classifyQuery(raw, hintedType);
    if (!cls.ok) {
      return res.json({
        success: true,
        status: "not_found",
        reason: cls.reason,
        businesses: [],
      });
    }

    const key = cacheKey(
      cls.value,
      cls.type,
      limit
    );
    const cached = cacheGet(key);
    if (cached) return res.json(cached);

    const qText = String(cls.value || "").trim();
    const qSlug = makeSlug(qText);
    const qHandle = normHandle(
      cls.username || qText
    );
    const rxAny = new RegExp(
      escapeRegex(qText),
      "i"
    );
    const rxSlugExact = new RegExp(
      `^${escapeRegex(qSlug)}$`,
      "i"
    );
    const rxHandleExact = new RegExp(
      `^${escapeRegex(qHandle)}$`,
      "i"
    );
    const rxIgUser = new RegExp(
      `^@?${escapeRegex(qHandle)}$`,
      "i"
    );
    const phone =
      cls.type === "phone"
        ? normPhone(qText)
        : "";

    const or = [
      { name: rxAny },
      { slug: rxSlugExact },
      { handle: rxHandleExact },
      { instagramUsername: rxIgUser },
    ];

    if (
      cls.type === "ig_url" ||
      cls.type === "website" ||
      cls.type === "text"
    ) {
      or.push(
        { instagramUrl: rxAny },
        { website: rxAny }
      );
    }
    if (cls.type === "phone") {
      if (phone)
        or.push({
          phone: new RegExp(
            escapeRegex(phone),
            "i"
          ),
        });
      const digits = phone.replace(/\D/g, "");
      if (digits)
        or.push({
          phone: new RegExp(
            digits.slice(-10)
          ),
        });
    }

    const verified = await Business.find({
      $or: or,
    })
      .limit(limit)
      .lean();

    if (verified.length) {
      const payload = {
        success: true,
        status: "verified",
        business: verified[0],
        businesses: verified,
      };
      cacheSet(key, payload);
      return res.json(payload);
    }

    const blOr = [
      { name: rxAny },
      { instagramUsername: rxIgUser },
      { instagramUrl: rxAny },
    ];
    if (phone)
      blOr.push({
        phone: new RegExp(
          escapeRegex(phone),
          "i"
        ),
      });

    const black = await Blacklist.findOne({
      $or: blOr,
    }).lean();
    if (black) {
      const payload = {
        success: true,
        status: "blacklist",
        business: black,
      };
      cacheSet(key, payload);
      return res.json(payload);
    }

    const payload = {
      success: true,
      status: "not_found",
      businesses: [],
    };
    cacheSet(key, payload);
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "error",
      message: "Search error",
      error: err.message,
    });
  }
});

/* ------------------------------ PUBLIC: by-slug ------------------------------ */
router.get("/by-slug/:slug", async (req, res) => {
  try {
    const slug = makeSlug(
      req.params.slug || ""
    );
    if (!slug) {
      return res.status(400).json({
        success: false,
        status: "error",
        message: "Geçersiz slug",
      });
    }

    const business =
      await Business.findOne({ slug }).lean();
    if (!business) {
      return res.status(404).json({
        success: true,
        status: "not_found",
      });
    }

    return res.json({
      success: true,
      status: "verified",
      business,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "error",
      message: "Detail error",
      error: err.message,
    });
  }
});

/* ------------------------------ PUBLIC: handle ------------------------------ */
router.get("/handle/:handle", async (req, res) => {
  try {
    const handle = normHandle(
      req.params.handle || ""
    );
    if (!handle) {
      return res.status(400).json({
        success: false,
        status: "error",
        message: "Geçersiz handle",
      });
    }

    const rxHandleExact = new RegExp(
      `^${escapeRegex(handle)}$`,
      "i"
    );

    const business =
      await Business.findOne({
        $or: [
          { handle: rxHandleExact },
          {
            instagramUsername:
              new RegExp(
                `^@?${escapeRegex(
                  handle
                )}$`,
                "i"
              ),
          },
        ],
      }).lean();

    if (!business) {
      return res.status(404).json({
        success: true,
        status: "not_found",
      });
    }
    return res.json({
      success: true,
      status: "verified",
      business,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "error",
      message: "Detail error",
      error: err.message,
    });
  }
});

/* ------------------------------ PUBLIC: get by id/slug/handle ------------------------------ */
router.get("/:id", async (req, res) => {
  try {
    const id = String(
      req.params.id || ""
    );

    if (isObjId(id)) {
      const b =
        await Business.findById(id).lean();
      if (b) {
        return res.json({
          success: true,
          status: "verified",
          business: b,
        });
      }
    }

    const slug = makeSlug(id);
    const handle = normHandle(id);
    const rxHandleExact = new RegExp(
      `^${escapeRegex(handle)}$`,
      "i"
    );

    const b2 = await Business.findOne({
      $or: [
        { slug },
        { handle: rxHandleExact },
        {
          instagramUsername:
            new RegExp(
              `^@?${escapeRegex(
                handle
              )}$`,
              "i"
            ),
        },
      ],
    }).lean();

    if (b2) {
      return res.json({
        success: true,
        status: "verified",
        business: b2,
      });
    }

    if (isObjId(id)) {
      const bl =
        await Blacklist.findById(id).lean();
      if (bl) {
        return res.json({
          success: true,
          status: "blacklist",
          business: bl,
        });
      }
    }

    return res.status(404).json({
      success: true,
      status: "not_found",
      message: "İşletme bulunamadı",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      status: "error",
      message: "Detail error",
      error: err.message,
    });
  }
});

/* -------------------------------- ADMIN CRUD -------------------------------- */

router.get("/", requireAdmin, async (req, res) => {
  try {
    const limit = Math.max(
      1,
      Math.min(+req.query.limit || 50, 200)
    );
    const page = Math.max(
      1,
      +req.query.page || 1
    );
    const skip = (page - 1) * limit;

    const sort = {};
    const sortParam = String(
      req.query.sort || "-createdAt"
    );
    for (const part of sortParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (part.startsWith("-"))
        sort[part.slice(1)] = -1;
      else sort[part] = 1;
    }

    let fields;
    if (req.query.fields) {
      fields = String(req.query.fields)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ");
    }

    const q = String(req.query.q || "").trim();
    const rx = q
      ? new RegExp(escapeRegex(q), "i")
      : null;
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

    const query = Business.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();
    if (fields) query.select(fields);

    const [items, total] =
      await Promise.all([
        query,
        Business.countDocuments(filter),
      ]);

    res.json({
      success: true,
      businesses: items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "List failed",
      error: err.message,
    });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const body = { ...req.body };

    if (!body.slug && body.name)
      body.slug = makeSlug(body.name);

    if (body.instagramUsername)
      body.instagramUsername = `@${normHandle(
        body.instagramUsername
      )}`;
    if (body.handle || body.instagramUsername)
      body.handle = normHandle(
        body.handle || body.instagramUsername
      );
    if (body.instagramUrl || body.handle)
      body.instagramUrl = normIgUrl(
        body.instagramUrl || body.handle
      );

    if (body.phone)
      body.phone = normPhone(body.phone);
    if (body.phones)
      body.phones = toArray(body.phones)
        .map(normPhone)
        .filter(Boolean);

    if (body.gallery)
      body.gallery = toArray(body.gallery).slice(
        0,
        5
      );

    const created = await new Business(
      body
    ).save();
    res.json({
      success: true,
      business: created,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Create failed",
      error: err.message,
    });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const body = { ...req.body };

    if (!body.slug && body.name)
      body.slug = makeSlug(body.name);

    if (body.instagramUsername)
      body.instagramUsername = `@${normHandle(
        body.instagramUsername
      )}`;
    if (body.handle || body.instagramUsername)
      body.handle = normHandle(
        body.handle || body.instagramUsername
      );
    if (body.instagramUrl || body.handle)
      body.instagramUrl = normIgUrl(
        body.instagramUrl || body.handle
      );

    if (body.phone)
      body.phone = normPhone(body.phone);
    if (body.phones)
      body.phones = toArray(body.phones)
        .map(normPhone)
        .filter(Boolean);

    if (body.gallery)
      body.gallery = toArray(body.gallery).slice(
        0,
        5
      );

    const updated =
      await Business.findByIdAndUpdate(
        req.params.id,
        body,
        {
          new: true,
          runValidators: true,
        }
      ).lean();

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Not found",
      });
    }
    res.json({
      success: true,
      business: updated,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Update failed",
      error: err.message,
    });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const del =
      await Business.findByIdAndDelete(
        req.params.id
      ).lean();
    if (!del) {
      return res.status(404).json({
        success: false,
        message: "Not found",
      });
    }
    res.json({
      success: true,
      message: "Deleted",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Delete failed",
      error: err.message,
    });
  }
});

export default router;
