const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

describe("topup.service", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.TOP_UP_EPC_QR_ENABLED = "true";
    process.env.TOP_UP_STRIPE_ENABLED = "true";
    process.env.EPC_QR_IBAN = "BE68539007547034";
    process.env.EPC_QR_BENEFICIARY_NAME = "Nerdlab";
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    delete require.cache[require.resolve("../../config/payments")];
    delete require.cache[require.resolve("../../services/topup.service")];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    delete require.cache[require.resolve("../../config/payments")];
    delete require.cache[require.resolve("../../services/topup.service")];
  });

  it("builds a valid EPC QR payload", () => {
    const { buildEpcQrPayload } = require("../../services/topup.service");

    const payload = buildEpcQrPayload({
      beneficiaryName: "Nerdlab",
      iban: "BE68 5390 0754 7034",
      bic: "GKCCBEBB",
      amount: 10.5,
      reference: "TOPUP-1-123",
    });

    assert.match(payload, /^BCD\n002\n1\nSCT\n/);
    assert.match(payload, /EUR10\.50/);
    assert.match(payload, /TOPUP-1-123/);
  });

  it("returns available methods based on env and admin toggles", () => {
    const { getAvailableMethods } = require("../../services/topup.service");

    assert.deepEqual(
      getAvailableMethods({
        top_up_epc_enabled: true,
        top_up_stripe_enabled: false,
      }),
      ["epc_qr"]
    );

    assert.deepEqual(
      getAvailableMethods({
        top_up_epc_enabled: false,
        top_up_stripe_enabled: true,
      }),
      ["stripe"]
    );

    assert.deepEqual(
      getAvailableMethods({
        top_up_epc_enabled: false,
        top_up_stripe_enabled: false,
      }),
      []
    );
  });
});
