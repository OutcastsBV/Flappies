const pool = require("../db");
const paymentConfig = require("../config/payments");
const { addBalance } = require("./user.service");

function buildEpcQrPayload({ beneficiaryName, iban, bic, amount, reference }) {
  return [
    "BCD",
    "002",
    "1",
    "SCT",
    bic || "",
    beneficiaryName.substring(0, 70),
    iban.replace(/\s/g, "").toUpperCase(),
    `EUR${amount.toFixed(2)}`,
    "",
    "",
    reference.substring(0, 140),
  ].join("\n");
}

function getAvailableMethods(shopConfig) {
  const methods = [];

  if (
    paymentConfig.envAllowsEpc() &&
    paymentConfig.isEpcConfigured() &&
    shopConfig.top_up_epc_enabled
  ) {
    methods.push("epc_qr");
  }

  if (
    paymentConfig.envAllowsStripe() &&
    paymentConfig.isStripeConfigured() &&
    shopConfig.top_up_stripe_enabled
  ) {
    methods.push("stripe");
  }

  return methods;
}

async function createEpcTopUp(userId, amount) {
  const reference = `TOPUP-${userId}-${Date.now()}`;

  const result = await pool.query(
    `
    INSERT INTO top_up_request (user_id, amount, method, reference)
    VALUES ($1, $2, 'epc_qr', $3)
    RETURNING id, reference, amount, created_at
    `,
    [userId, amount, reference]
  );

  const request = result.rows[0];
  const epcPayload = buildEpcQrPayload({
    beneficiaryName: paymentConfig.epc.beneficiaryName,
    iban: paymentConfig.epc.iban,
    bic: paymentConfig.epc.bic,
    amount,
    reference,
  });

  return {
    request_id: request.id,
    reference: request.reference,
    amount: request.amount,
    epc_payload: epcPayload,
    beneficiary_name: paymentConfig.epc.beneficiaryName,
    iban: paymentConfig.epc.iban,
    message:
      "Scan the QR code with your banking app. Your balance will be updated once the transfer is confirmed.",
  };
}

async function createStripeTopUp(userId, amount) {
  const Stripe = require("stripe");
  const stripe = new Stripe(paymentConfig.stripe.secretKey);

  const reference = `TOPUP-${userId}-${Date.now()}`;

  const insertResult = await pool.query(
    `
    INSERT INTO top_up_request (user_id, amount, method, reference)
    VALUES ($1, $2, 'stripe', $3)
    RETURNING id, reference
    `,
    [userId, amount, reference]
  );

  const request = insertResult.rows[0];

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: "Wallet top-up",
            description: `KassaSysteem balance top-up (${reference})`,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      },
    ],
    client_reference_id: String(request.id),
    metadata: {
      top_up_request_id: String(request.id),
      user_id: String(userId),
      reference,
    },
    success_url: paymentConfig.stripe.successUrl,
    cancel_url: paymentConfig.stripe.cancelUrl,
  });

  await pool.query(
    `
    UPDATE top_up_request
    SET stripe_session_id = $1
    WHERE id = $2
    `,
    [session.id, request.id]
  );

  return {
    request_id: request.id,
    reference: request.reference,
    checkout_url: session.url,
  };
}

async function completeTopUpRequest(requestId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const requestResult = await client.query(
      `
      SELECT id, user_id, amount, status
      FROM top_up_request
      WHERE id = $1
      FOR UPDATE
      `,
      [requestId]
    );

    const request = requestResult.rows[0];
    if (!request) {
      throw new Error("Top-up request not found");
    }

    if (request.status === "completed") {
      await client.query("COMMIT");
      return { alreadyCompleted: true, userId: request.user_id };
    }

    if (request.status !== "pending") {
      throw new Error(`Top-up request is ${request.status}`);
    }

    await addBalance(request.user_id, request.amount, client);

    await client.query(
      `
      UPDATE top_up_request
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [requestId]
    );

    await client.query("COMMIT");
    return { alreadyCompleted: false, userId: request.user_id };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function handleStripeWebhook(rawBody, signature) {
  if (!paymentConfig.stripe.webhookSecret) {
    throw new Error("Stripe webhook secret is not configured");
  }

  const Stripe = require("stripe");
  const stripe = new Stripe(paymentConfig.stripe.secretKey);

  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    paymentConfig.stripe.webhookSecret
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const requestId = Number(
      session.metadata?.top_up_request_id || session.client_reference_id
    );

    if (!requestId) {
      throw new Error("Missing top-up request id on Stripe session");
    }

    await completeTopUpRequest(requestId);
  }

  return { received: true };
}

async function listPendingTopUps() {
  const result = await pool.query(
    `
    SELECT
      t.id,
      t.user_id,
      t.amount,
      t.method,
      t.reference,
      t.created_at,
      u.username
    FROM top_up_request t
    JOIN "user" u ON u.id = t.user_id
    WHERE t.status = 'pending'
    ORDER BY t.created_at ASC
    `
  );

  return result.rows;
}

module.exports = {
  buildEpcQrPayload,
  getAvailableMethods,
  createEpcTopUp,
  createStripeTopUp,
  completeTopUpRequest,
  handleStripeWebhook,
  listPendingTopUps,
};
