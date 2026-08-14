const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("checkout payment methods", () => {
  it("allows WALLET and rejects CARD in self_service mode", () => {
    // Re-require with known env so the module picks up self_service
    delete require.cache[require.resolve("../../config/app")];
    delete require.cache[require.resolve("../../services/checkout.service")];
    process.env.OPERATION_MODE = "self_service";

    const {
      getAllowedPaymentMethods,
    } = require("../../services/checkout.service");

    assert.deepEqual(getAllowedPaymentMethods(), ["WALLET"]);
  });

  it("does not allow CARD even in pos mode until a handler exists", () => {
    delete require.cache[require.resolve("../../config/app")];
    delete require.cache[require.resolve("../../services/checkout.service")];
    process.env.OPERATION_MODE = "pos";

    const appConfig = require("../../config/app");
    assert.deepEqual(appConfig.paymentMethods.pos, ["WALLET"]);
  });
});
