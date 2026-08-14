const { before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../../app");
const { setupDatabase } = require("../helpers/migrate");
const { seedTestData } = require("../helpers/seed");
const { testAuthHeaders } = require("../helpers/auth");

process.env.NODE_ENV = "test";

describe("correction e2e", () => {
  let fixtures;
  let cashierAuth;
  let managerAuth;
  let transactionId;

  before(async () => {
    await setupDatabase();
    fixtures = await seedTestData();
    cashierAuth = testAuthHeaders(fixtures.cashierSub);
    managerAuth = testAuthHeaders(fixtures.managerSub, { roles: ["manager"] });

    await request(app)
      .post("/register/open")
      .set(cashierAuth)
      .send({ starting_amount: 20 });
    await request(app)
      .post("/cart")
      .set(cashierAuth)
      .send({ item_id: fixtures.productId, amount: 2 });
    const checkoutRes = await request(app)
      .post("/cart/checkout")
      .set(cashierAuth)
      .send({ payment_method: "CASH", amount_tendered: 5 });
    transactionId = checkoutRes.body.transaction_id;
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app).post("/corrections").send({});
    assert.equal(res.status, 401);
  });

  it("validates required fields", async () => {
    const missingTransaction = await request(app)
      .post("/corrections")
      .set(cashierAuth)
      .send({ type: "REFUND", amount: 1, reason: "oops" });
    assert.equal(missingTransaction.status, 400);

    const badType = await request(app)
      .post("/corrections")
      .set(cashierAuth)
      .send({ transaction_id: transactionId, type: "NOT_A_TYPE", amount: 1, reason: "oops" });
    assert.equal(badType.status, 400);

    const badAmount = await request(app)
      .post("/corrections")
      .set(cashierAuth)
      .send({ transaction_id: transactionId, type: "REFUND", amount: -1, reason: "oops" });
    assert.equal(badAmount.status, 400);

    const missingReason = await request(app)
      .post("/corrections")
      .set(cashierAuth)
      .send({ transaction_id: transactionId, type: "REFUND", amount: 1, reason: "  " });
    assert.equal(missingReason.status, 400);
  });

  it("returns 404 for an unknown transaction", async () => {
    const res = await request(app)
      .post("/corrections")
      .set(cashierAuth)
      .send({ transaction_id: 999999, type: "REFUND", amount: 1, reason: "oops" });

    assert.equal(res.status, 404);
  });

  it("allows any authenticated staff member to log a correction", async () => {
    const res = await request(app)
      .post("/corrections")
      .set(cashierAuth)
      .send({
        transaction_id: transactionId,
        type: "PRICE_ADJUSTMENT",
        amount: 1.5,
        reason: "Charged wrong price",
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.type, "PRICE_ADJUSTMENT");
    assert.equal(Number(res.body.amount), 1.5);
    assert.equal(res.body.transaction_id, transactionId);
  });

  it("forbids cashiers from listing all corrections", async () => {
    const res = await request(app).get("/corrections").set(cashierAuth);
    assert.equal(res.status, 403);
  });

  it("allows managers to list all corrections", async () => {
    const res = await request(app).get("/corrections").set(managerAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].created_by_username, "testcashier");
  });
});
