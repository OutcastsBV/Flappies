const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  getAllowedPaymentMethods,
} = require("../../services/checkout.service");

describe("checkout.service", () => {
  it("allows wallet payments in self_service mode", () => {
    const originalMode = process.env.OPERATION_MODE;
    process.env.OPERATION_MODE = "self_service";

    try {
      assert.deepEqual(getAllowedPaymentMethods(), ["WALLET"]);
    } finally {
      process.env.OPERATION_MODE = originalMode;
    }
  });

  it("allows wallet payments in pos mode until card handler exists", () => {
    const originalMode = process.env.OPERATION_MODE;
    process.env.OPERATION_MODE = "pos";

    try {
      delete require.cache[require.resolve("../../config/app")];
      delete require.cache[require.resolve("../../services/checkout.service")];
      const checkout = require("../../services/checkout.service");
      assert.deepEqual(checkout.getAllowedPaymentMethods(), ["WALLET"]);
    } finally {
      process.env.OPERATION_MODE = originalMode;
      delete require.cache[require.resolve("../../config/app")];
      delete require.cache[require.resolve("../../services/checkout.service")];
    }
  });
});
