const { hasRole } = require("../services/auth.helpers");

/**
 * Restrict a route to one or more roles, e.g. requireRole("admin") or
 * requireRole(["admin", "manager"]).
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!allowed.some((role) => hasRole(req.auth, role))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  };
}

module.exports = requireRole;
