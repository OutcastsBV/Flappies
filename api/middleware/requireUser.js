const { findUserByOidcSub } = require("../services/user.service");
const logger = require("../lib/logger");

async function requireUser(req, res, next) {
  if (!req.auth?.sub) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  try {
    const user = await findUserByOidcSub(req.auth.sub);

    if (!user) {
      return res.status(403).json({
        error: "User not allowed in this application",
      });
    }

    req.user = user;
    next();
  } catch (err) {
    logger.error({ err: err.message }, "requireUser failed");
    res.status(500).json({ error: "Failed to resolve user" });
  }
}

module.exports = requireUser;
