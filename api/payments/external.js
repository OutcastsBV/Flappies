/**
 * Generic "record only" handler for any enabled payment method that isn't
 * cash (Stripe, SumUp, and any future provider). The payment is taken on a
 * separate device/app outside this system; we just record the method and an
 * optional reference note. No balance mutation, no live API call (yet).
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
