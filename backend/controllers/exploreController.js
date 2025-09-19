// backend/controllers/exploreController.js
import Business from "../models/Business.js";
import Report from "../models/Report.js";
import Blacklist from "../models/Blacklist.js";

const toHost = (url = "") => {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch { return ""; }
};

const rx = (q) => {
  try { return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); }
  catch { return new RegExp(q, "i"); }
};

// Mümkün tüm alan adlarını kapsayan OR filtresi (sende hangi alan varsa ona denk gelir)
const buildBusinessFilter = (re) => ({
  $or: [
    { name: re }, { ad: re },
    { type: re }, { tur: re },
    { address: re }, { adres: re },
    { desc: re }, { aciklama: re },
    { instagram: re }, { instagramHandle: re }, { instagram_user: re },
    { instagramUrl: re }, { instagram_url: re },
    { website: re }, { url: re }, { site: re },
    { phone: re }, { telefon: re }, { tel: re },
    { email: re }, { eposta: re },
    { tags: re }, { etiketler: re },
    { city: re }, { ilce: re }, { sehir: re },
  ].map((f) => ({ ...f })),
});

export async function explore(req, res, next) {
  try {
    const q = String(req.query.q || "").trim();
    const tab = String(req.query.tab || "all").toLowerCase();

    const baseSuggestions = [
      "sapanca bungalov evleri",
      "kartepe bungalov evleri",
      "kocaeli bungalov evleri",
      "instagram doğrulama",
      "otel yorumları güvenilir mi",
      "işletme telefonu sorgula",
    ];

    if (!q) {
      return res.json({
        vertical: "web",
        location: "",
        places: [],
        results: [],
        suggestions: baseSuggestions,
        trending: [],
        tab,
      });
    }

    const re = rx(q);

    const [biz, reps, bls] = await Promise.all([
      Business.find(buildBusinessFilter(re))
        .sort({ verified: -1, updatedAt: -1, createdAt: -1 })
        .limit(30),
      Report.find({
        $or: [
          { title: re }, { description: re }, { summary: re },
          { instagram: re }, { website: re }, { phone: re }
        ],
      })
        .sort({ createdAt: -1 })
        .limit(30),
      Blacklist.find({
        $or: [
          { businessName: re }, { notes: re }, { reason: re },
          { instagram: re }, { website: re }, { phone: re }
        ],
      })
        .sort({ createdAt: -1 })
        .limit(30),
    ]);

    // “Konaklama” anahtar sözcük sezgisi
    const lodgingLike = /(sapanca|kartepe|bungalov|otel|konaklama|villa|evleri)/i.test(q);

    // Business -> “places” şeridi (varsa)
    const places = lodgingLike
      ? biz.slice(0, 8).map((b) => {
          const handle =
            b.instagram || b.instagramHandle || b.instagram_user || "";
          const site =
            b.website || b.url || b.instagramUrl || b.instagram_url || "";
          const images = b.images || b.photos || [];
          return {
            name: b.name || b.ad,
            url: site || (handle ? `https://instagram.com/${String(handle).replace(/^@/, "")}` : "#"),
            image: Array.isArray(images) && images[0] ? images[0] : "",
            rating: b.rating || (b.verified ? 9.2 : 8.8),
            votes: b.votes || 100,
          };
        })
      : [];

    // Organik sonuç listesi
    const results = [
      ...biz.map((b) => {
        const title = b.name || b.ad || "İşletme";
        const snippet =
          b.desc || b.aciklama || b.address || b.adres || "";
        const handle =
          b.instagram || b.instagramHandle || b.instagram_user || "";
        const site =
          b.website || b.url || b.instagramUrl || b.instagram_url || "";
        return {
          title,
          url: site || (handle ? `https://instagram.com/${String(handle).replace(/^@/, "")}` : ""),
          snippet,
          breadcrumbs: [toHost(site || handle)].filter(Boolean),
          rating: b.rating,
          votes: b.votes,
        };
      }),
      ...reps.map((r1) => ({
        title: r1.title || "Rapor",
        url:
          r1.website ||
          (r1.instagram ? `https://instagram.com/${String(r1.instagram).replace(/^@/, "")}` : ""),
        snippet: r1.summary || r1.description || "",
        breadcrumbs: [toHost(r1.website || r1.instagram || "")].filter(Boolean),
      })),
      ...bls.map((b1) => ({
        title: (b1.businessName || "Kara Liste") + " – Kara Liste",
        url:
          b1.website ||
          (b1.instagram ? `https://instagram.com/${String(b1.instagram).replace(/^@/, "")}` : ""),
        snippet: b1.reason || b1.notes || "",
        breadcrumbs: [toHost(b1.website || b1.instagram || "")].filter(Boolean),
      })),
    ];

    // Öneriler & trend
    const fromDbNames = [
      ...biz.map((b) => b.name || b.ad),
      ...bls.map((b) => `${b.businessName} (kara liste)`),
    ].filter(Boolean);

    const seen = new Set();
    const suggestions = [...fromDbNames, ...baseSuggestions]
      .filter((s) => {
        const k = s.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return !q || k.includes(q.toLowerCase());
      })
      .slice(0, 8);

    const trending = [
      ...new Set(
        [
          ...biz.map((b) => toHost(b.website || b.url || "")),
          ...biz.map((b) =>
            (b.instagram || b.instagramHandle || b.instagram_user)
              ? `@${String(b.instagram || b.instagramHandle || b.instagram_user).replace(/^@/, "")}`
              : ""
          ),
        ].filter(Boolean)
      ),
    ].slice(0, 8);

    res.json({
      vertical: lodgingLike ? "lodging" : "web",
      location: lodgingLike && /sapanca/i.test(q) ? "Sapanca" : "",
      places,
      results,
      suggestions,
      trending,
      tab,
    });
  } catch (e) {
    next(e);
  }
}
