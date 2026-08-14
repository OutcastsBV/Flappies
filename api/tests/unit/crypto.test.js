const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { encrypt, decrypt } = require("../../lib/crypto");

describe("lib/crypto", () => {
  it("round-trips a plaintext value", () => {
    const ciphertext = encrypt("sk_test_super_secret");
    assert.notEqual(ciphertext, "sk_test_super_secret");
    assert.equal(decrypt(ciphertext), "sk_test_super_secret");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encrypt("same-value");
    const b = encrypt("same-value");
    assert.notEqual(a, b);
    assert.equal(decrypt(a), "same-value");
    assert.equal(decrypt(b), "same-value");
  });

  it("returns null when encrypting empty/nullish input", () => {
    assert.equal(encrypt(null), null);
    assert.equal(encrypt(""), null);
    assert.equal(encrypt(undefined), null);
  });

  it("returns null when decrypting invalid input", () => {
    assert.equal(decrypt(null), null);
    assert.equal(decrypt(""), null);
    assert.equal(decrypt("not-a-valid-ciphertext"), null);
    assert.equal(decrypt(42), null);
  });

  it("fails to decrypt with a tampered ciphertext", () => {
    const ciphertext = encrypt("sk_test_super_secret");
    const [iv, authTag, data] = ciphertext.split(":");
    const tampered = [iv, authTag, Buffer.from("tampered").toString("base64")].join(":");
    assert.equal(decrypt(tampered), null);
  });
});
