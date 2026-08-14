const pool = require("../db");
const { getConfig, applyHappyHourPrice } = require("./config.service");

async function withHappyHourPrices(products) {
  const config = await getConfig();

  return products.map((product) => ({
    ...product,
    price: applyHappyHourPrice(Number(product.price), config),
  }));
}

// Get all inventory products
async function getInventory() {
  const result = await pool.query(
    `SELECT i.product_id, i.current_stock, i.reorder_level, p.name, p.description, p.price, p.cost_price FROM inventory i JOIN product p ON p.id = i.product_id ORDER BY i.product_id`
  );
  return result.rows;
}

// Get all in stock inventory products
async function getInventoryInStock() {
  const result = await pool.query(
    `SELECT i.product_id, i.current_stock, p.name, p.price FROM inventory i JOIN product p ON p.id = i.product_id WHERE i.current_stock > 0 ORDER BY i.product_id`
  );
  return withHappyHourPrices(result.rows);
}

// Get single inventory product
async function getInventoryItem(id) {
  const result = await pool.query(
    `SELECT * FROM inventory WHERE product_id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

// Create inventory product
async function createInventoryItem({ product_id, current_stock, reorder_level }) {
  const result = await pool.query(
    `
    INSERT INTO inventory (product_id, current_stock, reorder_level, last_restock)
    VALUES ($1, $2, $3, NOW())
    RETURNING *
    `,
    [product_id, current_stock, reorder_level]
  );
  return result.rows[0];
}

// Update inventory product
async function updateInventoryItem(productId, data) {
  const fields = [];
  const values = [];
  let i = 1;

  if (data.current_stock !== undefined) {
    fields.push(`current_stock = $${i++}`);
    values.push(data.current_stock);
  }

  if (data.reorder_level !== undefined) {
    fields.push(`reorder_level = $${i++}`);
    values.push(data.reorder_level);
  }

  if (fields.length === 0) {
    return null;
  }

  const result = await pool.query(
    `
    UPDATE inventory
    SET ${fields.join(", ")}
    WHERE product_id = $${i}
    RETURNING *
    `,
    [...values, productId]
  );

  return result.rows[0] || null;
}


// Update inventory product
async function restockInventoryItem(id, { stock }) {
  const result = await pool.query(
    `
    UPDATE inventory
    SET
      current_stock = current_stock + $1,
      last_restock = NOW()
    WHERE product_id = $2
    RETURNING *
    `,
    [stock, id]
  );
  return result.rows[0] || null;
}

// Delete inventory product
async function deleteInventoryItem(id) {
  const result = await pool.query(
    `
    DELETE FROM inventory
    WHERE product_id = $1
    RETURNING *
    `,
    [id]
  );
  return result.rows[0] || null;
}

module.exports = {
  getInventory,
  getInventoryInStock,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  restockInventoryItem
};
