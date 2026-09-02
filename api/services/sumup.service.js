const logger = require("../lib/logger");
const {
  getDecryptedConfig,
  isEnabled,
  updateMethod,
} = require("./paymentMethod.service");
const { getOpenRegisterForUser } = require("./register.service");
const sumup = require("../payments/sumup");

async function requireSumupConfig() {
  if (!(await isEnabled("SUMUP"))) {
    const err = new Error("SumUp is not enabled");
    err.status = 400;
    throw err;
  }

  const config = await getDecryptedConfig("SUMUP");
  if (!config.api_key || !config.merchant_code) {
    const err = new Error("SumUp is not configured");
    err.status = 503;
    throw err;
  }

  return config;
}

async function requireSumupAdminConfig() {
  const config = await getDecryptedConfig("SUMUP");
  if (!config.api_key || !config.merchant_code) {
    const err = new Error(
      "Save a SumUp API key and merchant code before pairing a terminal"
    );
    err.status = 400;
    throw err;
  }
  return config;
}

async function resolveReaderId(config, requestedReaderId) {
  const readers = await sumup.listReaders(config);
  return sumup.pickPairedReader(readers, requestedReaderId);
}

async function listSumupReaders() {
  const config = await requireSumupAdminConfig();
  return sumup.listReaders(config);
}

async function pairSumupReader(adminUserId, { pairingCode, name }) {
  const config = await requireSumupAdminConfig();
  const reader = await sumup.pairReader(config, { pairingCode, name });
  if (!config.reader_id) {
    await updateMethod(
      "SUMUP",
      { config: { reader_id: reader.id } },
      adminUserId
    );
  }
  logger.info({ readerId: reader.id }, "Paired SumUp reader");
  return reader;
}

async function createSumupCheckout(userId, quote, requestedReaderId) {
  const config = await requireSumupConfig();
  const registerSession = await getOpenRegisterForUser(userId);
  if (!registerSession) {
    const err = new Error(
      "Register is not open. Open the register before taking payments."
    );
    err.status = 400;
    throw err;
  }

  const amountCents = sumup.eurosToCents(quote.total);
  if (amountCents < 1) {
    const err = new Error("SumUp amount must be at least €0.01");
    err.status = 400;
    throw err;
  }

  const readerId = await resolveReaderId(config, requestedReaderId);
  const description = quote.lineItems
    .map((item) => `${item.quantity}× ${item.name}`)
    .join(", ")
    .slice(0, 128);

  const checkout = await sumup.createReaderCheckout(config, readerId, {
    amountCents,
    description: description || "Flappies",
  });

  logger.info(
    { checkoutId: checkout.checkoutId, readerId, amountCents },
    "Created SumUp reader checkout"
  );

  return {
    readerId,
    checkoutId: checkout.checkoutId,
    clientTransactionId: checkout.clientTransactionId,
    status: checkout.status || "pending",
    paymentReference: sumup.formatPaymentReference(
      readerId,
      checkout.checkoutId
    ),
    amountCents,
    total: quote.total,
    validUntil: checkout.validUntil,
  };
}

async function getSumupCheckout(readerId, checkoutId) {
  const config = await requireSumupConfig();
  const checkout = await sumup.getReaderCheckout(config, readerId, checkoutId);
  return {
    ...checkout,
    paymentReference: checkout.checkoutId
      ? sumup.formatPaymentReference(readerId, checkout.checkoutId)
      : null,
  };
}

async function cancelSumupCheckout(readerId) {
  const config = await requireSumupConfig();
  try {
    await sumup.terminateCheckout(config, readerId);
  } catch (err) {
    if (err.status && err.status < 500) {
      logger.info({ readerId, err: err.message }, "SumUp terminate skipped");
      return;
    }
    throw err;
  }
}

async function getSucceededSumupPayment(paymentReference) {
  const parsed = sumup.parsePaymentReference(paymentReference);
  const config = await requireSumupConfig();
  const readerId = parsed.readerId || (await resolveReaderId(config));
  const checkout = await sumup.getReaderCheckout(
    config,
    readerId,
    parsed.checkoutId
  );
  if (checkout.status !== "successful") {
    sumup.assertCheckoutSucceeded(checkout, checkout.amountCents);
  }
  return checkout;
}

function assertSumupAmountMatches(checkout, expectedTotal) {
  return sumup.assertCheckoutSucceeded(
    checkout,
    sumup.eurosToCents(expectedTotal)
  );
}

module.exports = {
  listSumupReaders,
  pairSumupReader,
  createSumupCheckout,
  getSumupCheckout,
  cancelSumupCheckout,
  getSucceededSumupPayment,
  assertSumupAmountMatches,
};
