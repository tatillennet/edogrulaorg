// backend/routes/google.js
import express from "express";
import axios from "axios";

const router = express.Router();

// ❗️ DİKKAT: API_KEY tanımını buradan kaldırdık. 
// Artık fonksiyonların içinde okunacak.

// Cache ve Normalize fonksiyonları aynı kalıyor...
const cache = new Map();
const getCached = async (key, fn, ttlMs = 30 * 60 * 1000) => {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  cache.set(key, { val, exp: Date.now() + ttlMs });
  return val;
};

const normalize = (place) => ({
  rating: place?.rating ?? null,
  count: place?.user_ratings_total ?? 0,
  reviews: (place?.reviews || []).map((r) => ({
    author: r.author_name,
    rating: r.rating,
    text: r.text,
    date: r.time ? new Date(r.time * 1000).toISOString() : null,
    photo: r.profile_photo_url,
  })),
});

/** GET /api/google/reviews?placeId=... */
router.get("/reviews", async (req, res) => {
  try {
    // ✅ API Anahtarını fonksiyonun içinde, istek geldiği anda oku.
    const API_KEY = process.env.GOOGLE_PLACES_API_KEY; 
    
    if (!API_KEY) return res.status(500).json({ error: "API key yok" });
    const { placeId } = req.query;
    if (!placeId) return res.status(400).json({ error: "placeId gerekli" });

    const url = "https://maps.googleapis.com/maps/api/place/details/json";
    const params = {
      place_id: placeId,
      fields: "rating,user_ratings_total,reviews",
      reviews_sort: "newest",
      reviews_no_translations: "true",
      key: API_KEY,
    };

    const data = await getCached(`details:${placeId}`, async () => {
      const { data } = await axios.get(url, { params, timeout: 12000 });
      if (data.status !== "OK") throw new Error(data.status);
      return data.result;
    });

    return res.json(normalize(data));
  } catch (e) {
    console.error("Hata /api/google/reviews:", e.message);
    return res.status(500).json({ error: "google_details_failed" });
  }
});

/** GET /api/google/reviews/search?query=... */
router.get("/reviews/search", async (req, res) => {
  try {
    // ✅ API Anahtarını fonksiyonun içinde, istek geldiği anda oku.
    const API_KEY = process.env.GOOGLE_PLACES_API_KEY; 

    if (!API_KEY) {
        console.error("❌ HATA: API anahtarı .env dosyasında bulunamadı veya okunamadı!");
        return res.status(500).json({ error: "API key yok" });
    }
    
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: "query gerekli" });

    // 1) Find Place
    const findUrl = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json";
    const findParams = {
      input: query,
      inputtype: "textquery",
      fields: "place_id",
      key: API_KEY,
    };
    const placeId = await getCached(`find:${query}`, async () => {
      const { data } = await axios.get(findUrl, { params: findParams, timeout: 12000 });
      if (!data.candidates?.length) throw new Error("not_found");
      return data.candidates[0].place_id;
    });

    // 2) Details
    const detUrl = "https://maps.googleapis.com/maps/api/place/details/json";
    const detParams = {
      place_id: placeId,
      fields: "rating,user_ratings_total,reviews",
      reviews_sort: "newest",
      reviews_no_translations: "true",
      key: API_KEY,
    };
    const details = await getCached(`details:${placeId}`, async () => {
      const { data } = await axios.get(detUrl, { params: detParams, timeout: 12000 });
      if (data.status !== "OK") throw new Error(data.status);
      return data.result;
    });

    return res.json({ placeId: placeId, ...normalize(details) });
  } catch (e) {
    console.error("Hata /api/google/search:", e.message);
    return res.status(500).json({ error: "google_search_failed", message: e.message });
  }
});

export default router;