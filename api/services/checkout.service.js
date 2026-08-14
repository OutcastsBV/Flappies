const pool = require("../db");
const { getConfig, applyHappyHourPrice, isHappyHourActive } = require("./config.service");
const { listEnabled } = require("./paymentMethod.service");
const { getOpenRegisterForUser } = require("./register.service");
const { processPayment } = require("../payments");
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
 * Atomic checkout: validate payment method + register session, update
 * stock, record the transaction (and its cash/reference details).
 */
async function checkout(userId, paymentMethod, { amountTendered, paymentReference } = {}) {
  await assertPaymentMethod(paymentMethod);

  const registerSession = await getOpenRegisterForUser(userId);
  if (!registerSession) {
    const err = new Error("Register is not open. Open the register before taking payments.");
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const cartResult = await client.query(
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
      FOR UPDATE
      `,
      [userId]
    );

    if (cartResult.rows.length === 0) {
      throw new Error("Cart is empty");
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

    for (const item of cartResult.rows) {
      if (item.current_stock < item.amount) {
        throw new Error(`Insufficient stock for product ${item.item_id}`);
      }
    }

    const { changeDue } = processPayment(paymentMethod, total, {
      amountTendered,
      paymentReference,
    });

    for (const item of cartResult.rows) {
      await client.query(
        `UPDATE inventory SET current_stock = current_stock - $1 WHERE product_id = $2`,
        [item.amount, item.item_id]
      );
    }

    const transaction = await createTransaction(client, {
      total_amount: total,
      user_id: userId,
      payment_method: paymentMethod,
      register_session_id: registerSession.id,
      amount_tendered: paymentMethod === "CASH" ? amountTendered : null,
      payment_reference: paymentMethod === "CASH" ? null : paymentReference || null,
      happy_hour_active: happyHourActive,
    });

    for (const item of lineItems) {
      await addItemToTransaction(client, transaction.id, {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
      });
    }

    await client.query(`DELETE FROM cart WHERE user_id = $1`, [userId]);

    await client.query("COMMIT");

    metrics.transactionsTotal.inc({ payment_method: paymentMethod });
    metrics.transactionRevenueTotal.inc({ payment_method: paymentMethod }, total);
    for (const item of lineItems) {
      metrics.itemUnitsSoldTotal.inc({ product_name: item.name }, item.quantity);
    }

    return {
      transaction_id: transaction.id,
      total,
      payment_method: paymentMethod,
      change_due: changeDue,
      timestamp: transaction.timestamp,
      items: lineItems,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  checkout,
  assertPaymentMethod,
};
