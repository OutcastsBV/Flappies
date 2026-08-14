const pool = require("../db");

async function getOpenRegisterForUser(userId) {
  const result = await pool.query(
    `
    SELECT *
    FROM register_session
    WHERE opened_by = $1 AND status = 'open'
    `,
    [userId]
  );
  return result.rows[0] || null;
}

async function openRegister(userId, startingAmount) {
  try {
    const result = await pool.query(
      `
      INSERT INTO register_session (opened_by, starting_amount)
      VALUES ($1, $2)
      RETURNING *
      `,
      [userId, startingAmount]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === "23505") {
      const wrapped = new Error("Register is already open");
      wrapped.status = 409;
      throw wrapped;
    }
    throw err;
  }
}

/**
 * Live/close-time summary for a session. Corrections are only counted if
 * they were created by the session's own cashier while it was open, on the
 * assumption a correction affects whichever physical drawer is currently
 * open for that cashier — this is a simplification, not full bookkeeping.
 */
async function getSessionSummary(session) {
  const salesResult = await pool.query(
    `
    SELECT
      COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'CASH'), 0)::float AS cash_sales,
      COALESCE(SUM(total_amount) FILTER (WHERE payment_method != 'CASH'), 0)::float AS other_sales,
      COUNT(*)::int AS transaction_count
    FROM "transaction"
    WHERE register_session_id = $1
    `,
    [session.id]
  );

  const correctionsResult = await pool.query(
    `
    SELECT
      COALESCE(SUM(c.amount) FILTER (WHERE t.payment_method = 'CASH'), 0)::float AS cash_corrections,
      COALESCE(SUM(c.amount), 0)::float AS total_corrections
    FROM correction c
    JOIN "transaction" t ON t.id = c.transaction_id
    WHERE c.created_by = $1
      AND c.created_at >= $2
      AND c.created_at <= $3
    `,
    [session.opened_by, session.opened_at, session.closed_at || new Date()]
  );

  const sales = salesResult.rows[0];
  const corrections = correctionsResult.rows[0];
  const startingAmount = Number(session.starting_amount);
  const expectedCash = Number(
    (startingAmount + sales.cash_sales - corrections.cash_corrections).toFixed(2)
  );

  return {
    starting_amount: startingAmount,
    cash_sales: sales.cash_sales,
    other_sales: sales.other_sales,
    total_sales: Number((sales.cash_sales + sales.other_sales).toFixed(2)),
    transaction_count: sales.transaction_count,
    cash_corrections: corrections.cash_corrections,
    total_corrections: corrections.total_corrections,
    expected_cash: expectedCash,
  };
}

async function getCurrentForUser(userId) {
  const session = await getOpenRegisterForUser(userId);
  if (!session) return null;

  const summary = await getSessionSummary(session);
  return { session, summary };
}

async function closeRegister(userId, { countedCashAmount, notes }) {
  const session = await getOpenRegisterForUser(userId);
  if (!session) {
    const err = new Error("No open register session for this user");
    err.status = 400;
    throw err;
  }

  const summary = await getSessionSummary({ ...session, closed_at: new Date() });

  const result = await pool.query(
    `
    UPDATE register_session
    SET status = 'closed',
        closed_by = $2,
        closed_at = CURRENT_TIMESTAMP,
        counted_cash_amount = $3,
        expected_cash_amount = $4,
        notes = $5
    WHERE id = $1
    RETURNING *
    `,
    [session.id, userId, countedCashAmount, summary.expected_cash, notes || null]
  );

  return {
    session: result.rows[0],
    summary: {
      ...summary,
      counted_cash: countedCashAmount,
      variance: Number((countedCashAmount - summary.expected_cash).toFixed(2)),
    },
  };
}

async function listSessions(filters = {}) {
  const conditions = [];
  const values = [];
  let i = 1;

  if (filters.from) {
    conditions.push(`rs.opened_at >= $${i++}`);
    values.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`rs.opened_at <= $${i++}`);
    values.push(filters.to);
  }
  if (filters.userId) {
    conditions.push(`rs.opened_by = $${i++}`);
    values.push(filters.userId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `
    SELECT
      rs.*,
      opener.username AS opened_by_username,
      closer.username AS closed_by_username
    FROM register_session rs
    JOIN "user" opener ON opener.id = rs.opened_by
    LEFT JOIN "user" closer ON closer.id = rs.closed_by
    ${where}
    ORDER BY rs.opened_at DESC
    `,
    values
  );

  return result.rows;
}

module.exports = {
  getOpenRegisterForUser,
  openRegister,
  getSessionSummary,
  getCurrentForUser,
  closeRegister,
  listSessions,
};
