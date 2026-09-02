const logger = require("../lib/logger");
const { getDecryptedConfig, isEnabled } = require("./paymentMethod.service");
const { getOpenRegisterForUser } = require("./register.service");
const wero = require("../payments/wero");

async function requireWeroConfig() {
  if (!(await isEnabled("WERO"))) {
    const err = new Error("Wero is not enabled");
    err.status = 400;
    throw err;
  }

  const config = await getDecryptedConfig("WERO");
  if (!config.api_key) {
    const err = new Error("Wero is not configured");
    err.status = 503;
    throw err;
  }

  return config;
}

async function createWeroPayment(userId, quote) {
  const config = await requireWeroConfig();
  const registerSession = await getOpenRegisterForUser(userId);
  if (!registerSession) {
    const err = new Error(
      "Register is not open. Open the register before taking payments."
    );
    err.status = 400;
    throw err;
  }

  const amountCents = wero.eurosToCents(quote.total);
  if (amountCents < 1 || amountCents > 999999) {
    const err = new Error("Wero amount must be between €0.01 and €9,999.99");
    err.status = 400;
    throw err;
  }

  const description = quote.lineItems
    .map((item) => `${item.quantity}× ${item.name}`)
    .join(", ")
    .slice(0, 140);

  const payment = await wero.createPayment(config, {
    amount: amountCents,
    currency: "EUR",
    description: description || "Flappies",
    reference: `f-${userId}-${Date.now()}`.slice(0, 36),
  });

  logger.info(
    { paymentId: payment.paymentId, amountCents },
    "Created Wero payment"
  );

  return {
    paymentId: payment.paymentId,
    status: payment.status,
    expiresAt: payment.expiresAt,
    qrcodeUrl: payment.qrcodeUrl,
    amountCents,
    total: quote.total,
  };
}

async function getWeroPayment(paymentId) {
  const config = await requireWeroConfig();
  const payment = await wero.getPayment(config, paymentId);
  return {
    paymentId: payment.paymentId,
    status: payment.status,
    expiresAt: payment.expiresAt,
    amountCents: payment.amount,
  };
}

async function cancelWeroPayment(paymentId) {
  const config = await requireWeroConfig();
  try {
    await wero.cancelPayment(config, paymentId);
  } catch (err) {
    // Already paid, expired, or cancelled — the POS can ignore this.
    if (err.status && err.status < 500) {
      logger.info(
        { paymentId, err: err.message },
        "Wero cancel skipped"
      );
      return;
    }
    throw err;
  }
}

async function getSucceededWeroPayment(paymentReference) {
  if (!paymentReference || typeof paymentReference !== "string") {
    const err = new Error("Wero payment reference is required");
    err.status = 400;
    throw err;
  }

  const config = await requireWeroConfig();
  const payment = await wero.getPayment(config, paymentReference);
  if (payment.status !== "SUCCEEDED") {
    wero.assertPaymentSucceeded(payment, payment.amount);
  }
  return payment;
}

function assertWeroAmountMatches(payment, expectedTotal) {
  return wero.assertPaymentSucceeded(payment, wero.eurosToCents(expectedTotal));
}

module.exports = {
  createWeroPayment,
  getWeroPayment,
  cancelWeroPayment,
  getSucceededWeroPayment,
  assertWeroAmountMatches,
};
