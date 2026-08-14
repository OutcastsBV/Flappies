const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const requireRole = require("../middleware/requireRole");

const {
  getInventory,
  getInventoryInStock,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  restockInventoryItem
} = require("../services/inventory.service");

const router = express.Router();

// GET /inventory
router.get("/", authenticate, requireUser, async (req, res) => {
  const products = await getInventoryInStock();
  res.json(products);
});

// GET /inventory/admin
router.get("/admin", authenticate, requireRole('admin'), requireUser, async (req, res) => {
  const products = await getInventory();
  res.json(products);
});

// GET /inventory/:id
router.get("/:id", authenticate, requireUser, async (req, res) => {
  const product = await getInventoryItem(req.params.id);

  if (!product) {
    return res.status(404).json({ error: "Inventory Item not found" });
  }

  res.json(product);
});

// POST /inventory
router.post("/", authenticate, requireRole('admin'), requireUser, async (req, res) => {
  const { product_id, current_stock, reorder_level } = req.body;

  if (!product_id || current_stock == null || reorder_level == null) {
    return res.status(400).json({ error: "Product ID, current stock and reorder level are required" });
  }

  const product = await createInventoryItem({ product_id, current_stock, reorder_level });
  res.status(201).json(product);
});

// PUT /inventory/:id
router.put("/:id", authenticate, requireRole('admin'), requireUser, async (req, res) => {
    const inventory = await updateInventoryItem(
      req.params.id,
      req.body
    );

    if (!inventory) {
      return res
        .status(404)
        .json({ error: "Inventory item not found" });
    }

    res.json(inventory);
  }
);


// PUT /inventory/stock/:id
router.put("/stock/:id", authenticate, requireRole('admin'), requireUser, async (req, res) => {
  const { stock } = req.body;
  const product = await restockInventoryItem(req.params.id, { stock });

  if (!product) {
    return res.status(404).json({ error: "Inventory Item not found" });
  }

  res.json(product);
});

// DELETE /inventory/:id
router.delete("/:id", authenticate, requireRole('admin'), requireUser, async (req, res) => {
  const product = await deleteInventoryItem(req.params.id);

  if (!product) {
    return res.status(404).json({ error: "Inventory Item not found" });
  }

  res.json({ message: "Inventory Item deleted" });
});

module.exports = router;