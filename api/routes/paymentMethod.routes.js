const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const requireRole = require("../middleware/requireRole");
const {
  listEnabled,
  listForAdmin,
  updateMethod,
} = require("../services/paymentMethod.service");
const { logAudit } = require("../services/audit.service");

const router = express.Router();

// GET /payment-methods — enabled methods for the POS charge modal.
router.get("/", authenticate, requireUser, async (req, res) => {
  const methods = await listEnabled();
  res.json(methods);
});

// GET /payment-methods/admin — full config state for the admin Config screen.
router.get(
  "/admin",
  authenticate,
  requireUser,
  requireRole("admin"),
  async (req, res) => {
    const methods = await listForAdmin();
    res.json(methods);
  }
);

// PUT /payment-methods/:key — enable/disable a method and/or update its keys.
router.put(
  "/:key",
  authenticate,
  requireUser,
  requireRole("admin"),
  async (req, res) => {
    const { enabled, config } = req.body || {};

    if (enabled !== undefined && typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be a boolean" });
    }

    if (config !== undefined && (typeof config !== "object" || config === null || Array.isArray(config))) {
      return res.status(400).json({ error: "config must be an object" });
    }

    try {
      const method = await updateMethod(
        req.params.key.toUpperCase(),
        { enabled, config },
        req.user.id
      );

      // Never record the secret values themselves, only which fields changed.
      await logAudit(null, {
        actorUserId: req.user.id,
        actorUsername: req.user.username,
        action: "payment_method.update",
        entityType: "payment_method",
        entityId: method.method_key,
        details: {
          ...(enabled !== undefined && { enabled }),
          ...(config && { config_fields_changed: Object.keys(config) }),
        },
      });

      res.json(method);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({
        error: status < 500 ? err.message : "Failed to update payment method",
      });
    }
  }
);

module.exports = router;
