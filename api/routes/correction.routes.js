const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const requireRole = require("../middleware/requireRole");
const {
  TYPES,
  createCorrection,
  listCorrections,
} = require("../services/correction.service");
const { logAudit } = require("../services/audit.service");

const router = express.Router();

// POST /corrections — any staff member can log a refund/price fix/removed
// item on the spot at the register.
router.post("/", authenticate, requireUser, async (req, res) => {
  const { transaction_id: transactionId, type, amount, reason } = req.body || {};

  if (!Number.isInteger(transactionId)) {
    return res.status(400).json({ error: "transaction_id is required" });
  }
  if (!TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${TYPES.join(", ")}` });
  }
  if (typeof amount !== "number" || Number.isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    return res.status(400).json({ error: "reason is required" });
  }

  try {
    const correction = await createCorrection({
      transactionId,
      type,
      amount,
      reason: reason.trim(),
      createdBy: req.user.id,
    });

    await logAudit(null, {
      actorUserId: req.user.id,
      actorUsername: req.user.username,
      action: "correction.create",
      entityType: "correction",
      entityId: correction.id,
      details: { transaction_id: transactionId, type, amount },
    });

    res.status(201).json(correction);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: status < 500 ? err.message : "Failed to create correction" });
  }
});

// GET /corrections — admin/manager audit list.
router.get(
  "/",
  authenticate,
  requireRole(["admin", "manager"]),
  requireUser,
  async (req, res) => {
    const { from, to } = req.query;
    const corrections = await listCorrections({ from: from || null, to: to || null });
    res.json(corrections);
  }
);

module.exports = router;
