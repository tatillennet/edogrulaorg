// src/pages/BlacklistProfile.jsx (Ultra Pro)
import React from "react";
import { Link, useParams } from "react-router-dom";
import apiDefault, { api as apiNamed } from "@/api/axios-boot";

const api = apiNamed || apiDefault;

/* ========== Helpers ========== */

const fmtDate = (d) => {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "-";
    return dt.toLocaleString();
  } catch {
    return "-";
  }
};

const fmtDateShort = (d) => {
  if (!d) return "-";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "-";
    return dt.toLocaleDateString();
  } catch {
    return "-";
  }
};

const isObjectId = (s) => /^[0-9a-fA-F]{24}$/.test(String(s || ""));

/**
 * "Ali Yılmaz" -> "A*** Y****"
 * "a" -> "A*"
 * Boşsa "Anonim"
 */
function maskName(raw) {
  const s = String(raw || "").trim();
  if (!s) return "Anonim";
  const parts = s.split(/\s+/);
  return parts
    .map((p, idx) => {
      const first = p[0] || "";
      if (!first) return "";
      const restLen = Math.max(p.length - 1, 1);
      const stars = "*".repeat(restLen);
      return (idx === 0 ? first.toUpperCase() : first.toLowerCase()) + stars;
    })
    .join(" ");
}

/**
 * Kanıt girişlerini normalize eder:
 * - string -> { url/text }
 * - object -> mevcut alanları toparlar
 */
function normalizeProofs(item) {
  const fromEvidence =
    Array.isArray(item?.evidenceFiles) && item.evidenceFiles.length
      ? item.evidenceFiles
      : [];
  const fromFingerprints =
    Array.isArray(item?.fingerprints) && item.fingerprints.length
      ? item.fingerprints
      : [];

  const raw = []
    .concat(fromEvidence)
    .concat(fromFingerprints)
    .filter(Boolean);

  const proofs = raw
    .map((p) => {
      if (typeof p === "string") {
        const isUrl = /^https?:\/\//i.test(p);
        return {
          url: isUrl ? p : "",
          text: isUrl ? "" : p,
          note: "",
          mimetype: "",
        };
      }
      if (typeof p === "object") {
        return {
          url: p.url || p.href || p.path || "",
          text: p.text || p.note || p.value || "",
          note: p.note || "",
          mimetype: p.mimetype || p.type || "",
          tag: p.tag || p.label || p.category || "",
          source: p.source || "",
        };
      }
      return null;
    })
    .filter((x) => x && (x.url || x.text));

  const imageProofs = proofs.filter((p) => {
    const url = p.url || "";
    const mt = (p.mimetype || "").toLowerCase();
    return (
      mt.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|bmp)$/i.test(url)
    );
  });

  const textProofs = proofs.filter((p) => !imageProofs.includes(p));

  const tags = Array.from(
    new Set(
      proofs
        .map((p) => p.tag || "")
        .filter(Boolean)
        .map((t) => String(t).toLowerCase())
    )
  );

  return { proofs, imageProofs, textProofs, tags };
}

/**
 * Destek girişlerini normalize eder:
 * Backend şu şekillerden birini verebilir:
 * - supportEntries: [{ name, comment, createdAt }, ...]
 * - supports: [{ name, comment, createdAt }, ...]
 * - supporters: [ "hash" ]  (bu durumda sadece sayaç)
 */
function normalizeSupports(item) {
  const detailed =
    item?.supportEntries ||
    item?.supports ||
    item?.supportersDetailed;

  const arr = Array.isArray(detailed) ? detailed : [];

  const supports = arr
    .map((s, i) => {
      if (!s) return null;
      if (typeof s === "string") {
        // sadece hash/id ise, anonim + tarih yok
        return {
          id: `${i}-${s}`,
          name: "Anonim",
          maskedName: "Anonim",
          comment: "",
          createdAt: null,
        };
      }
      const name = s.name || s.fullName || s.displayName || "";
      const comment = s.comment || s.note || s.text || "";
      const createdAt =
        s.createdAt ||
        s.supportedAt ||
        s.date ||
        null;
      return {
        id: s._id || `${i}-${name}-${createdAt || ""}`,
        name: name || "Anonim",
        maskedName: maskName(name),
        comment,
        createdAt,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta; // yeni üstte
    });

  const supportCount =
    item?.supportCount != null
      ? item.supportCount
      : Math.max(
          supports.length,
          Array.isArray(item?.supporters)
            ? item.supporters.length
            : 0
        );

  return { supports, supportCount };
}

/**
 * İlk rapor eden kişinin adını normalize:
 * - item.firstReporterName
 * - item.reporterName
 * - item.reports[0].reporterName
 */
function getFirstReporter(item) {
  const direct =
    item?.firstReporterName ||
    item?.reporterName;
  if (direct) {
    return {
      raw: direct,
      masked: maskName(direct),
    };
  }
  const reports = Array.isArray(item?.reports)
    ? item.reports
    : [];
  if (reports.length) {
    const rName =
      reports[0].reporterName ||
      reports[0].name ||
      "";
    if (rName) {
      return {
        raw: rName,
        masked: maskName(rName),
      };
    }
  }
  return null;
}

/* ========== Component ========== */

export default function BlacklistProfile() {
  const { id } = useParams();
  const [state, setState] = React.useState({
    loading: true,
    error: "",
    item: null,
    supports: [],
    supportCount: 0,
  });

  const [supportForm, setSupportForm] =
    React.useState({
      name: "",
      comment: "",
    });
  const [supportSending, setSupportSending] =
    React.useState(false);
  const [supportError, setSupportError] =
    React.useState("");

  React.useEffect(() => {
    let alive = true;

    (async () => {
      if (!id || !isObjectId(id)) {
        if (alive) {
          setState({
            loading: false,
            error: "Geçersiz bağlantı.",
            item: null,
            supports: [],
            supportCount: 0,
          });
        }
        return;
      }

      try {
        const res = await api.get(
          `/blacklist/${id}`,
          { _quiet: true }
        );
        if (!alive) return;

        const data = res?.data || {};

        // Muhtemel cevap formatlarını toparla
        const item =
          data.item ||
          data.blacklist ||
          (data.success === false
            ? null
            : data._id
            ? data
            : null);

        if (!item) {
          setState({
            loading: false,
            error:
              data.message ||
              "Kayıt bulunamadı.",
            item: null,
            supports: [],
            supportCount: 0,
          });
          return;
        }

        const {
          supports,
          supportCount,
        } = normalizeSupports(item);

        setState({
          loading: false,
          error: "",
          item,
          supports,
          supportCount,
        });
      } catch (e) {
        if (!alive) return;
        const msg =
          e?.response?.data?.message ||
          (e?.response?.status === 404
            ? "Kayıt bulunamadı."
            : e?.message ||
              "Sunucu hatası");
        setState({
          loading: false,
          error: msg,
          item: null,
          supports: [],
          supportCount: 0,
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const {
    loading,
    error,
    item,
    supports,
    supportCount,
  } = state;

  /* ========== UI primitives ========== */

  const Shell = ({ children }) => (
    <div
      style={{
        padding: 18,
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "Inter, system-ui, Arial",
      }}
    >
      {children}
    </div>
  );

  const Header = () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
      }}
    >
      <Link
        to="/"
        className="btn btn-light"
      >
        ‹ Geri
      </Link>
      <h2
        style={{
          margin: 0,
          fontWeight: 800,
        }}
      >
        Kara Liste Profili
      </h2>
    </div>
  );

  const Card = ({ children, style }) => (
    <div
      style={{
        background: "#fff",
        border:
          "1px solid #f0f2f5",
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        ...style,
      }}
    >
      {children}
    </div>
  );

  const Alert = ({ children }) => (
    <div
      style={{
        background: "#fee2e2",
        border:
          "1px solid #fecaca",
        color: "#7f1d1d",
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );

  const SectionTitle = ({
    children,
  }) => (
    <div
      style={{
        fontWeight: 800,
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );

  const Badge = ({ children, danger }) => (
    <span
      style={{
        display: "inline-block",
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        background: danger
          ? "#fee2e2"
          : "#eef2ff",
        color: danger
          ? "#9f1239"
          : "#3730a3",
        border: danger
          ? "1px solid #fecaca"
          : "1px solid #e0e7ff",
        letterSpacing: 0.3,
        textTransform:
          "uppercase",
      }}
    >
      {children}
    </span>
  );

  /* ========== Loading / Error ========== */

  if (loading) {
    return (
      <Shell>
        <Header />
        <Card
          style={{
            textAlign: "center",
            padding: 24,
            color: "#64748b",
          }}
        >
          Profil yükleniyor…
        </Card>
        <style>{css}</style>
      </Shell>
    );
  }

  if (error || !item) {
    return (
      <Shell>
        <Header />
        <div
          style={{
            maxWidth: 780,
          }}
        >
          <Alert>
            {error ||
              "Kayıt bulunamadı (404)."}
          </Alert>
          <div
            style={{
              display: "flex",
              gap: 8,
            }}
          >
            <button
              className="btn"
              onClick={() =>
                window.location.reload()
              }
            >
              ↻ Yeniden Dene
            </button>
            <Link
              to="/"
              className="btn btn-light"
            >
              ‹ Geri
            </Link>
          </div>
        </div>
        <style>{css}</style>
      </Shell>
    );
  }

  /* ========== Derived fields ========== */

  const name =
    item.name || "—";
  const website =
    item.website || "";
  const igUrl =
    item.instagramUrl ||
    (item.instagramUsername
      ? `https://instagram.com/${String(
          item.instagramUsername
        ).replace(/^@/, "")}`
      : "");
  const phone =
    item.phone || "";
  const address =
    item.address || "";
  const desc =
    item.desc ||
    item.description ||
    "";

  const created =
    fmtDateShort(item.createdAt);
  const updated =
    fmtDateShort(
      item.updatedAt ||
        item.createdAt
    );

  // Kara liste durumu
  const status =
    item.status ||
    "blacklisted";
  const statusLabel =
    status === "suspected"
      ? "OLASI DOLANDIRICI"
      : status === "confirmed"
      ? "DOĞRULANMIŞ DOLANDIRICI"
      : "KARA LİSTEDE";

  // İlk rapor eden (maskeli)
  const firstReporter =
    getFirstReporter(item);

  // Kanıtlar
  const {
    proofs,
    imageProofs,
    textProofs,
    tags,
  } = normalizeProofs(item);

  // Şikayet/Tarih bilgisi:
  // Eğer item.reports varsa, en eski ve en yeni
  const reportsArr = Array.isArray(
    item.reports
  )
    ? item.reports
    : [];
  const firstReportDate = reportsArr.length
    ? fmtDateShort(
        reportsArr
          .map(
            (r) =>
              r.createdAt ||
              r.date
          )
          .filter(Boolean)
          .sort(
            (a, b) =>
              new Date(a) -
              new Date(b)
          )[0]
      )
    : created;

  const lastReportDate = reportsArr.length
    ? fmtDateShort(
        reportsArr
          .map(
            (r) =>
              r.createdAt ||
              r.date
          )
          .filter(Boolean)
          .sort(
            (a, b) =>
              new Date(b) -
              new Date(a)
          )[0]
      )
    : updated;

  /* ========== Support Submit ========== */

  const handleSupportSubmit =
    async (e) => {
      e.preventDefault();
      setSupportError("");

      const name =
        supportForm.name
          .trim() || "Anonim";
      const comment =
        supportForm.comment.trim();

      if (!comment) {
        setSupportError(
          "Lütfen kısaca deneyiminizi veya desteğinizi yazın."
        );
        return;
      }

      if (!id || !isObjectId(id)) {
        setSupportError(
          "Geçersiz kayıt."
        );
        return;
      }

      setSupportSending(true);
      try {
        // Backend tarafında şu endpoint'i implemente edebilirsin:
        // POST /blacklist/:id/support { name, comment }
        // Cevapta updated support list veya tek kayıt dönmesi ideal.
        const res =
          await api.post(
            `/blacklist/${id}/support`,
            { name, comment },
            { _quiet: false }
          );

        const data =
          res?.data || {};
        const newEntry =
          data.support ||
          data.item ||
          null;

        // Eğer backend yeni liste dönerse:
        const {
          supports: normSupports,
          supportCount: cnt,
        } =
          normalizeSupports(
            data.blacklist ||
              data.item ||
              item
          );

        if (normSupports.length) {
          setState((prev) => ({
            ...prev,
            supports:
              normSupports,
            supportCount:
              cnt,
          }));
        } else if (newEntry) {
          // Tekil entry durumunda local ekle
          const mapped =
            normalizeSupports({
              supports: [
                ...supports,
                newEntry,
              ],
            });
          setState((prev) => ({
            ...prev,
            supports:
              mapped.supports,
            supportCount:
              mapped.supportCount,
          }));
        } else {
          // Backend sade 200 dönerse: optimistic
          const optimistic = {
            id:
              "local-" +
              Date.now(),
            name,
            maskedName:
              maskName(name),
            comment,
            createdAt:
              new Date().toISOString(),
          };
          setState((prev) => ({
            ...prev,
            supports: [
              optimistic,
              ...prev.supports,
            ],
            supportCount:
              prev.supportCount +
              1,
          }));
        }

        setSupportForm({
          name: "",
          comment: "",
        });
      } catch (err) {
        setSupportError(
          err?.response?.data
            ?.message ||
            "Desteğiniz kaydedilemedi. Daha sonra tekrar deneyebilirsiniz."
        );
      } finally {
        setSupportSending(false);
      }
    };

  /* ========== Render ========== */

  return (
    <Shell>
      <Header />

      {/* Üst blok */}
      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
            gap: 12,
          }}
        >
          <div>
            <h1
              style={{
                margin:
                  "0 0 6px",
                fontSize: 26,
                letterSpacing: 0.2,
              }}
            >
              {name}
            </h1>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems:
                  "center",
              }}
            >
              <Badge danger>
                {statusLabel}
              </Badge>
              {firstReporter && (
                <span
                  style={{
                    fontSize: 12,
                    color:
                      "#6b7280",
                  }}
                >
                  İlk rapor eden:{" "}
                  <b>
                    {
                      firstReporter.masked
                    }
                  </b>
                </span>
              )}
              {supportCount > 0 && (
                <span
                  style={{
                    fontSize: 12,
                    color:
                      "#6b7280",
                  }}
                >
                  • {supportCount} kişi bu
                  kaydı destekledi
                </span>
              )}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                color: "#9ca3af",
              }}
            >
              İlk şikayet:{" "}
              {firstReportDate} •
              Güncel durum:{" "}
              {lastReportDate}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
            }}
          >
            {igUrl && (
              <a
                className="iconBtn"
                href={igUrl}
                target="_blank"
                rel="noreferrer"
                title="Instagram"
              >
                ↗
              </a>
            )}
            {website && (
              <a
                className="iconBtn"
                href={website}
                target="_blank"
                rel="noreferrer"
                title="Web"
              >
                🌐
              </a>
            )}
          </div>
        </div>
      </Card>

      {/* Temel Bilgiler */}
      <Card>
        <SectionTitle>
          Temel Bilgiler
        </SectionTitle>
        <dl className="dl">
          <dt>Web site</dt>
          <dd>
            {website ? (
              <a
                className="ext"
                href={website}
                target="_blank"
                rel="noreferrer"
              >
                {website.replace(
                  /^https?:\/\/(www\.)?/,
                  ""
                )}
              </a>
            ) : (
              "—"
            )}
          </dd>

          <dt>Instagram</dt>
          <dd>
            {igUrl ? (
              <a
                className="ext"
                href={igUrl}
                target="_blank"
                rel="noreferrer"
              >
                {igUrl.replace(
                  /^https?:\/\/(www\.)?/,
                  ""
                )}
              </a>
            ) : (
              "—"
            )}
          </dd>

          <dt>Telefon</dt>
          <dd>{phone || "—"}</dd>

          <dt>Adres</dt>
          <dd>{address || "—"}</dd>
        </dl>
      </Card>

      {/* Kanıtlar */}
      <Card>
        <SectionTitle>
          Kanıtlar
        </SectionTitle>
        <div
          style={{
            color: "#111827",
            marginBottom: 8,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {imageProofs.length
            ? `${imageProofs.length} görsel kanıt`
            : "Görsel kanıt yok"}{" "}
          • Toplam{" "}
          {proofs.length} kayıt
        </div>

        {/* Etiketler */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          {tags.length ? (
            tags.map(
              (t, i) => (
                <span
                  key={i}
                  className="chip"
                >
                  {t}
                </span>
              )
            )
          ) : (
            <span className="muted">
              Etiketlenmiş kanıt yok
            </span>
          )}
        </div>

        {/* Görseller */}
        {imageProofs.length ? (
          <div className="grid">
            {imageProofs.map(
              (g, i) => {
                const src =
                  g.url ||
                  "";
                if (!src)
                  return null;
                return (
                  <a
                    key={i}
                    className="thumb"
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      src={
                        src
                      }
                      alt={
                        g.note ||
                        g.text ||
                        `kanit-${i +
                          1}`
                      }
                      loading="lazy"
                      onError={(
                        e
                      ) => {
                        e.currentTarget.style.display =
                          "none";
                      }}
                    />
                  </a>
                );
              }
            )}
          </div>
        ) : (
          <div className="muted">
            Görsel kanıt yüklenmemiş.
          </div>
        )}

        {/* Metin / diğer kanıtlar */}
        {textProofs.length ? (
          <div
            style={{
              marginTop: 12,
              display:
                "grid",
              gap: 8,
            }}
          >
            {textProofs.map(
              (o, i) => (
                <div
                  key={i}
                  className="textProof"
                >
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                  >
                    {o.title ||
                      o.tag ||
                      "Not"}
                  </div>
                  <div
                    style={{
                      color:
                        "#111827",
                      fontSize: 13,
                    }}
                  >
                    {o.text ||
                      o.note ||
                      o.url ||
                      "—"}
                  </div>
                  {o.source && (
                    <div
                      className="muted"
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                      }}
                    >
                      Kaynak:{" "}
                      {o.source}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        ) : null}
      </Card>

      {/* Raporlar & Hikaye */}
      <Card>
        <SectionTitle>
          Şikayet Özeti
        </SectionTitle>
        <ul className="timeline">
          <li>
            <time>
              {firstReportDate}
            </time>
            <p>
              İlk ihbar
              sisteme
              işlendi.
            </p>
          </li>
          <li>
            <time>{updated}</time>
            <p>
              Güncel
              durum /
              not:{" "}
              {desc ||
                "Bu kayıt, kullanıcı ihbarları ve delillere dayanır."}
            </p>
          </li>
        </ul>
      </Card>

      {/* Destekler */}
      <Card>
        <SectionTitle>
          Destekler
        </SectionTitle>

        {supportCount === 0 &&
        supports.length === 0 ? (
          <div className="muted">
            Henüz destek veren olmamış.
            İlk deneyimi paylaşan sen
            olabilirsin.
          </div>
        ) : (
          <div
            style={{
              marginBottom: 8,
              fontSize: 13,
              color: "#4b5563",
            }}
          >
            Toplam{" "}
            <b>
              {supportCount ||
                supports.length}
            </b>{" "}
            destek kaydı.
          </div>
        )}

        {supports.length > 0 && (
          <div className="support-list">
            {supports.map(
              (s) => (
                <div
                  key={s.id}
                  className="support-item"
                >
                  <div className="support-header">
                    <span className="support-name">
                      {s.maskedName ||
                        maskName(
                          s.name
                        )}
                    </span>
                    <span className="support-date">
                      {fmtDateShort(
                        s.createdAt
                      ) ||
                        ""}
                    </span>
                  </div>
                  {s.comment && (
                    <div className="support-comment">
                      {s.comment}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}

        {/* Yeni Destek Formu */}
        <form
          onSubmit={
            handleSupportSubmit
          }
          className="support-form"
        >
          <div
            style={{
              fontSize: 12,
              color:
                "#6b7280",
              marginBottom: 4,
            }}
          >
            Deneyimini paylaşarak
            diğer kullanıcıları
            bilgilendirebilirsin.
            Adın kamuya{" "}
            <b>
              maskeleme ile
            </b>{" "}
            gösterilir
            (örn:{" "}
            <code>
              A*** Y****
            </code>
            ).
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr",
              gap: 6,
              marginBottom: 6,
            }}
          >
            <input
              type="text"
              placeholder="Ad Soyad (isteğe bağlı)"
              value={
                supportForm.name
              }
              onChange={(e) =>
                setSupportForm(
                  (f) => ({
                    ...f,
                    name:
                      e
                        .target
                        .value,
                  })
                )
              }
            />
            <textarea
              rows={3}
              placeholder="Kısa yorumunuzu / desteğinizi yazın. Örn: 'Aynı işletme beni de benzer şekilde mağdur etti.'"
              value={
                supportForm.comment
              }
              onChange={(e) =>
                setSupportForm(
                  (f) => ({
                    ...f,
                    comment:
                      e
                        .target
                        .value,
                  })
                )
              }
            />
          </div>
          {supportError && (
            <div
              className="muted"
              style={{
                color:
                  "#b91c1c",
                marginBottom: 4,
              }}
            >
              {supportError}
            </div>
          )}
          <button
            type="submit"
            className="btn"
            disabled={
              supportSending
            }
          >
            {supportSending
              ? "Gönderiliyor…"
              : "Desteğimi Paylaş"}
          </button>
        </form>
      </Card>

      {/* Uyarı */}
      <Card>
        <SectionTitle>
          Hukuki Not
        </SectionTitle>
        <p
          style={{
            lineHeight: 1.6,
            color:
              "#111827",
            fontSize: 13,
          }}
        >
          Bu sayfa, topluluk
          ihbarları ve
          kanıtlara dayalı
          bilgilendirme
          amacı taşır.
          İçerik resmî bir
          yargı kararı
          değildir. Mağdur
          olduğunuzu
          düşünüyorsanız
          ilgili kolluk
          kuvvetlerine ve
          resmî mercilere
          başvurun.
        </p>
      </Card>

      <div
        style={{
          marginTop: 10,
        }}
      >
        <Link
          to="/"
          className="btn btn-light"
        >
          ‹ Ana sayfaya dön
        </Link>
      </div>

      <style>{css}</style>
    </Shell>
  );
}

/* ========== Styles ========== */

const css = `
.btn{
  padding:8px 12px;
  border-radius:10px;
  border:1px solid #e5e7eb;
  background:#fff;
  cursor:pointer;
  font-weight:600;
  text-decoration:none;
  color:#111827;
  font-size:12px;
}
.btn-light{ background:#f8fafc; }
.btn:hover{ background:#f8fafc; }
.ext{
  color:#0f172a;
  text-decoration:none;
  font-weight:600;
  font-size:13px;
}
.ext:hover{ text-decoration:underline; }
.dl{
  display:grid;
  grid-template-columns:160px 1fr;
  gap:8px 16px;
  margin:0;
  font-size:13px;
}
.dl dt{
  color:#6b7280;
}
.dl dd{
  margin:0;
  color:#111827;
}
.grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(140px,1fr));
  gap:10px;
}
.thumb{
  display:block;
  border-radius:12px;
  overflow:hidden;
  border:1px solid #eef2f7;
  background:#fafafa;
}
.thumb img{
  width:100%;
  height:120px;
  object-fit:cover;
  display:block;
}
.chip{
  padding:4px 9px;
  border:1px solid #e5e7eb;
  border-radius:999px;
  background:#f8fafc;
  font-size:11px;
  font-weight:600;
  color:#475569;
}
.muted{
  color:#64748b;
  font-size:12px;
}
.textProof{
  border:1px solid #eef2f7;
  background:#fbfbfb;
  border-radius:10px;
  padding:9px;
  font-size:12px;
}
.iconBtn{
  width:34px;
  height:34px;
  border-radius:10px;
  display:inline-grid;
  place-items:center;
  border:1px solid #e5e7eb;
  text-decoration:none;
  color:#111827;
  background:#fff;
  font-size:16px;
}
.iconBtn:hover{
  background:#f1f5f9;
}
.timeline{
  list-style:none;
  padding:0;
  margin:0;
  display:grid;
  gap:10px;
}
.timeline li{
  display:grid;
  grid-template-columns:120px 1fr;
  gap:8px;
  align-items:flex-start;
  font-size:13px;
}
.timeline time{
  color:#64748b;
  font-size:12px;
}
.support-list{
  display:grid;
  gap:6px;
  margin:8px 0 10px;
}
.support-item{
  border:1px solid #e5e7eb;
  border-radius:10px;
  padding:8px 9px;
  background:#f9fafb;
}
.support-header{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:6px;
}
.support-name{
  font-weight:700;
  font-size:12px;
  color:#111827;
}
.support-date{
  font-size:11px;
  color:#9ca3af;
}
.support-comment{
  margin-top:3px;
  font-size:12px;
  color:#111827;
}
.support-form textarea{
  resize:vertical;
}
.support-form input,
.support-form textarea{
  font-size:12px;
}
`;

