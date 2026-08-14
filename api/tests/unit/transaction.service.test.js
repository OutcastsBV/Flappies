const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  groupTransactionRows,
} = require("../../services/transaction.service");

describe("transaction.service", () => {
  it("groups flat transaction rows into nested items", () => {
    const rows = [
      {
        id: 1,
        total_amount: 10,
        timestamp: "2026-07-15T12:00:00.000Z",
        user_id: 7,
        username: "alice",
        payment_method: "WALLET",
        product_id: 3,
        quantity: 2,
        unit_price: 2.5,
        name: "Cola",
        price: 2.5,
      },
      {
        id: 1,
        total_amount: 10,
        timestamp: "2026-07-15T12:00:00.000Z",
        user_id: 7,
        username: "alice",
        payment_method: "WALLET",
        product_id: 4,
        quantity: 1,
        unit_price: 5,
        name: "Chips",
        price: 5,
      },
    ];

    const grouped = groupTransactionRows(rows);

    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].items.length, 2);
    assert.equal(grouped[0].items[0].name, "Cola");
    assert.equal(grouped[0].items[1].name, "Chips");
  });
});
