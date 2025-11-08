// backend/middlewares/requireAdminEmail.js
export function requireAdminEmail(allowed = "admin@edogrula.org") {
  return function (req, res, next) {
    // Burada req.user, auth middleware (JWT verify) sonrasında dolu olmalı.
    // Örn. requireAuth → req.user = { id, email, role, isAdmin, ... }
    const email = (req.user?.email || "").toLowerCase();
    if (email === allowed.toLowerCase()) return next();
    return res.status(403).json({ message: "Admin only" });
  };
}
