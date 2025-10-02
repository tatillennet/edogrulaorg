// backend/routes/google.js
import express from "express";
import axios from "axios";

const router = express.Router();

/* ============================================================================
   Basit bellek cache (TTL'li)
   ========================================================================== */
const cache = new Map(); // key -> { exp: number, val: any }
const getCached = async (key, fn, ttlMs = 6 * 60 * 60 * 1000) => {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  cache.set(key, { val, exp: Date.now() + ttlMs });
  return val;
};

/* ============================================================================
   Yardımcılar
   ========================================================================== */
const pick = (obj, keys) =>
  keys.reduce((a, k) => (obj?.[k] !== undefined ? ((a[k] = obj[k]), a) : a), {});

const normalizePlaceMetaNew = (p) => ({
  id: p?.id || null,
  name: p?.displayName?.text || null,
  address: p?.formattedAddress || null,
  rating: p?.rating ?? null,
  count: p?.userRatingCount ?? 0,
  googleMapsUri: p?.googleMapsUri || null,
});

const normalizeReviewsNew = (reviews = []) =>
  reviews.map((rv) => ({
    author: rv?.authorAttribution?.displayName || null,
    authorUrl: rv?.authorAttribution?.uri || null,
    authorPhoto: rv?.authorAttribution?.photoUri || null,
    rating: rv?.rating ?? null,
    text: rv?.text?.text || "",
    time: rv?.publishTime || null,
  }));

const normalizeFromLegacyDetails = (result) => ({
  place: {
    id: result?.place_id || null,
    name: result?.name || null,
    address: result?.formatted_address || null,
    rating: result?.rating ?? null,
    count: result?.user_ratings_total ?? 0,
    googleMapsUri: result?.url || null,
  },
  reviews: (result?.reviews || []).map((r) => ({
    author: r?.author_name || null,
    authorUrl: r?.author_url || null,
    authorPhoto: r?.profile_photo_url || null,
    rating: r?.rating ?? null,
    text: r?.text || "",
    time: r?.time ? new Date(r.time * 1000).toISOString() : null,
  })),
});

/* ============================================================================
   Google Places (New) — Text Search
   ========================================================================== */
async function searchPlaceNew(apiKey, query) {
  const url = "https://places.googleapis.com/v1/places:searchText";
  const headers = {
    "X-Goog-Api-Key": apiKey,
    // ihtiyacımız olan alanları iste (quota dostu)
    "X-Goog-FieldMask": [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.rating",
      "places.userRatingCount",
      "places.googleMapsUri",
    ].join(","),
  };
  const body = { textQuery: query };
  const { data } = await axios.post(url, body, { headers, timeout: 12000 });
  const place = data?.places?.[0];
  return place || null;
}

/* ============================================================================
   Google Places (New) — Place meta
   ========================================================================== */
async function getPlaceMetaNew(apiKey, placeId) {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const headers = {
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": [
      "id",
      "displayName",
      "formattedAddress",
      "rating",
      "userRatingCount",
      "googleMapsUri",
    ].join(","),
  };
  const { data } = await axios.get(url, { headers, timeout: 10000 });
  return data;
}

/* ============================================================================
   Google Places (New) — TÜM yorumları sayfalayarak çek
   Not: pageSize maks. 10; nextPageToken ile devam.
   ========================================================================== */
async function getAllReviewsNew(apiKey, placeId, hardLimit = 1000) {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(
    placeId
  )}/reviews`;
  const headers = {
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": [
      "reviews.rating",
      "reviews.text.text",
      "reviews.publishTime",
      "reviews.authorAttribution.displayName",
      "reviews.authorAttribution.uri",
      "reviews.authorAttribution.photoUri",
      "nextPageToken",
    ].join(","),
  };

  let pageToken = undefined;
  const all = [];
  do {
    const params = { orderBy: "NEWEST", pageSize: 10 };
    if (pageToken) params.pageToken = pageToken;

    const { data } = await axios.get(url, { headers, params, timeout: 15000 });
    const batch = normalizeReviewsNew(data?.reviews || []);
    all.push(...batch);

    pageToken = data?.nextPageToken || null;
    if (all.length >= hardLimit) break;
  } while (pageToken);

  return all.slice(0, hardLimit);
}

/* ============================================================================
   Legacy Fallback — Details (en fazla 5 yorum döner)
   ========================================================================== */
async function getDetailsLegacy(apiKey, placeId) {
  const url = "https://maps.googleapis.com/maps/api/place/details/json";
  const params = {
    place_id: placeId,
    fields:
      "place_id,name,formatted_address,url,rating,user_ratings_total,reviews",
    reviews_sort: "newest",
    reviews_no_translations: "true",
    key: apiKey,
  };
  const { data } = await axios.get(url, { params, timeout: 12000 });
  if (data?.status !== "OK") {
    const err = new Error(data?.status || "DETAILS_FAILED");
    err.payload = data;
    throw err;
  }
  return data.result;
}

/* ============================================================================
   /api/google/reviews?placeId=...&limit=...
   - Önce NEW (paginate) dener, olmazsa LEGACY (max 5) fallback
   ========================================================================== */
router.get("/reviews", async (req, res) => {
  try {
    const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
    if (!API_KEY) return res.status(500).json({ success: false, error: "API key yok" });

    const placeId = (req.query.placeId || "").trim();
    if (!placeId) return res.status(400).json({ success: false, error: "placeId gerekli" });

    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "1000", 10), 5000));

    // Meta'yı NEW üzerinden çek (cache'le)
    const meta = await getCached(`meta:${placeId}`, () => getPlaceMetaNew(API_KEY, placeId));

    // Tüm yorumları NEW Reviews API ile dene (cache + sayfalama)
    let reviews = null;
    let mode = "new";
    try {
      reviews = await getCached(
        `reviews:${placeId}:limit:${limit}`,
        () => getAllReviewsNew(API_KEY, placeId, limit),
        3 * 60 * 60 * 1000 // 3 saat
      );
    } catch (e) {
      // NEW başarısızsa legacy'e düş
      mode = "legacy";
      const legacy = await getCached(
        `legacyDetails:${placeId}`,
        () => getDetailsLegacy(API_KEY, placeId),
        3 * 60 * 60 * 1000
      );
      const mapped = normalizeFromLegacyDetails(legacy);
      reviews = mapped.reviews; // max 5
    }

    return res.json({
      success: true,
      place: normalizePlaceMetaNew(meta),
      reviews,
      mode, // "new" ise tüm yorumlar (limit dahil), "legacy" ise Google 5 ile sınırlar
      totalReturned: reviews.length,
    });
  } catch (e) {
    console.error("Hata /api/google/reviews:", e?.payload || e?.response?.data || e.message);
    return res.status(502).json({ success: false, error: "google_details_failed" });
  }
});

/* ============================================================================
   /api/google/reviews/search?query=...&limit=...
   - Query → Place (New Text Search) → Meta + Yorumlar
   ========================================================================== */
router.get("/reviews/search", async (req, res) => {
  try {
    const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
    if (!API_KEY) return res.status(500).json({ success: false, error: "API key yok" });

    const query = (req.query.query || "").trim();
    if (!query) return res.status(400).json({ success: false, error: "query gerekli" });

    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "1000", 10), 5000));

    // Text Search (cache)
    const place = await getCached(
      `search:${query.toLowerCase()}`,
      () => searchPlaceNew(API_KEY, query),
      6 * 60 * 60 * 1000
    );
    if (!place?.id) return res.status(404).json({ success: false, error: "not_found" });

    // Meta + Yorumlar (reviews endpointi, fallback ile)
    req.query.placeId = place.id; // aşağıdaki handler ile aynı yolu izlemek için
    const url = new URL(req.protocol + "://" + req.get("host") + req.originalUrl);
    url.pathname = url.pathname.replace(/\/reviews\/search$/, "/reviews");
    url.searchParams.set("placeId", place.id);
    url.searchParams.set("limit", String(limit));

    // İçeriden çağırmak yerine direkt fonksiyonları tekrar kullan:
    const meta = await getCached(`meta:${place.id}`, () => getPlaceMetaNew(API_KEY, place.id));
    let reviews = null;
    let mode = "new";
    try {
      reviews = await getCached(
        `reviews:${place.id}:limit:${limit}`,
        () => getAllReviewsNew(API_KEY, place.id, limit),
        3 * 60 * 60 * 1000
      );
    } catch (e) {
      mode = "legacy";
      const legacy = await getCached(
        `legacyDetails:${place.id}`,
        () => getDetailsLegacy(API_KEY, place.id),
        3 * 60 * 60 * 1000
      );
      const mapped = normalizeFromLegacyDetails(legacy);
      reviews = mapped.reviews;
    }

    return res.json({
      success: true,
      placeId: place.id,
      place: normalizePlaceMetaNew(meta),
      reviews,
      mode,
      totalReturned: reviews.length,
    });
  } catch (e) {
    console.error("Hata /api/google/reviews/search:", e?.payload || e?.response?.data || e.message);
    return res.status(502).json({ success: false, error: "google_search_failed", message: e.message });
  }
});

export default router;
