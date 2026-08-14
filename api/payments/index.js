const { processWalletPayment } = require("./wallet");

const HANDLERS = {
  WALLET: processWalletPayment,
  // CARD: require('./card').processCardPayment,
};

async function processPayment(method, client, userId, total) {
  const handler = HANDLERS[method];
  if (!handler) {
    throw new Error(`Unsupported payment method: ${method}`);
  }
  return handler(client, userId, total);
}

module.exports = { processPayment, HANDLERS };
