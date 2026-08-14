const { processCashPayment } = require("./cash");
const { processExternalPayment } = require("./external");

/**
 * Route a payment to its handler. CASH gets its own tendered/change-due
 * logic; every other enabled method (Stripe, SumUp, future providers) is
 * "record only" for now, handled generically so new methods don't need new
 * checkout code — just a payment_method_config row + registry entry.
 */
function processPayment(method, total, details = {}) {
  if (method === "CASH") {
    return processCashPayment(total, details);
  }

  return processExternalPayment(total, details);
}

module.exports = { processPayment };
