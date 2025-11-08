// backend/routes/admin.featured.js — Pro (esnek create + reorder + public list)
import express from "express";
import mongoose from "mongoose";
import Business from "../models/Business.js";

// Featured modeli: varsa kullan, yoksa güvenli şekilde tanımla
const Featured =
  mongoose.models.Featured ||
  mongoose.model(
    "Featured",
    new mongoose.Schema(
      {
        title: { type: String, required: true, trim: true },
        subtitle: { type: String, trim: true },
        placement: { type: String, default: "home", index: true }, // home|category|search|custom
        order: { type: Number, default: 1, index: true },
        status: {
          type: String,
          enum: ["active", "draft", "scheduled", "expired", "archived"],
          default: "draft",
          index: true,
        },
        startAt: { type: Date },
        endAt: { type: Date },

        // İşletme bağları
        businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", index: true },
        businessSlug: { type: String, index: true },
        businessName: { type: String },

        // Vitrin görseli & link
        imageUrl: { type: String },
        href: { type: String },
      },
      { timestamps: true, collection: "featureds" }
    )
  );

const adminFeaturedRouter = express.Router();
const publicFeaturedRouter = express.Router();

/* ---------------- utils ---------------- */
function parseListParams(req, { defLimit = 20, maxLimit = 200 } = {}) {
  const limit = Math.max(1, Math.min(+req.query.limit || defLimit, maxLimit));
  const page = Math.max(1, +req.query.page || 1);
  const skip = (page - 1) * limit;

  const sort = {};
  const sortParam = String(req.query.sort || "order,-createdAt");
  for (const part of sortParam.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (part.startsWith("-")) sort[part.slice(1)] = -1;
    else sort[part] = 1;
  }
  const dateFilter = {};
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  if (from || to) {
    dateFilter.createdAt = {};
    if (from && !isNaN(from)) dateFilter.createdAt.$gte = from;
    if (to && !isNaN(to)) dateFilter.createdAt.$lte = to;
  }
  return { limit, page, skip, sort, dateFilter };
}

function pickImage(b) {
  return (
    b?.coverImage ||
    b?.coverUrl ||
    b?.imageUrl ||
    (Array.isArray(b?.images) && (b.images[0]?.url || b.images[0])) ||
    (Array.isArray(b?.photos) && (b.photos[0]?.url || b.photos[0])) ||
    (Array.isArray(b?.gallery) && b.gallery[0]) ||
    ""
  );
}

async function hydrateFromBusiness(payload) {
  if (!payload.businessId) return payload;
  const b = await Business.findById(payload.businessId).lean();
  if (!b) return payload;
  return {
    ...payload,
    businessSlug: payload.businessSlug || b.slug || "",
    businessName: payload.businessName || b.name || "",
    imageUrl: payload.imageUrl || pickImage(b),
  };
}

/* ---------------- Admin: list ---------------- */
adminFeaturedRouter.get("/", async (req, res) => {
  try {
    const { limit, page, skip, sort, dateFilter } = parseListParams(req);
    const filter = { ...dateFilter };

    if (req.query.q) {
      const q = String(req.query.q).trim();
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { title: rx },
        { subtitle: rx },
        { businessName: rx },
        { businessSlug: rx },
        { href: rx },
      ];
    }
    if (typeof req.query.status === "string" && req.query.status !== "all") {
      filter.status = req.query.status;
    }
    if (typeof req.query.placement === "string" && req.query.placement !== "all") {
      filter.placement = req.query.placement;
    }

    const [items, total] = await Promise.all([
      Featured.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Featured.countDocuments(filter),
    ]);

    res.json({
      success: true,
      featured: items,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
    });
  } catch (e) {
    console.error("admin featured list error:", e);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

/* ---------------- Admin: create (esnek) ---------------- */
adminFeaturedRouter.post("/", async (req, res) => {
  try {
    let payload = { ...req.body };

    // Minimum doğrulama: title zorunlu
    if (!payload.title || String(payload.title).trim().length < 2) {
      return res.status(400).json({ success: false, message: "title gerekli" });
    }

    // İşletme varsa bilgileri doldur
    payload = await hydrateFromBusiness(payload);

    // Sıra yoksa otomatik ver
    if (typeof payload.order !== "number") {
      const max = await Featured.findOne({}, { order: 1 }).sort({ order: -1 }).lean();
      payload.order = (max?.order || 0) + 1;
    }

    // Varsayılanlar
    payload.placement = payload.placement || "home";
    payload.status = payload.status || "draft";

    const doc = await Featured.create(payload);
    res.status(201).json({ success: true, item: doc });
  } catch (e) {
    console.error("admin featured create error:", e);
    res.status(500).json({ success: false, message: "Kaydedilemedi" });
  }
});

/* ---------------- Admin: update ---------------- */
adminFeaturedRouter.patch("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    let patch = { ...req.body };

    // İşletme değişirse yeniden doldur
    if (patch.businessId) patch = await hydrateFromBusiness(patch);

    const updated = await Featured.findByIdAndUpdate(id, patch, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: "Bulunamadı" });
    res.json({ success: true, item: updated });
  } catch (e) {
    console.error("admin featured patch error:", e);
    res.status(500).json({ success: false, message: "Güncellenemedi" });
  }
});

/* ---------------- Admin: delete ---------------- */
adminFeaturedRouter.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await Featured.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (e) {
    console.error("admin featured delete error:", e);
    res.status(500).json({ success: false, message: "Silinemedi" });
  }
});

/* ---------------- Admin: bulk ops ---------------- */
adminFeaturedRouter.post("/bulk", async (req, res) => {
  try {
    const ids = (req.body.ids || []).map((x) => new mongoose.Types.ObjectId(String(x)));
    if (!ids.length) return res.json({ success: true, updated: 0 });

    if (req.body.op === "status") {
      const value = String(req.body.value || "draft");
      const r = await Featured.updateMany({ _id: { $in: ids } }, { $set: { status: value } });
      return res.json({ success: true, updated: r.modifiedCount || 0 });
    }
    if (req.body.op === "delete") {
      const r = await Featured.deleteMany({ _id: { $in: ids } });
      return res.json({ success: true, deleted: r.deletedCount || 0 });
    }
    res.status(400).json({ success: false, message: "Geçersiz işlem" });
  } catch (e) {
    console.error("admin featured bulk error:", e);
    res.status(500).json({ success: false, message: "Bulk işlem hatası" });
  }
});

/* ---------------- Admin: reorder ---------------- */
adminFeaturedRouter.post("/reorder", async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    for (const it of items) {
      if (!it?.id) continue;
      await Featured.findByIdAndUpdate(it.id, { $set: { order: Number(it.order || 0) } });
    }
    res.json({ success: true });
  } catch (e) {
    console.error("admin featured reorder error:", e);
    res.status(500).json({ success: false, message: "Sıra kaydedilemedi" });
  }
});

/* ---------------- Public: list (aktif) ---------------- */
publicFeaturedRouter.get("/", async (req, res) => {
  try {
    const filter = { status: "active" };
    if (req.query.placement) filter.placement = req.query.placement;
    const rows = await Featured.find(filter).sort({ order: 1, createdAt: -1 }).lean();
    res.json({ success: true, items: rows });
  } catch (e) {
    console.error("public featured list error:", e);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

/* ---------------- Public: CSV ---------------- */
publicFeaturedRouter.get("/export.csv", async (req, res) => {
  try {
    const rows = await Featured.find({}).sort({ order: 1, createdAt: -1 }).lean();
    const keys = [
      "title","subtitle","placement","order","status","startAt","endAt",
      "businessId","businessSlug","businessName","imageUrl","href","createdAt"
    ];
    const esc = (v) => `"${(v == null ? "" : String(v)).replace(/\"/g, '\"\"')}"`;
    const body = rows.map(r => keys.map(k => esc(r[k])).join(";")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=featured.csv");
    res.send("\uFEFF" + keys.join(";") + "\n" + body + "\n");
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

export { publicFeaturedRouter, adminFeaturedRouter };
