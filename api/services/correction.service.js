const pool = require("../db");
const metrics = require("../lib/metrics");

const TYPES = ["REFUND", "PRICE_ADJUSTMENT", "ITEM_REMOVED", "OTHER"];

async function createCorrection({ transactionId, type, amount, reason, createdBy }) {
  const transactionResult = await pool.query(
    `SELECT id FROM "transaction" WHERE id = $1`,
    [transactionId]
  );

  if (transactionResult.rows.length === 0) {
    const err = new Error("Transaction not found");
    err.status = 404;
    throw err;
  }

  const result = await pool.query(
    `
    INSERT INTO correction (transaction_id, type, amount, reason, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
    `,
    [transactionId, type, amount, reason, createdBy]
  );

  metrics.correctionsTotal.inc({ type });

  return result.rows[0];
}

async function getCorrectionsForTransaction(transactionId) {
  const result = await pool.query(
    `
    SELECT c.*, u.username AS created_by_username
    FROM correction c
    JOIN "user" u ON u.id = c.created_by
    WHERE c.transaction_id = $1
    ORDER BY c.created_at ASC
    `,
    [transactionId]
  );
  return result.rows;
}

async function listCorrections(filters = {}) {
  const conditions = [];
  const values = [];
  let i = 1;

  if (filters.from) {
    conditions.push(`c.created_at >= $${i++}`);
    values.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`c.created_at <= $${i++}`);
    values.push(filters.to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `
    SELECT c.*, u.username AS created_by_username
    FROM correction c
    JOIN "user" u ON u.id = c.created_by
    ${where}
    ORDER BY c.created_at DESC
    `,
    values
  );
  return result.rows;
}

module.exports = {
  TYPES,
  createCorrection,
  getCorrectionsForTransaction,
  listCorrections,
};
