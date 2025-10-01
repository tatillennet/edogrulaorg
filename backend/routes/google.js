// backend/routes/google.js  (Node 22: fetch global)
import { Router } from "express";
const router = Router();

// küçük yardımcı: güvenli env kontrol logu
function maskKey(k) { return k ? `${k.slice(0,4)}…(${k.length})` : "MISSING"; }

// GET /api/google/reviews?placeId=...
router.get("/reviews", async (req, res) => {
  try {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key) return res.status(500).json({ error: "GOOGLE_PLACES_API_KEY missing" });

    const { placeId } = req.query;
    if (!placeId) return res.status(400).json({ error: "placeId required" });

    const base = `https://places.googleapis.com/v1/places/${placeId}`;

    // 1) reviews dahil dene
    let r = await fetch(base, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "id,displayName,googleMapsUri,rating,userRatingCount,reviews"
      }
    });
    let text = await r.text();

    // 2) reviews yüzünden hata olursa fallback (ör. 400/403)
    if (!r.ok) {
      console.error("[places details] status:", r.status, "key:", maskKey(key), "resp:", text);
      // reviews'ı çıkarıp minimal alanlarla tekrar dene
      const r2 = await fetch(base, {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "id,displayName,googleMapsUri,rating,userRatingCount"
        }
      });
      const text2 = await r2.text();
      if (!r2.ok) {
        console.error("[details fallback] status:", r2.status, "resp:", text2);
        return res.status(r2.status).type("application/json").send(text2);
      }
      return res.type("application/json").send(text2);
    }

    // 200 => direkt geçir
    res.type("application/json").send(text);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal error", detail: String(e?.message || e) });
  }
});

// GET /api/google/reviews/search?query=...
router.get("/reviews/search", async (req, res) => {
  try {
    const key = process.env.GOOGLE_PLACES_API_KEY;
    if (!key) return res.status(500).json({ error: "GOOGLE_PLACES_API_KEY missing" });

    const { query } = req.query;
    if (!query) return res.status(400).json({ error: "query required" });

    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri"
      },
      body: JSON.stringify({ textQuery: query })
    });

    const text = await r.text();
    if (!r.ok) {
      console.error("[searchText] status:", r.status, "key:", maskKey(key), "resp:", text);
      return res.status(r.status).type("application/json").send(text);
    }
    res.type("application/json").send(text);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal error", detail: String(e?.message || e) });
  }
});

export default router;
