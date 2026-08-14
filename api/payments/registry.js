/**
 * Static metadata for each supported payment method: which config fields it
 * needs (and whether they're secret) so the admin config UI and encryption
 * layer know what to render/protect. Adding a future provider only requires
 * a new entry here plus a row in payment_method_config — no other code
 * changes, since unknown methods are treated as "record only" at checkout.
 */
const METHODS = {
  CASH: {
    label: "Cash",
    configFields: [],
  },
  STRIPE: {
    label: "Stripe",
    configFields: [
      { key: "secret_key", label: "Secret key", secret: true },
      { key: "publishable_key", label: "Publishable key", secret: false },
    ],
  },
  SUMUP: {
    label: "SumUp",
    configFields: [
      { key: "api_key", label: "API key", secret: true },
      { key: "merchant_code", label: "Merchant code", secret: false },
    ],
  },
};

function getMethodDefinition(methodKey) {
  return METHODS[methodKey] || { label: methodKey, configFields: [] };
}

module.exports = { METHODS, getMethodDefinition };
