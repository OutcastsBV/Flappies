const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const { getCartQuote } = require("../services/checkout.service");
const {
  createWeroPayment,
  getWeroPayment,
  cancelWeroPayment,
} = require("../services/wero.service");

const router = express.Router();

function sendError(res, err) {
  const status = err.status || 400;
  return res.status(status).json({ error: err.message });
}

// POST /payments/wero — create a 120s Instore Display payment for the cart.
router.post("/", authenticate, requireUser, async (req, res) => {
  try {
    const quote = await getCartQuote(req.user.id);
    const payment = await createWeroPayment(req.user.id, quote);
    res.status(201).json(payment);
  } catch (err) {
    sendError(res, err);
  }
});

// GET /payments/wero/:paymentId — poll Payconiq status.
router.get("/:paymentId", authenticate, requireUser, async (req, res) => {
  try {
    const payment = await getWeroPayment(req.params.paymentId);
    res.json(payment);
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /payments/wero/:paymentId — cancel a still-pending QR.
router.delete("/:paymentId", authenticate, requireUser, async (req, res) => {
  try {
    await cancelWeroPayment(req.params.paymentId);
    res.status(204).end();
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
