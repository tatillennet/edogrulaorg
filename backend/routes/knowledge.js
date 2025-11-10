// backend/routes/knowledge.js
import express from "express";
import axios from "axios";

const router = express.Router();

// Ortak HTTP client (timeout ile)
const http = axios.create({
  timeout: 8000,
});

/**
 * Verilen q için:
 * - (opsiyonel) Google Places: konum + url
 * - Wikipedia (TR): özet
 * - (opsiyonel) Open-Meteo: hava durumu
 */
async function buildKnowledge(qInput) {
  // Basit sanitizasyon
  const raw = (qInput ?? "Sapanca").toString().trim();
  const q = raw.slice(0, 120) || "Sapanca";

  const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";

  let place = null;
  let wiki = null;
  let weather = null;

  /* -------- 1) Google Places (opsiyonel) -------- */
  if (GOOGLE_PLACES_API_KEY) {
    try {
      const ts = await http.get(
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
        const det = await http.get(
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

        const r = det.data?.result || {};
        place = {
          place_id: cand.place_id,
          name: r.name || cand.name || null,
          address: r.formatted_address || null,
          url: r.url || null,
          geometry: r.geometry || cand.geometry || null,
        };
      }
    } catch (err) {
      console.warn("[knowledge] Google Places hatası:", err.message);
    }
  }

  /* -------- 2) Wikipedia TR -------- */
  try {
    const wikiRes = await http.get(
      `https://tr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        q
      )}`,
      {
        // 404 vs. durumlarda throw etmesin, biz kontrol ederiz
        validateStatus: (status) => status >= 200 && status < 500,
      }
    );

    if (wikiRes.status >= 200 && wikiRes.status < 300) {
      wiki = wikiRes.data;
    }
  } catch (err) {
    console.warn("[knowledge] Wikipedia hatası:", err.message);
  }

  /* -------- 3) Open-Meteo (koordinat varsa) -------- */
  const loc =
    place?.geometry?.location &&
    typeof place.geometry.location.lat === "number" &&
    typeof place.geometry.location.lng === "number"
      ? {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
        }
      : null;

  if (loc) {
    try {
      const wRes = await http.get("https://api.open-meteo.com/v1/forecast", {
        params: {
          latitude: loc.lat,
          longitude: loc.lng,
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
  const coordinates = loc || null;
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
 * Ortak handler (tüm route alias'ları bunu kullanıyor)
 */
async function knowledgeRoute(req, res) {
  try {
    const data = await buildKnowledge(req.query.q);
    // Biraz cache dostu olsun
    res.set("Cache-Control", "public, max-age=600, s-maxage=600"); // 10 dk
    res.json(data);
  } catch (err) {
    console.error("[knowledge] fatal error:", err);
    res.status(500).json({
      success: false,
      error: "knowledge_fetch_failed",
    });
  }
}

/**
 * Ana endpoint:
 *   GET /api/knowledge?q=Sapanca
 */
router.get("/", knowledgeRoute);

/**
 * Alias'lar (geri uyumluluk):
 *   GET /api/knowledge/geo?q=Sapanca
 *   GET /api/knowledge/geo/knowledge?q=Sapanca
 */
router.get("/geo", knowledgeRoute);
router.get("/geo/knowledge", knowledgeRoute);

export default router;
