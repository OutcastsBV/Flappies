const pool = require("../db");
const { getConfig, applyHappyHourPrice } = require("./config.service");

// Get the user's cart
async function getUserCart(user_id) {
  const result = await pool.query(
    `SELECT c.item_id, p.name, p.price, c.amount FROM cart c JOIN product p ON p.id = c.item_id WHERE c.user_id = $1 ORDER BY c.item_id`,
    [user_id]
  );

  const config = await getConfig();

  return result.rows.map((item) => ({
    ...item,
    price: applyHappyHourPrice(Number(item.price), config),
  }));
}

// Create cart
async function createCart({ user_id, item_id, amount = 1 }) {
  const result = await pool.query(
    `
    INSERT INTO cart (user_id, item_id, amount)
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [user_id, item_id, amount]
  );
  return result.rows[0];
}

// Change Item Amount to cart
async function addItem(user_id, item_id, { amount }) {
  const result = await pool.query(
    `
    UPDATE cart
    SET
      amount = $3
    WHERE user_id = $1 AND item_id = $2
    RETURNING *
    `,
    [user_id, item_id, amount]
  );
  return result.rows[0] || null;
}


// Delete cart item
async function deleteCartItem(user_id, item_id) {
  const result = await pool.query(
    `
    DELETE FROM cart
    WHERE user_id = $1 AND item_id = $2
    RETURNING *
    `,
    [user_id, item_id]
  );
  return result.rows[0] || null;
}

// Delete cart
async function deleteCart(user_id) {
  const result = await pool.query(
    `
    DELETE FROM cart
    WHERE user_id = $1
    RETURNING *
    `,
    [user_id]
  );
  return result.rows[0] || null;
}


module.exports = {
  getUserCart,
  createCart,
  addItem,
  deleteCartItem,
  deleteCart,
};
