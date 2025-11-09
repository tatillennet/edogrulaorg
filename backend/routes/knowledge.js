import express from "express";
import axios from "axios";

const router = express.Router();

/**
 * Ortak iş: verilen q için place + wiki + weather verisini hazırlar.
 */
async function buildKnowledge(qRaw) {
  const q = (qRaw || "Sapanca").trim();
  const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

  let place = null;
  let wiki = null;
  let weather = null;

  /* -------- 1) Google Places (opsiyonel) -------- */
  if (GOOGLE_PLACES_API_KEY) {
    try {
      const ts = await axios.get(
        "https://maps.googleapis.com/maps/api/place/textsearch/json",
        {
          params: {
            query: q,
            language: "tr",
            region: "tr",
            key: GOOGLE_PLACES_API_KEY,
          },
        }
      );

      const cand = ts.data?.results?.[0];

      if (cand?.place_id) {
        const det = await axios.get(
          "https://maps.googleapis.com/maps/api/place/details/json",
          {
            params: {
              place_id: cand.place_id,
              language: "tr",
              fields: "name,formatted_address,geometry,url",
              key: GOOGLE_PLACES_API_KEY,
            },
          }
        );

        if (det.data?.result) {
          place = { ...det.data.result, place_id: cand.place_id };
        }
      }
    } catch (err) {
      console.warn("[knowledge] Google Places hatası:", err.message);
    }
  }

  /* -------- 2) Wikipedia (TR) -------- */
  try {
    const wikiRes = await axios.get(
      `https://tr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        q
      )}`
    );
    wiki = wikiRes.data;
  } catch (err) {
    console.warn("[knowledge] Wikipedia hatası:", err.message);
  }

  /* -------- 3) Open-Meteo (koordinat varsa) -------- */
  if (place?.geometry?.location) {
    const { lat, lng } = place.geometry.location;
    try {
      const wRes = await axios.get("https://api.open-meteo.com/v1/forecast", {
        params: {
          latitude: lat,
          longitude: lng,
          current_weather: true,
          daily: "temperature_2m_max,temperature_2m_min,weathercode",
          timezone: "auto",
        },
      });
      weather = wRes.data;
    } catch (err) {
      console.warn("[knowledge] Open-Meteo hatası:", err.message);
    }
  }

  /* -------- Response shaping -------- */
  const title =
    wiki?.titles?.display ||
    place?.name ||
    q;

  const subtitle = wiki?.description || "Bölge bilgisi";
  const summary = wiki?.extract || null;
  const wiki_url = wiki?.content_urls?.desktop?.page || null;
  const coordinates = place?.geometry?.location || null;
  const gmap_url = place?.url || null;

  return {
    success: true,
    query: q,
    title,
    subtitle,
    summary,
    wiki_url,
    coordinates,
    gmap_url,
    weather,
  };
}

/**
 * Ana endpoint:
 *   GET /api/knowledge?q=Sapanca
 */
router.get("/", async (req, res) => {
  try {
    const data = await buildKnowledge(req.query.q);
    res.json(data);
  } catch (err) {
    console.error("[knowledge] fatal error (/):", err);
    res.status(500).json({
      success: false,
      error: "knowledge_fetch_failed",
    });
  }
});

/**
 * Ek aliaslar (geri uyumluluk için):
 *   GET /api/knowledge/geo?q=Sapanca
 *   GET /api/knowledge/geo/knowledge?q=Sapanca
 */
router.get("/geo", async (req, res) => {
  try {
    const data = await buildKnowledge(req.query.q);
    res.json(data);
  } catch (err) {
    console.error("[knowledge] fatal error (/geo):", err);
    res.status(500).json({
      success: false,
      error: "knowledge_fetch_failed",
    });
  }
});

router.get("/geo/knowledge", async (req, res) => {
  try {
    const data = await buildKnowledge(req.query.q);
    res.json(data);
  } catch (err) {
    console.error("[knowledge] fatal error (/geo/knowledge):", err);
    res.status(500).json({
      success: false,
      error: "knowledge_fetch_failed",
    });
  }
});

export default router;
