const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  SANDBOX_BASE,
  PRODUCTION_BASE,
  eurosToCents,
  apiBase,
  enlargeQr,
  assertPaymentId,
  createPayment,
  getPayment,
  cancelPayment,
  assertPaymentSucceeded,
} = require("../../payments/wero");

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

const CREATED = {
  paymentId: "5bdb1685b93d1c000bde96f2",
  status: "PENDING",
  expiresAt: "2020-01-01T00:02:00.000Z",
  amount: 250,
  currency: "EUR",
  _links: {
    qrcode: {
      href: "https://portal.ext.payconiq.com/qrcode?c=https%3A%2F%2Fpayconiq.com%2Fpay%2F2%2Fx",
    },
  },
};

describe("payments/wero", () => {
  it("converts euro amounts to integer cents", () => {
    assert.equal(eurosToCents(2.5), 250);
    assert.equal(eurosToCents(1.25), 125);
    assert.equal(eurosToCents(10), 1000);
  });

  it("uses the sandbox host unless environment is production", () => {
    assert.equal(apiBase({}), SANDBOX_BASE);
    assert.equal(apiBase({ environment: "sandbox" }), SANDBOX_BASE);
    assert.equal(apiBase({ environment: "production" }), PRODUCTION_BASE);
  });

  it("asks Payconiq for a medium PNG QR", () => {
    const url = enlargeQr(
      "https://portal.ext.payconiq.com/qrcode?c=https%3A%2F%2Fpayconiq.com%2Fpay%2F2%2Fx"
    );
    assert.match(url, /s=M/);
    assert.match(url, /f=PNG/);
  });

  it("rejects a short or malformed payment id before calling Payconiq", () => {
    assert.throws(() => assertPaymentId("abc"), /Invalid Wero payment id/);
    assert.throws(() => assertPaymentId("../payments"), /Invalid Wero payment id/);
  });

  it("creates a payment against the sandbox API with the merchant key", async () => {
    const calls = [];
    const fetchFn = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(201, CREATED);
    };

    const payment = await createPayment(
      { api_key: "key-1", environment: "sandbox" },
      { amount: 250, currency: "EUR", description: "1× Cola" },
      { fetchFn }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${SANDBOX_BASE}/payments`);
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers.Authorization, "Bearer key-1");
    assert.equal(JSON.parse(calls[0].options.body).amount, 250);
    assert.equal(payment.paymentId, CREATED.paymentId);
    assert.equal(payment.status, "PENDING");
    assert.match(payment.qrcodeUrl, /s=M/);
  });

  it("creates a payment against the production API when configured", async () => {
    const calls = [];
    const fetchFn = async (url) => {
      calls.push(url);
      return jsonResponse(201, CREATED);
    };

    await createPayment(
      { api_key: "key-1", environment: "production" },
      { amount: 100, currency: "EUR" },
      { fetchFn }
    );

    assert.equal(calls[0], `${PRODUCTION_BASE}/payments`);
  });

  it("maps a 401 from Payconiq to a 503 about the API key", async () => {
    const fetchFn = async () => jsonResponse(401, { code: "UNAUTHORIZED" });

    await assert.rejects(
      () =>
        createPayment(
          { api_key: "bad" },
          { amount: 100, currency: "EUR" },
          { fetchFn }
        ),
      (err) => {
        assert.equal(err.status, 503);
        assert.match(err.message, /API key/);
        return true;
      }
    );
  });

  it("gets and cancels a payment by id", async () => {
    const calls = [];
    const fetchFn = async (url, options) => {
      calls.push({ url, method: options.method });
      if (options.method === "DELETE") {
        return { status: 204, ok: true, json: async () => ({}) };
      }
      return jsonResponse(200, { ...CREATED, status: "SUCCEEDED" });
    };

    const payment = await getPayment(
      { api_key: "key-1" },
      CREATED.paymentId,
      { fetchFn }
    );
    assert.equal(payment.status, "SUCCEEDED");

    await cancelPayment({ api_key: "key-1" }, CREATED.paymentId, { fetchFn });

    assert.equal(calls[0].url, `${SANDBOX_BASE}/payments/${CREATED.paymentId}`);
    assert.equal(calls[1].method, "DELETE");
  });

  it("accepts only a succeeded payment whose amount matches the cart", () => {
    const payment = {
      paymentId: CREATED.paymentId,
      status: "SUCCEEDED",
      amount: 250,
    };
    assert.equal(assertPaymentSucceeded(payment, 250), payment);

    assert.throws(
      () => assertPaymentSucceeded({ ...payment, status: "PENDING" }, 250),
      /still processing/
    );
    assert.throws(
      () => assertPaymentSucceeded(payment, 100),
      /does not match the cart total/
    );
    assert.throws(
      () => assertPaymentSucceeded({ ...payment, status: "EXPIRED" }, 250),
      /not complete/
    );
  });
});
