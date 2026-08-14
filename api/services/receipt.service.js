const { getTransactionById } = require("./transaction.service");

async function getReceipt(transactionId, { userId, isAdmin }) {
  const transaction = await getTransactionById(transactionId);

  if (!transaction) {
    return null;
  }

  if (!isAdmin && transaction.user_id !== userId) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }

  return {
    id: transaction.id,
    timestamp: transaction.timestamp,
    total_amount: transaction.total_amount,
    payment_method: transaction.payment_method,
    amount_tendered: transaction.amount_tendered,
    change_due:
      transaction.amount_tendered != null
        ? Number((transaction.amount_tendered - transaction.total_amount).toFixed(2))
        : undefined,
    username: transaction.username,
    items: transaction.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.unit_price * item.quantity,
    })),
  };
}

module.exports = { getReceipt };
