const pool = require("../db");
const appConfig = require("../config/app");
const { getConfig, applyHappyHourPrice } = require("./config.service");
const { processPayment } = require("../payments");
const {
  createTransaction,
  addItemToTransaction,
} = require("./transaction.service");

function getAllowedPaymentMethods() {
  return appConfig.paymentMethods[appConfig.operationMode] || ["WALLET"];
}

function assertPaymentMethod(method) {
  const allowed = getAllowedPaymentMethods();
  if (!allowed.includes(method)) {
    throw new Error(`Payment method '${method}' is not allowed in ${appConfig.operationMode} mode`);
  }
}

/**
 * Atomic checkout: validate payment, update stock, deduct balance, record transaction.
 */
async function checkout(userId, paymentMethod = "WALLET") {
  assertPaymentMethod(paymentMethod);

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

    await processPayment(paymentMethod, client, userId, total);

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

    return {
      transaction_id: transaction.id,
      total,
      payment_method: paymentMethod,
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
  getAllowedPaymentMethods,
};
