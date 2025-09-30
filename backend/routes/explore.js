// backend/routes/explore.js
import express from "express";
import Business from "../models/Business.js";

const router = express.Router();

/* -----------------------------------------------------------------------------
 * Config / Helpers
 * -------------------------------------------------------------------------- */
const EXPLR_TTL_MS = Number(process.env.EXPLORE_TTL_MS || 15_000); // 15s
const PLACEHOLDER_IMAGE_URL =
  process.env.PLACEHOLDER_IMAGE_URL ||
  "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=800&auto=format&fit=crop";

const STOP_WORDS = new Set([
  // tr
  "ev", "evleri", "otel", "otelleri", "konaklama", "bungalov", "bungalovlar",
  "fiyat", "fiyatları", "fiyatlari", "en", "icin", "için", "ve", "veya",
  "yakın", "yakini", "yakınında", "nerede", "yer", "yerler", "tesisi", "tesisleri",
  // en
  "the", "a", "an", "and", "or", "near", "close", "best", "cheap", "price",
  // semboller
  "&", "-", "–", "|"
]);

const escapeRegex = (s = "") => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rx = (s) => new RegExp(escapeRegex(s), "i");

function tokenize(raw = "") {
  return String(raw)
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}@._+-]+/gu, "")) // unicode harf/rakam dışını temizle
    .filter((t) => t && t.length > 2 && !STOP_WORDS.has(t));
}

function buildSnippet(b) {
  const features = Array.isArray(b.features)
    ? b.features.filter(Boolean).slice(0, 5).join(", ")
    : "";
  const first =
    (b.description && String(b.description).trim()) ||
    (b.summary && String(b.summary).trim()) ||
    (features && features) ||
    "";
  if (first) return first;

  const type = b.type ? String(b.type).trim() : "";
  const loc = [b.city, b.district].filter(Boolean).join(" / ");
  const typeText = type ? `${type} tesisi` : "işletme";
  return [typeText, loc].filter(Boolean).join(" • ");
}

function pickLocationHint(qRaw, docs) {
  if (/sapanca/i.test(qRaw)) return "Sapanca";
  if (docs?.[0]?.district) return docs[0].district;
  if (docs?.[0]?.city) return docs[0].city;
  return "";
}

/* -----------------------------------------------------------------------------
 * Tiny in-memory cache (prodda Redis önerilir)
 * -------------------------------------------------------------------------- */
const _cache = new Map(); // key -> { ts, data }
const cacheKey = (qs) => `explore|${qs}`;
function cacheGet(key) {
  const v = _cache.get(key);
  if (!v) return null;
  if (Date.now() - v.ts > EXPLR_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return v.data;
}
function cacheSet(key, data) {
  _cache.set(key, { ts: Date.now(), data });
}

/* -----------------------------------------------------------------------------
 * GET /api/explore
 * Query:
 *   q (string)      : arama metni (zorunlu)
 *   page, limit     : sayfalama (default 1, 20; max 50)
 *   sort            : "-verified,-createdAt" gibi
 *   fields          : "name,slug,gallery" gibi daraltılmış projection
 *   city, district  : ekstra filtreler
 *   verified        : true/false
 *   status          : approved|pending|rejected|all
 *   facets=1        : city/district counts
 * -------------------------------------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const qRaw = String(req.query.q || "").trim();

    // Boş sorgu → boş payload
    if (!qRaw) {
      return res.json({
        success: true,
        vertical: "web",
        query: "",
        location: "",
        page: 1,
        limit: 20,
        total: 0,
        places: [],
        results: [],
        suggestions: [],
        trending: []
      });
    }

    // Sayfalama
    const limit = Math.max(1, Math.min(+req.query.limit || 20, 50));
    const page = Math.max(1, +req.query.page || 1);
    const skip = (page - 1) * limit;

    // Sıralama
    const sort = {};
    const sortParam = String(req.query.sort || "-verified,-createdAt");
    for (const part of sortParam.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (part.startsWith("-")) sort[part.slice(1)] = -1;
      else sort[part] = 1;
    }

    // Projection
    let fields;
    if (req.query.fields) {
      fields = String(req.query.fields)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" ");
    } else {
      fields =
        "name slug gallery description summary features type city district instagramUsername website verified createdAt address";
    }

    // Cache anahtarı (q|page|limit|sort|filters|fields)
    const qsKey = JSON.stringify({
      qRaw,
      page,
      limit,
      sort,
      fields,
      city: req.query.city || "",
      district: req.query.district || "",
      verified: req.query.verified || "",
      status: req.query.status || ""
    });
    const cKey = cacheKey(qsKey);
    const cached = cacheGet(cKey);
    if (cached) return res.json(cached);

    // Tokenizasyon & digits
    const tokens = tokenize(qRaw);
    const digits = qRaw.replace(/\D/g, "");

    // Alan-temelli AND (her token en az bir alanda)
    const andParts =
      tokens.length > 0
        ? tokens.map((t) => ({
            $or: [
              { name: rx(t) },
              { type: rx(t) },
              { handle: rx(t) },
              { instagramUsername: rx(t) },
              { address: rx(t) },
              { city: rx(t) },
              { district: rx(t) },
              { website: rx(t) }
            ]
          }))
        : [
            {
              $or: [
                { name: rx(qRaw) },
                { address: rx(qRaw) },
                { city: rx(qRaw) },
                { district: rx(qRaw) },
                { instagramUsername: rx(qRaw) },
                { type: rx(qRaw) },
                { website: rx(qRaw) }
              ]
            }
          ];

    // Telefon ipucu (6+ hane)
    if (digits.length >= 6) {
      andParts.push({
        $or: [
          { phone: rx(digits) },
          { phones: rx(digits) } // array regex match
        ]
      });
    }

    // Ek filtreler
    const filter = { $and: andParts };
    if (req.query.city) filter.$and.push({ city: rx(req.query.city) });
    if (req.query.district) filter.$and.push({ district: rx(req.query.district) });

    if (typeof req.query.verified === "string") {
      const v = req.query.verified.toLowerCase();
      if (v === "true" || v === "false") filter.$and.push({ verified: v === "true" });
    }

    if (typeof req.query.status === "string" && req.query.status !== "all") {
      filter.$and.push({ status: req.query.status });
    }

    // Toplam & sayfa verisi
    const [docs, total] = await Promise.all([
      Business.find(filter).select(fields).sort(sort).skip(skip).limit(limit).lean(),
      Business.countDocuments(filter)
    ]);

    // Places (grid) — en fazla 8
    const places = docs.slice(0, 8).map((b) => ({
      name: b.name,
      url: `/isletme/${b.slug || b._id}`,
      image: (Array.isArray(b.gallery) && b.gallery[0]) || PLACEHOLDER_IMAGE_URL,
      slug: b.slug || String(b._id)
    }));

    // SERP benzeri sonuçlar
    const results = docs.map((b) => ({
      title: b.name,
      url: `/isletme/${b.slug || b._id}`,
      snippet: buildSnippet(b),
      breadcrumbs: [`edogrula.org › ${b.slug || b._id}`],
      slug: b.slug || String(b._id)
    }));

    // Öneriler
    const suggestions = [
      qRaw,
      ...(docs[0]?.city ? [`${docs[0].city} bungalov evleri`] : []),
      "instagram doğrulama",
      "işletme telefonu sorgula"
    ].filter(Boolean);

    // Trendler (kısa, benzersiz)
    const trending = [
      ...new Set(
        docs
          .map((d) => d.instagramUsername)
          .concat(
            docs
              .map((d) => d.website)
              .filter(Boolean)
              .map((w) => {
                try {
                  return new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`)
                    .hostname.replace(/^www\./, "");
                } catch {
                  return null;
                }
              })
              .filter(Boolean)
          )
          .filter(Boolean)
      )
    ].slice(0, 8);

    const location = pickLocationHint(qRaw, docs);

    const payload = {
      success: true,
      vertical: "lodging", // UI’da üstte konaklama şeridi varsa "lodging"
      query: qRaw,
      location,
      page,
      limit,
      total,
      places,
      results,
      suggestions,
      trending
    };

    cacheSet(cKey, payload);
    return res.json(payload);
  } catch (e) {
    console.error("explore error:", e);
    return res.status(500).json({
      success: false,
      vertical: "web",
      query: String(req.query.q || ""),
      location: "",
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 20),
      total: 0,
      places: [],
      results: [],
      suggestions: [],
      trending: [],
      message: "Explore error"
    });
  }
});

/* -----------------------------------------------------------------------------
 * (Opsiyonel) Facets: city/district dağılımı
 * GET /api/explore/facets?q=...  (aynı tokenize/filters mantığı)
 * -------------------------------------------------------------------------- */
router.get("/facets", async (req, res) => {
  try {
    const qRaw = String(req.query.q || "").trim();
    const tokens = tokenize(qRaw);
    const digits = qRaw.replace(/\D/g, "");

    const andParts =
      tokens.length > 0
        ? tokens.map((t) => ({
            $or: [
              { name: rx(t) },
              { type: rx(t) },
              { handle: rx(t) },
              { instagramUsername: rx(t) },
              { address: rx(t) },
              { city: rx(t) },
              { district: rx(t) },
              { website: rx(t) }
            ]
          }))
        : [
            {
              $or: [
                { name: rx(qRaw) },
                { address: rx(qRaw) },
                { city: rx(qRaw) },
                { district: rx(qRaw) },
                { instagramUsername: rx(qRaw) },
                { type: rx(qRaw) },
                { website: rx(qRaw) }
              ]
            }
          ];

    if (digits.length >= 6) {
      andParts.push({
        $or: [{ phone: rx(digits) }, { phones: rx(digits) }]
      });
    }

    const filter = { $and: andParts };

    const [byCity, byDistrict] = await Promise.all([
      Business.aggregate([
        { $match: filter },
        { $group: { _id: "$city", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]),
      Business.aggregate([
        { $match: filter },
        { $group: { _id: "$district", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ])
    ]);

    return res.json({
      success: true,
      facets: {
        city: byCity.filter((x) => x._id).map((x) => ({ value: x._id, count: x.count })),
        district: byDistrict.filter((x) => x._id).map((x) => ({ value: x._id, count: x.count }))
      }
    });
  } catch (e) {
    console.error("explore facets error:", e);
    return res.status(500).json({ success: false, message: "Facets error" });
  }
});

export default router;
