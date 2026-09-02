/**
 * "record only" handler for any enabled payment method that isn't cash
 * and doesn't have its own live flow (Stripe). Wero and SumUp are verified
 * against their providers in checkout.service before this records the sale.
 */
function processExternalPayment(total, { paymentReference } = {}) {
  if (paymentReference != null && typeof paymentReference !== "string") {
    throw new Error("payment_reference must be a string");
  }

  if (paymentReference && paymentReference.length > 140) {
    throw new Error("payment_reference is too long (max 140 characters)");
  }

  return { changeDue: 0 };
}

module.exports = { processExternalPayment };
