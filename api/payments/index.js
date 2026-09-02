const { processCashPayment } = require("./cash");
const { processExternalPayment } = require("./external");

/**
 * Route a payment to its handler. CASH gets its own tendered/change-due
 * logic; Wero and SumUp are verified against their providers before this
 * is called; Stripe is "record only" for now.
 */
function processPayment(method, total, details = {}) {
  if (method === "CASH") {
    return processCashPayment(total, details);
  }

  return processExternalPayment(total, details);
}

module.exports = { processPayment };
