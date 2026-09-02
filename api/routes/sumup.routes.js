const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const requireRole = require("../middleware/requireRole");
const { getCartQuote } = require("../services/checkout.service");
const {
  listSumupReaders,
  pairSumupReader,
  createSumupCheckout,
  getSumupCheckout,
  cancelSumupCheckout,
} = require("../services/sumup.service");

const router = express.Router();

function sendError(res, err) {
  const status = err.status || 400;
  return res.status(status).json({ error: err.message });
}

// GET /payments/sumup/readers — paired terminals for Config and Charge.
router.get("/readers", authenticate, requireUser, async (req, res) => {
  try {
    const readers = await listSumupReaders();
    res.json(readers);
  } catch (err) {
    sendError(res, err);
  }
});

// POST /payments/sumup/readers — pair a Solo using the code on the device.
router.post(
  "/readers",
  authenticate,
  requireUser,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { pairing_code: pairingCode, name } = req.body || {};
      const reader = await pairSumupReader(req.user.id, {
        pairingCode,
        name,
      });
      res.status(201).json(reader);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// POST /payments/sumup — send the cart total to the paired terminal.
router.post("/", authenticate, requireUser, async (req, res) => {
  try {
    const quote = await getCartQuote(req.user.id);
    const checkout = await createSumupCheckout(
      req.user.id,
      quote,
      req.body?.reader_id
    );
    res.status(201).json(checkout);
  } catch (err) {
    sendError(res, err);
  }
});

// GET /payments/sumup/:readerId/:checkoutId — poll reader checkout status.
router.get(
  "/:readerId/:checkoutId",
  authenticate,
  requireUser,
  async (req, res) => {
    try {
      const checkout = await getSumupCheckout(
        req.params.readerId,
        req.params.checkoutId
      );
      res.json(checkout);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// DELETE /payments/sumup/:readerId — cancel a still-waiting terminal payment.
router.delete("/:readerId", authenticate, requireUser, async (req, res) => {
  try {
    await cancelSumupCheckout(req.params.readerId);
    res.status(204).end();
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
