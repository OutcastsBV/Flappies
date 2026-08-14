/**
 * Payment handlers — extend here when adding POS card payments or top-up providers.
 * Checkout service delegates to these based on payment_method.
 */

async function processWalletPayment(client, userId, total) {
  const userResult = await client.query(
    `SELECT balance FROM "user" WHERE id = $1 FOR UPDATE`,
    [userId]
  );

  const balance = Number(userResult.rows[0].balance);

  if (balance < total) {
    throw new Error("Insufficient balance");
  }

  await client.query(
    `UPDATE "user" SET balance = balance - $1 WHERE id = $2`,
    [total, userId]
  );
}

// Future: processCardPayment(client, userId, total, cardDetails) { ... }

module.exports = {
  processWalletPayment,
};
