const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const requireRole = require("../middleware/requireRole");
const { requestHasAnyRole } = require("../services/auth.helpers");
const { getTransactions, getTransactionById } = require("../services/transaction.service");
const { getReceipt } = require("../services/receipt.service");
const { getCorrectionsForTransaction } = require("../services/correction.service");

const router = express.Router();

function parseFilters(query) {
  return {
    from: query.from || null,
    to: query.to || null,
    user_id: query.user_id ? Number(query.user_id) : null,
    happy_hour:
      query.happy_hour === "true"
        ? true
        : query.happy_hour === "false"
          ? false
          : null,
  };
}

// GET /transactions/mine
router.get("/mine", authenticate, requireUser, async (req, res) => {
  const transactions = await getTransactions({
    ...parseFilters(req.query),
    user_id: req.user.id,
  });
  res.json(transactions);
});

// GET /transactions
router.get("/", authenticate, requireUser, requireRole(["admin", "manager"]), async (req, res) => {
  const transactions = await getTransactions(parseFilters(req.query));
  res.json(transactions);
});

// GET /transactions/:id/receipt
router.get("/:id/receipt", authenticate, requireUser, async (req, res) => {
  try {
    const receipt = await getReceipt(req.params.id, {
      userId: req.user.id,
      isAdmin: requestHasAnyRole(req, ["admin", "manager"]),
    });

    if (!receipt) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json(receipt);
  } catch (err) {
    if (err.status === 403) {
      return res.status(403).json({ error: "Forbidden" });
    }
    throw err;
  }
});

// GET /transactions/:id
router.get("/:id", authenticate, requireUser, async (req, res) => {
  const transaction = await getTransactionById(req.params.id);

  if (!transaction) {
    return res.status(404).json({ error: "Transaction not found" });
  }

  const canViewAny = requestHasAnyRole(req, ["admin", "manager"]);
  if (!canViewAny && transaction.user_id !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const corrections = await getCorrectionsForTransaction(transaction.id);
  const totalCorrections = corrections.reduce((sum, c) => sum + Number(c.amount), 0);

  res.json({
    ...transaction,
    corrections,
    net_total: Number((transaction.total_amount - totalCorrections).toFixed(2)),
  });
});

module.exports = router;
