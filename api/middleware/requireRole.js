const { requestHasAnyRole } = require("../services/auth.helpers");

/**
 * Restrict a route to one or more roles, e.g. requireRole("admin") or
 * requireRole(["admin", "manager"]).
 *
 * Accepts either ZITADEL JWT project roles or the app DB role on req.user
 * (so this should run after requireUser).
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!requestHasAnyRole(req, allowed)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  };
}

module.exports = requireRole;
