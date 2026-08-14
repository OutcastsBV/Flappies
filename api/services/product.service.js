const pool = require("../db");

// Get all products
async function getAllProducts() {
  const result = await pool.query(
    `SELECT * FROM product ORDER BY id`
  );
  return result.rows;
}

// Get single product
async function getProductById(id) {
  const result = await pool.query(
    `SELECT * FROM product WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

// Create product
async function createProduct({ name, description, price, cost_price = 0 }) {
  const result = await pool.query(
    `
    INSERT INTO product (name, description, price, cost_price)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [name, description, price, cost_price]
  );
  return result.rows[0];
}

// Update product
async function updateProduct(id, { name, description, price, cost_price }) {
  const fields = [];
  const values = [];
  let index = 1;

  if (name !== undefined) {
    fields.push(`name = $${index++}`);
    values.push(name);
  }

  if (description !== undefined) {
    fields.push(`description = $${index++}`);
    values.push(description);
  }

  if (price !== undefined) {
    fields.push(`price = $${index++}`);
    values.push(price);
  }

  if (cost_price !== undefined) {
    fields.push(`cost_price = $${index++}`);
    values.push(cost_price);
  }

  if (fields.length === 0) {
    return null;
  }

  const result = await pool.query(
    `
    UPDATE product
    SET ${fields.join(', ')}
    WHERE id = $${index}
    RETURNING *
    `,
    [...values, id]
  );

  return result.rows[0] || null;
}


// Soft delete product
async function deleteProduct(id) {
  const result = await pool.query(
    `
    DELETE FROM product
    WHERE id = $1
    RETURNING *
    `,
    [id]
  );
  return result.rows[0] || null;
}

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
