const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const requireRole = require("../middleware/requireRole");
const { hasRole } = require("../services/auth.helpers");
const { getTransactions, getTransactionById } = require("../services/transaction.service");
const { getReceipt } = require("../services/receipt.service");

const router = express.Router();

function parseFilters(query) {
  return {
    from: query.from || null,
    to: query.to || null,
    user_id: query.user_id ? Number(query.user_id) : null,
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
router.get("/", authenticate, requireRole("admin"), requireUser, async (req, res) => {
  const transactions = await getTransactions(parseFilters(req.query));
  res.json(transactions);
});

// GET /transactions/:id/receipt
router.get("/:id/receipt", authenticate, requireUser, async (req, res) => {
  try {
    const receipt = await getReceipt(req.params.id, {
      userId: req.user.id,
      isAdmin: hasRole(req.auth, "admin"),
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

  const isAdmin = hasRole(req.auth, "admin");
  if (!isAdmin && transaction.user_id !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json(transaction);
});

module.exports = router;
