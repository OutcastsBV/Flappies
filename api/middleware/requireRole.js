const { hasRole } = require("../services/auth.helpers");

function requireRole(role) {
  return (req, res, next) => {
    if (!hasRole(req.auth, role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  };
}

module.exports = requireRole;
