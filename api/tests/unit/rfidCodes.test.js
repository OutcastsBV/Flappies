const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { storeRfidCode, consumeRfidCode } = require("../../lib/rfidCodes");

describe("rfidCodes", () => {
  it("stores and consumes a one-time code", () => {
    const code = storeRfidCode("token-abc", 3600);
    assert.equal(typeof code, "string");
    assert.ok(code.length >= 32);

    const entry = consumeRfidCode(code);
    assert.deepEqual(entry, {
      accessToken: "token-abc",
      expiresIn: 3600,
      expiresAt: entry.expiresAt,
    });
    assert.ok(entry.expiresAt > Date.now());
  });

  it("returns null for unknown codes", () => {
    assert.equal(consumeRfidCode("does-not-exist"), null);
  });

  it("cannot consume the same code twice", () => {
    const code = storeRfidCode("token-once", 120);
    assert.ok(consumeRfidCode(code));
    assert.equal(consumeRfidCode(code), null);
  });
});
