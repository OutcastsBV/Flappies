const express = require("express");
const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const requireRole = require("../middleware/requireRole");

const {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../services/product.service");

const router = express.Router();

// GET /products
router.get("/", authenticate, requireUser, async (req, res) => {
  const products = await getAllProducts();
  res.json(products);
});

// GET /products/:id
router.get("/:id", authenticate, requireUser, async (req, res) => {
  const product = await getProductById(req.params.id);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  res.json(product);
});

// POST /products
router.post("/", authenticate, requireRole('admin'), requireUser, async (req, res) => {
  const { name, description, price, cost_price } = req.body;

  if (!name || price == null) {
    return res.status(400).json({ error: "Name and price are required" });
  }

  const product = await createProduct({ name, description, price, cost_price });
  res.status(201).json(product);
});

// PUT /products/:id
router.put("/:id", authenticate, requireRole('admin'), requireUser, async (req, res) => {

  const product = await updateProduct(req.params.id, req.body);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  res.json(product);
});


// DELETE /products/:id
router.delete("/:id", authenticate, requireRole('admin'), requireUser, async (req, res) => {
  const product = await deleteProduct(req.params.id);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  res.json({ message: "Product deleted" });
});

module.exports = router;
