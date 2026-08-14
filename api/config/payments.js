function isEnabledFlag(value) {
  return value === "true" || value === "1";
}

module.exports = {
  epc: {
    iban: process.env.EPC_QR_IBAN || "",
    beneficiaryName: process.env.EPC_QR_BENEFICIARY_NAME || "",
    bic: process.env.EPC_QR_BIC || "",
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    successUrl:
      process.env.STRIPE_SUCCESS_URL ||
      `${process.env.FRONTEND_URL || "http://localhost:3002"}/dashboard?topup=success`,
    cancelUrl:
      process.env.STRIPE_CANCEL_URL ||
      `${process.env.FRONTEND_URL || "http://localhost:3002"}/dashboard?topup=cancelled`,
  },
  isEpcConfigured() {
    return Boolean(this.epc.iban && this.epc.beneficiaryName);
  },
  isStripeConfigured() {
    return Boolean(this.stripe.secretKey);
  },
  envAllowsEpc() {
    return isEnabledFlag(process.env.TOP_UP_EPC_QR_ENABLED);
  },
  envAllowsStripe() {
    return isEnabledFlag(process.env.TOP_UP_STRIPE_ENABLED);
  },
};
