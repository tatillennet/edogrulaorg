// backend/routes/admin.js
import express from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const router = express.Router();

/* ---------------------------------------------------------------------------
 * AUTH — JWT (role:"admin") veya ADMIN_KEY
 * ------------------------------------------------------------------------- */
function getTokenFromReq(req) {
  const hdr = req.headers.authorization || "";
  const bearer = hdr.startsWith("Bearer ") ? hdr.slice(7).trim() : null;
  return req.cookies?.token || bearer || null;
}

function requireAdmin(req, res, next) {
  try {
    // 1) ADMIN_KEY bypass (x-admin-key veya Bearer ADMIN_KEY)
    const needed = process.env.ADMIN_KEY;
    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const sentKey = req.headers["x-admin-key"] || bearer;
    if (needed && sentKey && String(sentKey) === String(needed)) {
      req.user = { isAdmin: true, method: "key" };
      return next();
    }

    // 2) JWT kontrolü
    const tok = getTokenFromReq(req);
    if (!tok) return res.status(401).json({ success: false, message: "Yetkisiz (token yok)" });

    let payload;
    try {
      payload = jwt.verify(tok, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: "Geçersiz token" });
    }
    if (payload?.role !== "admin") {
      return res.status(403).json({ success: false, message: "Forbidden (admin gerekli)" });
    }
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Yetkilendirme hatası" });
  }
}

/* ---------------------------------------------------------------------------
 * Yardımcılar
 * ------------------------------------------------------------------------- */
const BUSINESS_MODEL_CANDIDATES = ["Business", "Company", "Listing"];

function pickModel(nameList = []) {
  for (const n of nameList) if (mongoose.models[n]) return mongoose.models[n];
  return null;
}

function parseListParams(req, { defLimit = 50, maxLimit = 200 } = {}) {
  const limit = Math.max(1, Math.min(+req.query.limit || defLimit, maxLimit));
  const page = Math.max(1, +req.query.page || 1);
  const skip = (page - 1) * limit;

  const sort = {};
  const sortParam = String(req.query.sort || "-createdAt");
  for (const part of sortParam.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (part.startsWith("-")) sort[part.slice(1)] = -1;
    else sort[part] = 1;
  }

  let fields;
  if (req.query.fields) {
    fields = String(req.query.fields)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
  }

  const dateFilter = {};
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  if (from || to) {
    dateFilter.createdAt = {};
    if (from && !isNaN(from)) dateFilter.createdAt.$gte = from;
    if (to && !isNaN(to)) dateFilter.createdAt.$lte = to;
  }

  return { limit, page, skip, sort, fields, dateFilter };
}

function safeRegex(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  return new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function isObjectIdLike(v) {
  try {
    return Boolean(new mongoose.Types.ObjectId(String(v)));
  } catch {
    return false;
  }
}

function buildCommonSearch(q) {
  const s = String(q || "").trim();
  if (!s) return {};
  if (isObjectIdLike(s)) return { _id: new mongoose.Types.ObjectId(s) };
  const rx = safeRegex(s);
  return {
    $or: [
      { name: rx },
      { title: rx },
      { slug: rx },
      { phone: rx },
      { email: rx },
      { instagramUsername: rx },
      { instagramUrl: rx },
      { website: rx },
      { address: rx },
      { desc: rx },
      // legacy alanlar:
      { businessName: rx },
      { legalName: rx },
      { instagram: rx },
      { phoneMobile: rx },
    ],
  };
}

function toCSV(rows = []) {
  const BOM = "\uFEFF";
  if (!rows.length) return BOM + "id\n";
  const keySet = new Set(["_id"]);
  rows.forEach((r) => Object.keys(r).forEach((k) => keySet.add(k)));
  const keys = Array.from(keySet);
  const esc = (v) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = keys.map(esc).join(";");
  const body = rows.map((row) => keys.map((k) => esc(k === "_id" ? row._id : row[k])).join(";")).join("\n");
  return BOM + header + "\n" + body + "\n";
}

function parseIdsParam(idsParam) {
  if (!idsParam) return [];
  return String(idsParam)
    .split(",")
    .map((s) => s.trim())
    .filter(isObjectIdLike)
    .map((s) => new mongoose.Types.ObjectId(s));
}

function fileBase(req) {
  const env = (process.env.FILE_BASE_URL || "").replace(/\/+$/, "");
  if (env) return env;
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "http");
  const host = req.get("host");
  return `${proto}://${host}`;
}
function absUrl(req, rel) {
  if (!rel) return undefined;
  if (/^https?:\/\//i.test(rel)) return rel;
  const clean = String(rel).replace(/^\/+/, "");
  return `${fileBase(req)}/${clean}`;
}
function mapFiles(list, req) {
  const out = [];
  (list || []).forEach((it) => {
    if (!it) return;
    if (typeof it === "string") {
      out.push({ url: absUrl(req, it) });
    } else {
      const o = { ...it };
      if (o.path) o.path = String(o.path).replace(/^\/+/, "");
      o.url = o.url || absUrl(req, o.path);
      out.push(o);
    }
  });
  return out;
}

const igUserFromUrl = (u = "") => {
  const m = String(u).match(/instagram\.com\/(@?[\w.]+)/i);
  return m ? m[1].replace(/^@/, "") : "";
};

const mapVerification = (v, req) => ({
  _id: String(v._id),
  source: "verification",
  name: v.name,
  type: v.type,
  instagramUsername: v.instagramUsername,
  instagramUrl: v.instagramUrl,
  phone: v.phone,
  address: v.address,
  email: v.email || "",
  status: v.status || "pending",
  note: v.note || "",
  documents: mapFiles(
    v.documents || v.attachments || v.evidences || v.images || v.docs,
    req
  ),
  createdAt: v.createdAt,
});

const mapApplyLegacy = (a, req) => {
  const igUrl = a.instagramUrl || a.instagram || "";
  const igU = a.instagramUsername || igUserFromUrl(igUrl);
  const docs = mapFiles(a.documents || a.docs || a.attachments || a.evidences, req);
  const imgs = mapFiles(a.images, req);
  return {
    _id: String(a._id),
    source: "apply",
    name: a.businessName || a.name || a.legalName || "",
    type: a.type || "",
    instagramUsername: igU,
    instagramUrl: igUrl,
    phone: a.phoneMobile || a.phone || a.phoneFixed || "",
    address: a.address || "",
    email: a.email || "",
    status: a.status || "pending",
    note: a.note || "",
    documents: [...docs, ...imgs],
    createdAt: a.createdAt,
  };
};

router.get("/me", requireAdmin, (req, res) => {
  res.json({ success: true, user: req.user || null });
});

router.get("/businesses", requireAdmin, async (req, res) => {
  try {
    const Business = pickModel(BUSINESS_MODEL_CANDIDATES);
    if (!Business) {
      return res.json({
        success: true,
        businesses: [],
        total: 0,
        note: "Business modeli bulunamadı (isim farklı olabilir).",
      });
    }

    const { limit, page, skip, sort, fields, dateFilter } = parseListParams(req);
    const filter = { ...buildCommonSearch(req.query.q), ...dateFilter };

    const idList = parseIdsParam(req.query.ids);
    if (idList.length) filter._id = { $in: idList };

    if (typeof req.query.status === "string" && req.query.status !== "all") {
      filter.status = req.query.status;
    }
    if (typeof req.query.verified === "string") {
      const v = req.query.verified.toLowerCase();
      if (v === "true" || v === "false") filter.verified = v === "true";
    }

    const query = Business.find(filter).sort(sort).skip(skip).limit(limit).lean();
    if (fields) query.select(fields);

    const [items, total] = await Promise.all([query, Business.countDocuments(filter)]);

    if (String(req.query.format).toLowerCase() === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=businesses.csv");
      return res.send(toCSV(items));
    }

    res.json({ success: true, businesses: items, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("[admin/businesses] error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

router.get("/requests", requireAdmin, async (req, res) => {
  try {
    const Verification = mongoose.models.VerificationRequest || null;
    const Apply =
      mongoose.models.ApplyRequest ||
      mongoose.models.Application ||
      mongoose.models.Apply ||
      mongoose.models.Request ||
      mongoose.models.BusinessRequest ||
      null;

    if (!Verification && !Apply) {
      return res.json({ success: true, requests: [], pending: [], approved: [], rejected: [], total: 0 });
    }

    const { limit, page, skip, sort, fields, dateFilter } = parseListParams(req);
    const commonFilter = { ...buildCommonSearch(req.query.q), ...dateFilter };

    const vf = { ...commonFilter };
    if (req.query.email) vf.email = String(req.query.email).trim().toLowerCase();
    if (req.query.instagramUsername) vf.instagramUsername = String(req.query.instagramUsername).replace(/^@/, "");
    if (req.query.phone) vf.phone = String(req.query.phone).replace(/[^\d+]/g, "");
    const ids = parseIdsParam(req.query.ids);
    if (ids.length) vf._id = { $in: ids };
    if (typeof req.query.status === "string" && req.query.status !== "all") vf.status = req.query.status;

    const af = { ...commonFilter };
    if (req.query.email) af.email = String(req.query.email).trim().toLowerCase();
    if (req.query.instagramUsername) {
      const r = safeRegex(String(req.query.instagramUsername).replace(/^@/, ""));
      af.$or = [{ instagramUsername: r }, { instagramUrl: r }, { instagram: r }];
    }
    if (req.query.phone) {
      const p = String(req.query.phone).replace(/[^\d+]/g, "");
      af.$or = [...(af.$or || []), { phoneMobile: safeRegex(p) }, { phone: safeRegex(p) }];
    }
    if (ids.length) af._id = { $in: ids };
    if (typeof req.query.status === "string" && req.query.status !== "all") af.status = req.query.status;

    const [verArr, verTotal] = Verification
      ? await Promise.all([Verification.find(vf).sort(sort).lean(), Verification.countDocuments(vf)])
      : [[], 0];

    const [appArr, appTotal] = Apply
      ? await Promise.all([Apply.find(af).sort(sort).lean(), Apply.countDocuments(af)])
      : [[], 0];

    const merged = [
      ...verArr.map((v) => mapVerification(v, req)),
      ...appArr.map((a) => mapApplyLegacy(a, req)),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const slice = merged.slice(skip, skip + limit);
    const total = verTotal + appTotal;

    const pending = merged.filter((x) => (x.status || "pending") === "pending");
    const approved = merged.filter((x) => x.status === "approved");
    const rejected = merged.filter((x) => x.status === "rejected");

    if (String(req.query.format).toLowerCase() === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=requests.csv");
      return res.send(toCSV(slice));
    }

    res.json({
      success: true,
      requests: slice,
      page,
      limit,
      pages: Math.ceil(total / limit),
      total,
      pending,
      approved,
      rejected,
    });
  } catch (err) {
    console.error("[admin/requests] error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

router.get("/requests/:id", requireAdmin, async (req, res) => {
  try {
    if (!isObjectIdLike(req.params.id))
      return res.status(400).json({ success: false, message: "Geçersiz id" });

    const id = new mongoose.Types.ObjectId(req.params.id);

    const Verification = mongoose.models.VerificationRequest || null;
    const Apply =
      mongoose.models.ApplyRequest ||
      mongoose.models.Application ||
      mongoose.models.Apply ||
      mongoose.models.Request ||
      mongoose.models.BusinessRequest ||
      null;

    const v = Verification ? await Verification.findById(id).lean() : null;
    if (v) return res.json({ success: true, request: mapVerification(v, req) });

    const a = Apply ? await Apply.findById(id).lean() : null;
    if (a) return res.json({ success: true, request: mapApplyLegacy(a, req) });

    return res.status(404).json({ success: false, message: "Kayıt bulunamadı" });
  } catch (err) {
    console.error("[admin/requests/:id] error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

router.patch("/requests/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status, rejectReason } = req.body || {};
    const allowed = ["approved", "rejected", "pending"];
    if (!allowed.includes(String(status || "")))
      return res.status(400).json({ success: false, message: "Geçersiz status" });
    if (!isObjectIdLike(req.params.id))
      return res.status(400).json({ success: false, message: "Geçersiz id" });

    const id = new mongoose.Types.ObjectId(req.params.id);
    const update = {
      status,
      reviewedAt: new Date(),
    };
    if (rejectReason != null) update.rejectReason = String(rejectReason);
    if (req.user?._id) update.reviewedBy = req.user._id;

    const Verification = mongoose.models.VerificationRequest || null;
    const Apply =
      mongoose.models.ApplyRequest ||
      mongoose.models.Application ||
      mongoose.models.Apply ||
      mongoose.models.Request ||
      mongoose.models.BusinessRequest ||
      null;

    let doc = null;
    if (Verification) {
      doc = await Verification.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
      if (doc) return res.json({ success: true, request: mapVerification(doc, req) });
    }
    if (Apply) {
      doc = await Apply.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
      if (doc) return res.json({ success: true, request: mapApplyLegacy(doc, req) });
    }

    return res.status(404).json({ success: false, message: "Kayıt bulunamadı" });
  } catch (err) {
    console.error("[admin/requests/:id/status] error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// ===========================================================================
// BAŞVURU ONAYLAMA - SON VE KARARLI HALİ
// =================================----------------==========================
router.post("/requests/:id/approve", requireAdmin, async (req, res) => {
  console.log(`[APPROVE] --- ONAY İŞLEMİ BAŞLADI ---`);
  try {
    if (!isObjectIdLike(req.params.id)) {
      console.error(`[APPROVE] HATA: Geçersiz ID formatı: ${req.params.id}`);
      return res.status(400).json({ success: false, message: "Geçersiz id" });
    }
    const id = new mongoose.Types.ObjectId(req.params.id);
    console.log(`[APPROVE] 1. Adım: Başvuru işleniyor, ID: ${id}`);

    const Apply = mongoose.models.ApplyRequest || null;
    const Verification = mongoose.models.VerificationRequest || null;

    const src = (Apply && (await Apply.findById(id))) || (Verification && (await Verification.findById(id)));
    if (!src) {
      console.error(`[APPROVE] HATA: Başvuru kaydı bulunamadı, ID: ${id}`);
      return res.status(404).json({ success: false, message: "Kayıt bulunamadı" });
    }
    console.log(`[APPROVE] 2. Adım: Başvuru kaydı bulundu (${src.constructor.modelName})`);

    const Business = pickModel(BUSINESS_MODEL_CANDIDATES);
    if (!Business) {
      console.error("[APPROVE] KRİTİK HATA: Business modeli bulunamadı!");
      return res.status(500).json({ success: false, message: "Business modeli yok" });
    }

    // --- DÜZELTME 1: Instagram verisini doğru ayrıştırma ---
    const rawIg = src.instagramUrl || src.instagram || src.instagramUsername || "";
    const igUser = igUserFromUrl(rawIg) || rawIg.split("/").pop().replace(/^@/, "");
    const igUrl = rawIg && rawIg.startsWith("http") ? rawIg : `https://instagram.com/${igUser}`;
    const phone = src.phoneMobile || src.phone || src.phoneFixed || "";

    const businessPayload = {
      name: src.businessName || src.name || src.legalName || "İsimsiz İşletme",
      type: src.type || "Bilinmiyor",
      phone: phone,
      instagramUsername: igUser, // Artık sadece kullanıcı adı içerecek
      instagramUrl: igUrl,     // Her zaman tam URL içerecek
      address: src.address || "",
      email: src.email || "",
      website: src.website || "",
      status: "approved",
      verified: true,
    };

    const imgs = Array.isArray(src.images) ? src.images.filter(Boolean) : [];
    if (imgs.length) {
      businessPayload.gallery = Array.from(new Set(imgs));
    }
    console.log("[APPROVE] 3. Adım: Business koleksiyonuna yazılacak DÜZELTİLMİŞ veri:", businessPayload);

    // --- DÜZELTME 2: Veritabanı çakışmasını önlemek için 2 adımlı mantık ---
    const findCond = {
      $or: [
        igUser ? { handle: igUser.toLowerCase() } : null,
        phone ? { phone: phone } : null,
      ].filter(Boolean),
    };

    let businessDoc;
    let existingBusiness = null;

    if (findCond.$or.length > 0) {
      console.log("[APPROVE] 4a. Adım: Mevcut işletme aranıyor...");
      existingBusiness = await Business.findOne(findCond);
    }

    if (existingBusiness) {
      console.log(`[APPROVE] 4b. Adım: Mevcut işletme bulundu (${existingBusiness._id}). Bilgiler güncelleniyor.`);
      businessDoc = await Business.findByIdAndUpdate(existingBusiness._id, businessPayload, { new: true, runValidators: true });
    } else {
      console.log("[APPROVE] 4c. Adım: Mevcut işletme bulunamadı. Yeni işletme oluşturuluyor.");
      businessDoc = await new Business(businessPayload).save();
    }

    if (!businessDoc) {
      console.error("[APPROVE] KRİTİK HATA: Business belgesi oluşturulamadı veya güncellenemedi.");
      throw new Error("İşletme kaydı oluşturma/güncelleme başarısız oldu.");
    }
    console.log(`[APPROVE] 5. Adım: İşletme başarıyla oluşturuldu/güncellendi. ID: ${businessDoc._id}`);
    
    // Başvuruyu 'approved' olarak işaretle
    const updateReq = {
      status: "approved",
      reviewedAt: new Date(),
    };
    if (req.user?._id) updateReq.reviewedBy = req.user._id;

    await src.constructor.updateOne({ _id: id }, { $set: updateReq });
    console.log(`[APPROVE] 6. Adım: Orijinal başvuru 'approved' olarak güncellendi.`);

    const mapped = src.constructor.modelName === "VerificationRequest" ? mapVerification(src, req) : mapApplyLegacy(src, req);
    mapped.status = "approved";
    console.log("[APPROVE] --- ONAY İŞLEMİ BAŞARIYLA TAMAMLANDI ---");
    return res.json({ success: true, request: mapped, business: businessDoc });

  } catch (err) {
    console.error("!!! [APPROVE] ONAYLAMA SIRASINDA KRİTİK BİR HATA OLUŞTU:", err);
    return res.status(500).json({ success: false, message: "Sunucu hatası", error: { message: err.message, stack: err.stack } });
  }
});

router.post("/requests/:id/reject", requireAdmin, async (req, res) => {
  try {
    if (!isObjectIdLike(req.params.id))
      return res.status(400).json({ success: false, message: "Geçersiz id" });

    const id = new mongoose.Types.ObjectId(req.params.id);
    const { rejectReason = "" } = req.body || {};

    const Verification = mongoose.models.VerificationRequest || null;
    const Apply =
      mongoose.models.ApplyRequest ||
      mongoose.models.Application ||
      mongoose.models.Apply ||
      mongoose.models.Request ||
      mongoose.models.BusinessRequest ||
      null;

    const update = {
      status: "rejected",
      rejectReason: String(rejectReason || ""),
      reviewedAt: new Date(),
    };
    if (req.user?._id) update.reviewedBy = req.user._id;

    let found = 0;
    if (Verification) {
      const r = await Verification.updateOne({ _id: id }, { $set: update });
      found += r.matchedCount || r.n || 0;
    }
    if (Apply) {
      const r = await Apply.updateOne({ _id: id }, { $set: update });
      found += r.matchedCount || r.n || 0;
    }
    if (!found) return res.status(404).json({ success: false, message: "Kayıt bulunamadı" });

    return res.json({ success: true });
  } catch (err) {
    console.error("[admin/requests/:id/reject] error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

router.patch("/requests/bulk-status", requireAdmin, async (req, res) => {
  try {
    const { ids = [], status, rejectReason } = req.body || {};
    const allowed = ["approved", "rejected", "pending"];

    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ success: false, message: "ids boş olamaz" });
    if (!allowed.includes(String(status || "")))
      return res.status(400).json({ success: false, message: "Geçersiz status" });

    const validIds = ids.filter(isObjectIdLike).map((s) => new mongoose.Types.ObjectId(String(s)));
    if (!validIds.length) return res.status(400).json({ success: false, message: "Geçerli id yok" });

    const update = {
      status,
      reviewedAt: new Date(),
    };
    if (rejectReason != null) update.rejectReason = String(rejectReason);
    if (req.user?._id) update.reviewedBy = req.user._id;

    const Verification = mongoose.models.VerificationRequest || null;
    const Apply =
      mongoose.models.ApplyRequest ||
      mongoose.models.Application ||
      mongoose.models.Apply ||
      mongoose.models.Request ||
      mongoose.models.BusinessRequest ||
      null;

    const r1 = Verification
      ? await Verification.updateMany({ _id: { $in: validIds } }, { $set: update })
      : { matchedCount: 0, modifiedCount: 0 };
    const r2 = Apply
      ? await Apply.updateMany({ _id: { $in: validIds } }, { $set: update })
      : { matchedCount: 0, modifiedCount: 0 };

    res.json({
      success: true,
      matched: (r1.matchedCount ?? r1.n ?? 0) + (r2.matchedCount ?? r2.n ?? 0),
      modified: (r1.modifiedCount ?? r1.nModified ?? 0) + (r2.modifiedCount ?? r2.nModified ?? 0),
    });
  } catch (err) {
    console.error("[admin/requests/bulk-status] error:", err);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

export default router;