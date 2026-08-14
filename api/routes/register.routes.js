const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const requireRole = require("../middleware/requireRole");
const {
  openRegister,
  getCurrentForUser,
  closeRegister,
  listSessions,
} = require("../services/register.service");
const { logAudit } = require("../services/audit.service");

const router = express.Router();

// GET /register/current — the caller's own open session (if any) + live totals.
router.get("/current", authenticate, requireUser, async (req, res) => {
  const current = await getCurrentForUser(req.user.id);
  res.json(current);
});

// POST /register/open — open a new register session with a starting float.
router.post("/open", authenticate, requireUser, async (req, res) => {
  const { starting_amount: startingAmount } = req.body || {};

  if (typeof startingAmount !== "number" || Number.isNaN(startingAmount) || startingAmount < 0) {
    return res.status(400).json({ error: "starting_amount must be a non-negative number" });
  }

  try {
    const session = await openRegister(req.user.id, startingAmount);

    await logAudit(null, {
      actorUserId: req.user.id,
      actorUsername: req.user.username,
      action: "register.open",
      entityType: "register_session",
      entityId: session.id,
      details: { starting_amount: startingAmount },
    });

    res.status(201).json(session);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: status < 500 ? err.message : "Failed to open register" });
  }
});

// POST /register/close — close the caller's own open session.
router.post("/close", authenticate, requireUser, async (req, res) => {
  const { counted_cash_amount: countedCashAmount, notes } = req.body || {};

  if (typeof countedCashAmount !== "number" || Number.isNaN(countedCashAmount) || countedCashAmount < 0) {
    return res.status(400).json({ error: "counted_cash_amount must be a non-negative number" });
  }

  try {
    const result = await closeRegister(req.user.id, { countedCashAmount, notes });

    await logAudit(null, {
      actorUserId: req.user.id,
      actorUsername: req.user.username,
      action: "register.close",
      entityType: "register_session",
      entityId: result.session.id,
      details: {
        counted_cash_amount: countedCashAmount,
        expected_cash: result.summary.expected_cash,
        variance: result.summary.variance,
      },
    });

    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: status < 500 ? err.message : "Failed to close register" });
  }
});

// GET /register/sessions — admin/manager oversight across all cashiers.
router.get(
  "/sessions",
  authenticate,
  requireRole(["admin", "manager"]),
  requireUser,
  async (req, res) => {
    const { from, to, user_id: userId } = req.query;
    const sessions = await listSessions({
      from: from || null,
      to: to || null,
      userId: userId ? Number(userId) : null,
    });
    res.json(sessions);
  }
);

module.exports = router;
