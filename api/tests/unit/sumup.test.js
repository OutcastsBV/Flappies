const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  API_BASE,
  eurosToCents,
  formatPaymentReference,
  parsePaymentReference,
  createReaderCheckout,
  getReaderCheckout,
  terminateCheckout,
  pairReader,
  listReaders,
  assertCheckoutSucceeded,
} = require("../../payments/sumup");

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

const READER_ID = "rdr_3MSAFM23CK82VSTT4BN6RWSQ65";
const CHECKOUT_ID = "00e33a36-c99b-4cb2-b635-b90c1455c9c8";
const CONFIG = { api_key: "sup_sk_test", merchant_code: "MK10CL2A" };

describe("payments/sumup", () => {
  it("converts euro amounts to integer cents", () => {
    assert.equal(eurosToCents(2.5), 250);
  });

  it("round-trips a reader/checkout payment reference", () => {
    const ref = formatPaymentReference(READER_ID, CHECKOUT_ID);
    assert.deepEqual(parsePaymentReference(ref), {
      readerId: READER_ID,
      checkoutId: CHECKOUT_ID,
    });
  });

  it("creates a reader checkout against the Cloud API", async () => {
    const calls = [];
    const fetchFn = async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(201, {
        data: {
          checkout_id: CHECKOUT_ID,
          client_transaction_id: CHECKOUT_ID,
        },
      });
    };

    const checkout = await createReaderCheckout(
      CONFIG,
      READER_ID,
      { amountCents: 250, description: "1× Cola" },
      { fetchFn }
    );

    assert.equal(
      calls[0].url,
      `${API_BASE}/v0.1/merchants/MK10CL2A/readers/${READER_ID}/checkout`
    );
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.headers.Authorization, "Bearer sup_sk_test");
    assert.deepEqual(JSON.parse(calls[0].options.body).total_amount, {
      currency: "EUR",
      minor_unit: 2,
      value: 250,
    });
    assert.equal(checkout.checkoutId, CHECKOUT_ID);
    assert.equal(checkout.readerId, READER_ID);
  });

  it("maps a 401 from SumUp to a 503 about the API key", async () => {
    const fetchFn = async () =>
      jsonResponse(401, { errors: { detail: "Unauthorized", type: "INVALID_ACCESS_TOKEN" } });

    await assert.rejects(
      () => listReaders(CONFIG, { fetchFn }),
      (err) => {
        assert.equal(err.status, 503);
        assert.match(err.message, /API key/);
        return true;
      }
    );
  });

  it("maps an offline reader to a 400", async () => {
    const fetchFn = async () =>
      jsonResponse(422, {
        errors: { detail: "The device is offline.", type: "READER_OFFLINE" },
      });

    await assert.rejects(
      () =>
        createReaderCheckout(CONFIG, READER_ID, { amountCents: 100 }, { fetchFn }),
      (err) => {
        assert.equal(err.status, 400);
        assert.match(err.message, /offline/);
        return true;
      }
    );
  });

  it("gets and terminates a checkout", async () => {
    const calls = [];
    const fetchFn = async (url, options) => {
      calls.push({ url, method: options.method });
      if (options.method === "POST") {
        return { status: 202, ok: true, json: async () => ({}) };
      }
      return jsonResponse(200, {
        data: {
          checkout_id: CHECKOUT_ID,
          client_transaction_id: CHECKOUT_ID,
          status: "successful",
          total_amount: { currency: "EUR", minor_unit: 2, value: 250 },
        },
      });
    };

    const checkout = await getReaderCheckout(CONFIG, READER_ID, CHECKOUT_ID, {
      fetchFn,
    });
    assert.equal(checkout.status, "successful");
    assert.equal(checkout.amountCents, 250);

    await terminateCheckout(CONFIG, READER_ID, { fetchFn });
    assert.equal(calls[1].method, "POST");
    assert.match(calls[1].url, /\/terminate$/);
  });

  it("pairs a reader with an uppercase pairing code", async () => {
    const calls = [];
    const fetchFn = async (url, options) => {
      calls.push(JSON.parse(options.body));
      return jsonResponse(201, {
        id: READER_ID,
        name: "Register",
        status: "processing",
        device: { identifier: "U1DT3NA00-CN", model: "solo" },
        created_at: "2023-01-01T00:00:00Z",
        updated_at: "2023-01-01T00:00:00Z",
      });
    };

    const reader = await pairReader(
      CONFIG,
      { pairingCode: "4wlfdsbf", name: "Register" },
      { fetchFn }
    );
    assert.equal(calls[0].pairing_code, "4WLFDSBF");
    assert.equal(reader.id, READER_ID);
    assert.equal(reader.model, "solo");
  });

  it("accepts only a successful checkout whose amount matches the cart", () => {
    const checkout = {
      checkoutId: CHECKOUT_ID,
      status: "successful",
      amountCents: 250,
    };
    assert.equal(assertCheckoutSucceeded(checkout, 250), checkout);
    assert.throws(
      () => assertCheckoutSucceeded({ ...checkout, status: "pending" }, 250),
      /still processing/
    );
    assert.throws(
      () => assertCheckoutSucceeded(checkout, 100),
      /does not match the cart total/
    );
  });

  it("picks a requested paired reader or the only paired one", () => {
    const { pickPairedReader } = require("../../payments/sumup");
    const bar = { id: READER_ID, name: "Bar", status: "paired" };
    const terrace = {
      id: "rdr_AAAAAAAAAAAAAAAAAAAAAAAAAA",
      name: "Terrace",
      status: "paired",
    };

    assert.equal(pickPairedReader([bar], null), READER_ID);
    assert.equal(pickPairedReader([bar, terrace], terrace.id), terrace.id);
    assert.throws(() => pickPairedReader([bar, terrace], null), /Choose which/);
    assert.throws(() => pickPairedReader([], null), /No SumUp terminal is paired/);
  });
});
