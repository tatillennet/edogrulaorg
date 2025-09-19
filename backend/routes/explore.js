// backend/routes/explore.js
import express from "express";
import Business from "../models/Business.js";

const router = express.Router();

/** Arama sırasında yok sayılacak yaygın kelimeler */
const STOP_WORDS = new Set([
  "ev", "evleri", "otel", "otelleri", "konaklama",
  "fiyat", "fiyatları", "fiyatlari",
  "en", "icin", "için", "ve", "veya",
  "yakın", "yakini", "yakınında",
  "the", "&", "-", "–"
]);

/** Güvenli case-insensitive regex */
const rx = (s) => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

/** Snippet üreticisi: description > summary > features > type + konum */
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

router.get("/", async (req, res) => {
  try {
    const qRaw = String(req.query.q || "").trim();

    if (!qRaw) {
      return res.json({
        vertical: "web",
        location: "",
        places: [],
        results: [],
        suggestions: [],
        trending: [],
      });
    }

    // Kelimelere ayır, stop-word ve çok kısaları ele
    const tokens = qRaw
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^\p{L}\p{N}@._+-]+/gu, ""))
      .filter((t) => t && t.length > 2 && !STOP_WORDS.has(t));

    // Sadece rakamları çıkar (telefon araması için)
    const digits = qRaw.replace(/\D/g, "");

    // Her token en az bir alanda geçsin
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
            ],
          }))
        : [{
            $or: [
              { name: rx(qRaw) },
              { address: rx(qRaw) },
              { city: rx(qRaw) },
              { district: rx(qRaw) },
              { instagramUsername: rx(qRaw) },
              { type: rx(qRaw) },
            ],
          }];

    // 6+ haneli rakam verdiyse telefon alanlarında da ara
    if (digits.length >= 6) {
      andParts.push({
        $or: [
          { phone: rx(digits) },
          { phones: rx(digits) }, // array alanında regex ile eşleşir
        ],
      });
    }

    const filter = { $and: andParts };
    // Onay filtrelemek istersen:
    // Object.assign(filter, { status: { $in: ["approved", "pending"] } });

    // Çek
    const docs = await Business.find(filter)
      .sort({ verified: -1, createdAt: -1 })
      .limit(30)
      .lean();

    const placeholder =
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=800&auto=format&fit=crop";

    // 🔗 HER ZAMAN YEREL DETAY ROTASI
    const places = docs.slice(0, 4).map((b) => ({
      name: b.name,
      url: `/isletme/${b.slug || b._id}`,
      image: (Array.isArray(b.gallery) && b.gallery[0]) || placeholder,
      slug: b.slug || String(b._id),
    }));

    const results = docs.map((b) => ({
      title: b.name,
      url: `/isletme/${b.slug || b._id}`,
      snippet: buildSnippet(b),
      breadcrumbs: [`edogrula.org › ${b.slug || b._id}`],
      slug: b.slug || String(b._id),
    }));

    const suggestions = [
      qRaw,
      ...(docs[0]?.city ? [`${docs[0].city} bungalov evleri`] : []),
      "instagram doğrulama",
      "işletme telefonu sorgula",
    ].filter(Boolean);

    const trending = [
      ...new Set(
        docs
          .map((d) => d.instagramUsername)
          .concat(
            docs
              .map((d) => d.website)
              .filter(Boolean)
              .map((w) => {
                try { return new URL(w).hostname.replace(/^www\./, ""); }
                catch { return null; }
              })
              .filter(Boolean)
          )
          .filter(Boolean)
      ),
    ].slice(0, 5);

    const location =
      /sapanca/i.test(qRaw) ? "Sapanca" : docs[0]?.district || docs[0]?.city || "";

    // UI’da üstte konaklama şeridi olduğundan vertical’ı "lodging" bırakıyoruz
    return res.json({
      vertical: "lodging",
      location,
      places,
      results,
      suggestions,
      trending,
    });
  } catch (e) {
    console.error("explore error:", e);
    return res.json({
      vertical: "web",
      location: "",
      places: [],
      results: [],
      suggestions: [],
      trending: [],
    });
  }
});

export default router;
