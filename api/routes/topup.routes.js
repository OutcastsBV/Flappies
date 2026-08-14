const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const requireRole = require("../middleware/requireRole");
const { getConfig } = require("../services/config.service");
const {
  getAvailableMethods,
  createEpcTopUp,
  createStripeTopUp,
  completeTopUpRequest,
  listPendingTopUps,
} = require("../services/topup.service");

const router = express.Router();

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.round(amount * 100) / 100;
}

router.get("/methods", authenticate, requireUser, async (req, res) => {
  const config = await getConfig();
  const methods = getAvailableMethods(config);

  res.json({
    methods,
    top_up_enabled: methods.length > 0,
  });
});

router.post("/epc", authenticate, requireUser, async (req, res) => {
  const config = await getConfig();
  const methods = getAvailableMethods(config);

  if (!methods.includes("epc_qr")) {
    return res.status(503).json({ error: "EPC QR top-up is not available." });
  }

  const amount = parseAmount(req.body.amount);
  if (amount == null) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  try {
    const result = await createEpcTopUp(req.user.id, amount);
    res.json(result);
  } catch (err) {
    console.error("EPC top-up failed:", err);
    res.status(500).json({ error: "Could not create EPC QR payment" });
  }
});

router.post("/stripe/session", authenticate, requireUser, async (req, res) => {
  const config = await getConfig();
  const methods = getAvailableMethods(config);

  if (!methods.includes("stripe")) {
    return res.status(503).json({ error: "Card top-up is not available." });
  }

  const amount = parseAmount(req.body.amount);
  if (amount == null) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  try {
    const result = await createStripeTopUp(req.user.id, amount);
    res.json(result);
  } catch (err) {
    console.error("Stripe top-up failed:", err);
    res.status(500).json({ error: "Could not start card payment" });
  }
});

router.get(
  "/pending",
  authenticate,
  requireRole("admin"),
  requireUser,
  async (req, res) => {
    const pending = await listPendingTopUps();
    res.json(pending);
  }
);

router.post(
  "/:id/complete",
  authenticate,
  requireRole("admin"),
  requireUser,
  async (req, res) => {
    try {
      await completeTopUpRequest(Number(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: err.message || "Could not complete top-up" });
    }
  }
);

module.exports = router;
