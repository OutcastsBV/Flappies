const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { METHODS, getMethodDefinition } = require("../../payments/registry");

describe("payments/registry", () => {
  it("defines CASH with no config fields", () => {
    assert.equal(METHODS.CASH.label, "Cash");
    assert.deepEqual(METHODS.CASH.configFields, []);
  });

  it("defines STRIPE and SUMUP with a required secret field", () => {
    for (const key of ["STRIPE", "SUMUP"]) {
      const def = METHODS[key];
      assert.ok(def.label);
      const secretFields = def.configFields.filter((f) => f.secret);
      assert.ok(secretFields.length >= 1);
    }
  });

  it("returns a generic fallback definition for unknown methods", () => {
    const def = getMethodDefinition("PAYPAL");
    assert.equal(def.label, "PAYPAL");
    assert.deepEqual(def.configFields, []);
  });
});
