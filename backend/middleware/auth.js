// backend/middleware/auth.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// Production'da boş/geliştirici sırrıyla çalışmayı önle (isteğe bağlı ama faydalı)
if (process.env.NODE_ENV === "production" && JWT_SECRET === "dev_secret_change_me") {
  console.warn("[auth] WARNING: Using default JWT secret in production!");
}

/** Authorization header/cookie'den token'ı güvenli biçimde çıkarır */
function extractToken(req) {
  // 1) Header: Authorization: Bearer <token>  (case-insensitive)
  const auth = req.headers?.authorization || req.headers?.Authorization;
  if (auth && typeof auth === "string") {
    const [scheme, value] = auth.trim().split(/\s+/);
    if (scheme?.toLowerCase() === "bearer" && value) return value;
    // Bazı istemciler header'a direkt token yazabiliyor
    if (!scheme?.includes("Bearer") && auth.length > 20) return auth.trim();
  }

  // 2) Cookie: token
  if (req.cookies?.token) return req.cookies.token;

  // 3) Query (sadece debugging için — prod’da önermem)
  if (process.env.NODE_ENV !== "production" && req.query?.token) {
    return String(req.query.token);
  }

  return null;
}

export const authenticate = (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, code: "NO_TOKEN", message: "Token gerekli" });
    }

    // Saat senkron kaymalarına tolerans ver (5 sn)
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      clockTolerance: 5,
    });

    // payload beklenen format: { id, email, role }
    if (!decoded || !decoded.role) {
      return res.status(401).json({ ok: false, code: "INVALID_PAYLOAD", message: "Geçersiz token" });
    }

    req.user = decoded;
    req.token = token;
    next();
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
      return res.status(401).json({ ok: false, code: "TOKEN_EXPIRED", message: "Oturum süresi doldu" });
    }
    if (error?.name === "JsonWebTokenError") {
      return res.status(401).json({ ok: false, code: "JWT_ERROR", message: "Geçersiz token" });
    }
    return res.status(401).json({ ok: false, code: "AUTH_ERROR", message: "Kimlik doğrulama başarısız" });
  }
};

export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ ok: false, code: "UNAUTHENTICATED", message: "Kimlik doğrulanmadı" });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({ ok: false, code: "FORBIDDEN", message: "Admin yetkisi gerekli" });
  }
  next();
};
