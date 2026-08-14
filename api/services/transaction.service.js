const pool = require("../db");

function groupTransactionRows(rows) {
  const map = new Map();

  for (const row of rows) {
    if (!map.has(row.id)) {
      map.set(row.id, {
        id: row.id,
        total_amount: Number(row.total_amount),
        timestamp: row.timestamp,
        user_id: row.user_id,
        username: row.username,
        payment_method: row.payment_method,
        amount_tendered: row.amount_tendered != null ? Number(row.amount_tendered) : null,
        payment_reference: row.payment_reference,
        register_session_id: row.register_session_id,
        happy_hour_active: row.happy_hour_active,
        items: [],
      });
    }

    if (row.product_id) {
      map.get(row.id).items.push({
        product_id: row.product_id,
        quantity: row.quantity,
        unit_price: Number(row.unit_price ?? row.price),
        name: row.name,
      });
    }
  }

  return Array.from(map.values());
}

const TRANSACTION_SELECT = `
  SELECT
    t.id,
    t.total_amount,
    t.timestamp,
    t.user_id,
    t.payment_method,
    t.amount_tendered,
    t.payment_reference,
    t.register_session_id,
    t.happy_hour_active,
    u.username,
    ti.product_id,
    ti.quantity,
    ti.unit_price,
    p.name,
    p.price
  FROM "transaction" t
  LEFT JOIN "user" u ON u.id = t.user_id
  LEFT JOIN transactionitem ti ON t.id = ti.transaction_id
  LEFT JOIN product p ON ti.product_id = p.id
`;

async function getTransactions(filters = {}) {
  const conditions = [];
  const values = [];
  let i = 1;

  if (filters.from) {
    conditions.push(`t.timestamp >= $${i++}`);
    values.push(filters.from);
  }

  if (filters.to) {
    conditions.push(`t.timestamp <= $${i++}`);
    values.push(filters.to);
  }

  if (filters.user_id) {
    conditions.push(`t.user_id = $${i++}`);
    values.push(filters.user_id);
  }

  if (filters.happy_hour != null) {
    conditions.push(`t.happy_hour_active = $${i++}`);
    values.push(filters.happy_hour);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `${TRANSACTION_SELECT} ${where} ORDER BY t.timestamp DESC`,
    values
  );

  return groupTransactionRows(result.rows);
}

async function getTransactionById(id) {
  const result = await pool.query(
    `${TRANSACTION_SELECT} WHERE t.id = $1 ORDER BY ti.product_id`,
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return groupTransactionRows(result.rows)[0];
}

async function createTransaction(
  client,
  {
    total_amount,
    user_id,
    payment_method,
    register_session_id = null,
    amount_tendered = null,
    payment_reference = null,
    happy_hour_active = false,
  }
) {
  const result = await client.query(
    `
    INSERT INTO "transaction"
      (total_amount, user_id, payment_method, register_session_id, amount_tendered, payment_reference, happy_hour_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
    `,
    [total_amount, user_id, payment_method, register_session_id, amount_tendered, payment_reference, happy_hour_active]
  );

  return result.rows[0];
}

async function addItemToTransaction(
  client,
  transactionId,
  { product_id, quantity, unit_price }
) {
  const result = await client.query(
    `
    INSERT INTO transactionitem
      (transaction_id, product_id, quantity, unit_price)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [transactionId, product_id, quantity, unit_price]
  );

  return result.rows[0];
}

module.exports = {
  getTransactions,
  getTransactionById,
  createTransaction,
  addItemToTransaction,
  groupTransactionRows,
};
