const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { processPayment } = require("../../payments");
const { processCashPayment } = require("../../payments/cash");
const { processExternalPayment } = require("../../payments/external");

describe("payments/cash", () => {
  it("computes change due for exact/overpaid cash", () => {
    assert.deepEqual(processCashPayment(10, { amountTendered: 10 }), {
      changeDue: 0,
    });
    assert.deepEqual(processCashPayment(10, { amountTendered: 15 }), {
      changeDue: 5,
    });
  });

  it("rejects missing or non-numeric amountTendered", () => {
    assert.throws(() => processCashPayment(10, {}), /amount_tendered is required/);
    assert.throws(
      () => processCashPayment(10, { amountTendered: "abc" }),
      /amount_tendered is required/
    );
  });

  it("rejects insufficient cash tendered", () => {
    assert.throws(
      () => processCashPayment(10, { amountTendered: 5 }),
      /less than the total due/
    );
  });
});

describe("payments/external", () => {
  it("records an optional payment reference with no balance mutation", () => {
    assert.deepEqual(
      processExternalPayment(20, { paymentReference: "txn_123" }),
      { changeDue: 0 }
    );
    assert.deepEqual(processExternalPayment(20, {}), { changeDue: 0 });
  });

  it("rejects a non-string payment reference", () => {
    assert.throws(
      () => processExternalPayment(20, { paymentReference: 123 }),
      /must be a string/
    );
  });

  it("rejects an overly long payment reference", () => {
    assert.throws(
      () => processExternalPayment(20, { paymentReference: "x".repeat(141) }),
      /too long/
    );
  });
});

describe("payments/index dispatcher", () => {
  it("routes CASH to the cash handler", () => {
    const result = processPayment("CASH", 10, { amountTendered: 12 });
    assert.deepEqual(result, { changeDue: 2 });
  });

  it("routes any other method to the generic external handler", () => {
    assert.deepEqual(
      processPayment("STRIPE", 10, { paymentReference: "ch_1" }),
      { changeDue: 0 }
    );
    assert.deepEqual(processPayment("SUMUP", 10, {}), { changeDue: 0 });
  });
});
