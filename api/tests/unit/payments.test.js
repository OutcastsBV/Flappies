const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");
const { processPayment, HANDLERS } = require("../../payments");

describe("payments", () => {
  it("exposes a WALLET handler only", () => {
    assert.equal(typeof HANDLERS.WALLET, "function");
    assert.equal(HANDLERS.CARD, undefined);
  });

  it("rejects unsupported payment methods", async () => {
    await assert.rejects(
      () => processPayment("CARD", {}, 1, 10),
      /Unsupported payment method: CARD/
    );
  });

  it("delegates WALLET payments to the wallet handler", async () => {
    const client = {
      query: mock.fn(async (sql) => {
        if (sql.includes("SELECT balance")) {
          return { rows: [{ balance: 50 }] };
        }
        return { rows: [] };
      }),
    };

    await processPayment("WALLET", client, 7, 12.5);
    assert.equal(client.query.mock.callCount(), 2);
    const updateCall = client.query.mock.calls[1];
    assert.match(updateCall.arguments[0], /UPDATE "user" SET balance/);
    assert.deepEqual(updateCall.arguments[1], [12.5, 7]);
  });

  it("rejects insufficient wallet balance", async () => {
    const client = {
      query: mock.fn(async () => ({ rows: [{ balance: 5 }] })),
    };

    await assert.rejects(
      () => processPayment("WALLET", client, 1, 10),
      /Insufficient balance/
    );
  });
});
