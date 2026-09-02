/**
 * Static metadata for each supported payment method: which config fields it
 * needs (and whether they're secret) so the admin config UI and encryption
 * layer know what to render/protect. Adding a future provider only requires
 * a new entry here plus a row in payment_method_config — no other code
 * changes, since unknown methods are treated as "record only" at checkout.
 *
 * The hosting owner can hide a method from Config and checkout with
 * PAYMENT_<METHOD>_AVAILABLE=false (e.g. PAYMENT_STRIPE_AVAILABLE=false).
 * Unset/true leaves the tenant admin's Enabled checkbox in charge.
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
      { key: "merchant_code", label: "Merchant code", secret: false, required: true },
      {
        key: "reader_id",
        label: "Reader ID",
        secret: false,
        help: "Optional default Solo at checkout (rdr_…). Pairing fills this if empty. All paired terminals can take payments; cashiers pick one when more than one is paired.",
      },
    ],
  },
  WERO: {
    label: "Wero",
    configFields: [
      { key: "api_key", label: "API key", secret: true },
      { key: "payment_profile_id", label: "Payment profile ID", secret: false },
      {
        key: "environment",
        label: "Environment",
        secret: false,
        options: ["sandbox", "production"],
      },
    ],
  },
};

function getMethodDefinition(methodKey) {
  return METHODS[methodKey] || { label: methodKey, configFields: [] };
}

function availabilityEnvName(methodKey) {
  return `PAYMENT_${String(methodKey || "").toUpperCase()}_AVAILABLE`;
}

function envFlag(name, defaultValue = true) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return defaultValue;
  return /^(1|true|yes|on)$/i.test(String(raw).trim());
}

/**
 * Host-level module switch. Known methods default to available so existing
 * tenants keep their Config boxes; set PAYMENT_STRIPE_AVAILABLE=false to hide
 * Stripe for a tenant that should not get that module.
 */
function isMethodAvailable(methodKey) {
  const key = String(methodKey || "").toUpperCase();
  if (!METHODS[key]) return true;
  return envFlag(availabilityEnvName(key), true);
}

module.exports = {
  METHODS,
  getMethodDefinition,
  availabilityEnvName,
  isMethodAvailable,
};
