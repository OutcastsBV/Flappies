const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const { checkout } = require("../services/checkout.service");

const {
  getUserCart,
  createCart,
  addItem,
  deleteCartItem,
  deleteCart,
} = require("../services/cart.service");

const router = express.Router();

// GET /cart
router.get("/", authenticate, requireUser, async (req, res) => {
  const products = await getUserCart(req.user.id);
  res.json(products);
});

// POST /cart
router.post("/", authenticate, requireUser, async (req, res) => {
  const { item_id, amount = 1 } = req.body;
  const cartItem = await createCart({
    user_id: req.user.id,
    item_id,
    amount,
  });
  res.status(201).json(cartItem);
});

// POST /cart/checkout — atomic order + transaction
router.post("/checkout", authenticate, requireUser, async (req, res) => {
  try {
    const { payment_method = "WALLET" } = req.body;
    const result = await checkout(req.user.id, payment_method);

    res.json({
      message: "Order placed successfully",
      ...result,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /cart/order — kept for backwards compatibility, delegates to checkout
router.post("/order", authenticate, requireUser, async (req, res) => {
  try {
    const result = await checkout(req.user.id, "WALLET");

    res.json({
      message: "Order placed successfully",
      total: result.total,
      transaction_id: result.transaction_id,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /cart/:item_id
router.put("/:item_id", authenticate, requireUser, async (req, res) => {
  const { amount } = req.body;
  const cartItem = await addItem(req.user.id, req.params.item_id, { amount });
  if (!cartItem) {
    return res.status(404).json({ error: "Cart item not found" });
  }
  res.json(cartItem);
});

// DELETE /cart/:item_id
router.delete("/:item_id", authenticate, requireUser, async (req, res) => {
  const cartItem = await deleteCartItem(req.user.id, req.params.item_id);
  if (!cartItem) {
    return res.status(404).json({ error: "Cart item not found" });
  }
  res.json({ message: "Cart item deleted" });
});

// DELETE /cart
router.delete("/", authenticate, requireUser, async (req, res) => {
  await deleteCart(req.user.id);
  res.json({ message: "Cart cleared" });
});

module.exports = router;
