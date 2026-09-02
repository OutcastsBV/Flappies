const pool = require("../db");
const { getConfig, applyHappyHourPrice, isHappyHourActive } = require("./config.service");
const { listEnabled } = require("./paymentMethod.service");
const { getOpenRegisterForUser } = require("./register.service");
const { processPayment } = require("../payments");
const {
  getSucceededWeroPayment,
  assertWeroAmountMatches,
} = require("./wero.service");
const {
  getSucceededSumupPayment,
  assertSumupAmountMatches,
} = require("./sumup.service");
const {
  createTransaction,
  addItemToTransaction,
} = require("./transaction.service");
const metrics = require("../lib/metrics");

async function assertPaymentMethod(method) {
  const enabled = await listEnabled();
  if (!enabled.some((m) => m.method_key === method)) {
    throw new Error(`Payment method '${method}' is not enabled`);
  }
}

/**
 * Price the current cart with the same happy-hour rules checkout uses, so a
 * Wero QR amount cannot drift from the sale that gets recorded.
 */
async function getCartQuote(userId, { client } = {}) {
  const db = client || pool;
  const lockSql = client ? "FOR UPDATE" : "";

  const cartResult = await db.query(
    `
      SELECT
        c.item_id,
        c.amount,
        p.name,
        p.price,
        i.current_stock
      FROM cart c
      JOIN product p ON p.id = c.item_id
      JOIN inventory i ON i.product_id = p.id
      WHERE c.user_id = $1
      ${lockSql}
    `,
    [userId]
  );

  if (cartResult.rows.length === 0) {
    const err = new Error("Cart is empty");
    err.status = 400;
    throw err;
  }

  const config = await getConfig();
  const happyHourActive = isHappyHourActive(config);

  const lineItems = cartResult.rows.map((item) => ({
    product_id: item.item_id,
    name: item.name,
    quantity: item.amount,
    unit_price: applyHappyHourPrice(Number(item.price), config),
  }));

  const total = lineItems.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  );

  return {
    rows: cartResult.rows,
    lineItems,
    total,
    happyHourActive,
  };
}

/**
 * Atomic checkout: validate payment method + register session, update
 * stock, record the transaction (and its cash/reference details).
 * Wero and SumUp sales are recorded only after the provider reports success
 * and the paid amount matches the locked cart total.
 */
async function checkout(userId, paymentMethod, { amountTendered, paymentReference } = {}) {
  await assertPaymentMethod(paymentMethod);

  const registerSession = await getOpenRegisterForUser(userId);
  if (!registerSession) {
    const err = new Error("Register is not open. Open the register before taking payments.");
    err.status = 400;
    throw err;
  }

  let weroPayment = null;
  let sumupPayment = null;
  if (paymentMethod === "WERO") {
    weroPayment = await getSucceededWeroPayment(paymentReference);
  }
  if (paymentMethod === "SUMUP") {
    sumupPayment = await getSucceededSumupPayment(paymentReference);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const quote = await getCartQuote(userId, { client });

    for (const item of quote.rows) {
      if (item.current_stock < item.amount) {
        throw new Error(`Insufficient stock for product ${item.item_id}`);
      }
    }

    if (weroPayment) {
      assertWeroAmountMatches(weroPayment, quote.total);
    }
    if (sumupPayment) {
      assertSumupAmountMatches(sumupPayment, quote.total);
    }

    const { changeDue } = processPayment(paymentMethod, quote.total, {
      amountTendered,
      paymentReference,
    });

    for (const item of quote.rows) {
      await client.query(
        `UPDATE inventory SET current_stock = current_stock - $1 WHERE product_id = $2`,
        [item.amount, item.item_id]
      );
    }

    const transaction = await createTransaction(client, {
      total_amount: quote.total,
      user_id: userId,
      payment_method: paymentMethod,
      register_session_id: registerSession.id,
      amount_tendered: paymentMethod === "CASH" ? amountTendered : null,
      payment_reference: paymentMethod === "CASH" ? null : paymentReference || null,
      happy_hour_active: quote.happyHourActive,
    });

    for (const item of quote.lineItems) {
      await addItemToTransaction(client, transaction.id, {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
      });
    }

    await client.query(`DELETE FROM cart WHERE user_id = $1`, [userId]);

    await client.query("COMMIT");

    metrics.transactionsTotal.inc({ payment_method: paymentMethod });
    metrics.transactionRevenueTotal.inc({ payment_method: paymentMethod }, quote.total);
    for (const item of quote.lineItems) {
      metrics.itemUnitsSoldTotal.inc({ product_name: item.name }, item.quantity);
    }

    return {
      transaction_id: transaction.id,
      total: quote.total,
      payment_method: paymentMethod,
      change_due: changeDue,
      timestamp: transaction.timestamp,
      items: quote.lineItems,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505" && /wero_payment_reference|sumup_payment_reference/.test(err.constraint || "")) {
      const dup = new Error(
        paymentMethod === "SUMUP"
          ? "This SumUp payment has already been recorded"
          : "This Wero payment has already been recorded"
      );
      dup.status = 409;
      throw dup;
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  checkout,
  assertPaymentMethod,
  getCartQuote,
};
