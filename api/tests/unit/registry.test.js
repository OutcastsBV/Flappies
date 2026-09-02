const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { METHODS, getMethodDefinition } = require("../../payments/registry");

describe("payments/registry", () => {
  it("defines CASH with no config fields", () => {
    assert.equal(METHODS.CASH.label, "Cash");
    assert.deepEqual(METHODS.CASH.configFields, []);
  });

  it("defines STRIPE, SUMUP, and WERO with a required secret field", () => {
    for (const key of ["STRIPE", "SUMUP", "WERO"]) {
      const def = METHODS[key];
      assert.ok(def.label);
      const secretFields = def.configFields.filter((f) => f.secret);
      assert.ok(secretFields.length >= 1);
    }
  });

  it("defines SUMUP with a required merchant code and optional reader id", () => {
    const merchant = METHODS.SUMUP.configFields.find((f) => f.key === "merchant_code");
    const reader = METHODS.SUMUP.configFields.find((f) => f.key === "reader_id");
    assert.equal(merchant.required, true);
    assert.equal(reader.secret, false);
    assert.match(reader.help, /rdr_/);
  });

  it("defines WERO with sandbox/production environment options", () => {
    const envField = METHODS.WERO.configFields.find((f) => f.key === "environment");
    assert.deepEqual(envField.options, ["sandbox", "production"]);
    assert.equal(envField.secret, false);
  });

  it("returns a generic fallback definition for unknown methods", () => {
    const def = getMethodDefinition("PAYPAL");
    assert.equal(def.label, "PAYPAL");
    assert.deepEqual(def.configFields, []);
  });

  it("treats known methods as available unless PAYMENT_<METHOD>_AVAILABLE is false", () => {
    const {
      isMethodAvailable,
      availabilityEnvName,
    } = require("../../payments/registry");

    assert.equal(availabilityEnvName("stripe"), "PAYMENT_STRIPE_AVAILABLE");
    assert.equal(isMethodAvailable("STRIPE"), true);
    assert.equal(isMethodAvailable("cash"), true);

    const previous = process.env.PAYMENT_STRIPE_AVAILABLE;
    process.env.PAYMENT_STRIPE_AVAILABLE = "false";
    try {
      assert.equal(isMethodAvailable("STRIPE"), false);
      assert.equal(isMethodAvailable("CASH"), true);
    } finally {
      if (previous === undefined) delete process.env.PAYMENT_STRIPE_AVAILABLE;
      else process.env.PAYMENT_STRIPE_AVAILABLE = previous;
    }
  });

  it("accepts 0/off/no as unavailable and 1/yes/on as available", () => {
    const { isMethodAvailable } = require("../../payments/registry");
    const previous = process.env.PAYMENT_WERO_AVAILABLE;
    try {
      process.env.PAYMENT_WERO_AVAILABLE = "0";
      assert.equal(isMethodAvailable("WERO"), false);
      process.env.PAYMENT_WERO_AVAILABLE = "off";
      assert.equal(isMethodAvailable("WERO"), false);
      process.env.PAYMENT_WERO_AVAILABLE = "yes";
      assert.equal(isMethodAvailable("WERO"), true);
    } finally {
      if (previous === undefined) delete process.env.PAYMENT_WERO_AVAILABLE;
      else process.env.PAYMENT_WERO_AVAILABLE = previous;
    }
  });
});
