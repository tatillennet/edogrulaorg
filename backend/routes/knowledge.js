import express from "express";
import axios from "axios";

const router = express.Router();

// /api/geo/knowledge?q=Sapanca
router.get("/geo/knowledge", async (req, res) => {
  const q = (req.query.q || "Sapanca").trim();
  try {
    const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

    // 1) (opsiyonel) Google Places → koordinat + harita URL
    let place = null;
    if (GOOGLE_PLACES_API_KEY) {
      const ts = await axios.get(
        "https://maps.googleapis.com/maps/api/place/textsearch/json",
        { params: { query: q, language: "tr", region: "tr", key: GOOGLE_PLACES_API_KEY } }
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
              key: GOOGLE_PLACES_API_KEY
            }
          }
        );
        place = { ...det.data?.result, place_id: cand.place_id };
      }
    }

    // 2) Wikipedia TR → kısa özet + başlık
    const wiki = await axios.get(
      `https://tr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`
    );

    // 3) Open-Meteo → hava (koordinat varsa)
    let weather = null;
    if (place?.geometry?.location) {
      const { lat, lng } = {
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng
      };
      const w = await axios.get("https://api.open-meteo.com/v1/forecast", {
        params: {
          latitude: lat,
          longitude: lng,
          current_weather: true,
          daily: "temperature_2m_max,temperature_2m_min,weathercode",
          timezone: "auto"
        }
      });
      weather = w.data;
    }

    res.json({
      title: wiki.data?.titles?.display || place?.name || q,
      subtitle: wiki.data?.description || "Bilgi",
      summary: wiki.data?.extract || null,
      wiki_url: wiki.data?.content_urls?.desktop?.page || null,
      coordinates: place?.geometry?.location || null,
      gmap_url: place?.url || null,
      weather
    });
  } catch (err) {
    res.status(500).json({ error: "knowledge_fetch_failed", detail: err.message });
  }
});

export default router;
