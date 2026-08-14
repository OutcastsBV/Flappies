const pool = require("../db");

function parseDateRange(from, to) {
  return {
    from: from ? new Date(`${from}T00:00:00.000`) : null,
    to: to ? new Date(`${to}T23:59:59.999`) : null,
  };
}

async function getSalesSummary(from, to) {
  const { from: fromDate, to: toDate } = parseDateRange(from, to);
  const conditions = [];
  const values = [];
  let i = 1;

  if (fromDate) {
    conditions.push(`timestamp >= $${i++}`);
    values.push(fromDate);
  }
  if (toDate) {
    conditions.push(`timestamp <= $${i++}`);
    values.push(toDate);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `
    SELECT
      COUNT(*)::int AS transaction_count,
      COALESCE(SUM(total_amount), 0)::float AS total_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'WALLET'), 0)::float AS wallet_revenue,
      COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'CARD'), 0)::float AS card_revenue
    FROM "transaction"
    ${where}
    `,
    values
  );

  return result.rows[0];
}

async function getSalesByProduct(from, to) {
  const { from: fromDate, to: toDate } = parseDateRange(from, to);
  const conditions = [];
  const values = [];
  let i = 1;

  if (fromDate) {
    conditions.push(`t.timestamp >= $${i++}`);
    values.push(fromDate);
  }
  if (toDate) {
    conditions.push(`t.timestamp <= $${i++}`);
    values.push(toDate);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `
    SELECT
      p.id AS product_id,
      p.name,
      SUM(ti.quantity)::int AS units_sold,
      SUM(ti.quantity * COALESCE(ti.unit_price, p.price))::float AS revenue
    FROM transactionitem ti
    JOIN "transaction" t ON t.id = ti.transaction_id
    JOIN product p ON p.id = ti.product_id
    ${where}
    GROUP BY p.id, p.name
    ORDER BY revenue DESC
    `,
    values
  );

  return result.rows;
}

async function getSalesByDay(from, to) {
  const { from: fromDate, to: toDate } = parseDateRange(from, to);
  const conditions = [];
  const values = [];
  let i = 1;

  if (fromDate) {
    conditions.push(`timestamp >= $${i++}`);
    values.push(fromDate);
  }
  if (toDate) {
    conditions.push(`timestamp <= $${i++}`);
    values.push(toDate);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `
    SELECT
      DATE(timestamp) AS day,
      COUNT(*)::int AS transaction_count,
      COALESCE(SUM(total_amount), 0)::float AS revenue
    FROM "transaction"
    ${where}
    GROUP BY DATE(timestamp)
    ORDER BY day DESC
    `,
    values
  );

  return result.rows;
}

async function getPnLReport(from, to) {
  const { from: fromDate, to: toDate } = parseDateRange(from, to);
  const conditions = [];
  const values = [];
  let i = 1;

  if (fromDate) {
    conditions.push(`t.timestamp >= $${i++}`);
    values.push(fromDate);
  }
  if (toDate) {
    conditions.push(`t.timestamp <= $${i++}`);
    values.push(toDate);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `
    SELECT
      p.id AS product_id,
      p.name,
      SUM(ti.quantity)::int AS units_sold,
      SUM(ti.quantity * COALESCE(ti.unit_price, p.price))::float AS revenue,
      SUM(ti.quantity * p.cost_price)::float AS cost,
      SUM(ti.quantity * COALESCE(ti.unit_price, p.price) - ti.quantity * p.cost_price)::float AS profit
    FROM transactionitem ti
    JOIN "transaction" t ON t.id = ti.transaction_id
    JOIN product p ON p.id = ti.product_id
    ${where}
    GROUP BY p.id, p.name
    ORDER BY profit DESC
    `,
    values
  );

  const products = result.rows;
  const totals = products.reduce(
    (acc, row) => ({
      revenue: acc.revenue + Number(row.revenue),
      cost: acc.cost + Number(row.cost),
      profit: acc.profit + Number(row.profit),
    }),
    { revenue: 0, cost: 0, profit: 0 }
  );

  return { products, totals };
}

module.exports = {
  getSalesSummary,
  getSalesByProduct,
  getSalesByDay,
  getPnLReport,
};
