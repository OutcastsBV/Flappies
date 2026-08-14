const { before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../../app");
const pool = require("../../db");
const { setupDatabase } = require("../helpers/migrate");
const { seedTestData } = require("../helpers/seed");
const { testAuthHeaders } = require("../helpers/auth");

process.env.NODE_ENV = "test";

const OTHER_CASHIER_SUB = "33333333-3333-3333-3333-333333333333";

function pad(n) {
  return String(n).padStart(2, "0");
}

describe("transaction e2e", () => {
  let fixtures;
  let cashierAuth;
  let adminAuth;
  let otherAuth;
  let transactionId;
  let happyHourTransactionId;

  before(async () => {
    await setupDatabase();
    fixtures = await seedTestData();
    cashierAuth = testAuthHeaders(fixtures.cashierSub);
    adminAuth = testAuthHeaders(fixtures.adminSub, { roles: ["admin"] });
    otherAuth = testAuthHeaders(OTHER_CASHIER_SUB);

    await pool.query(
      `INSERT INTO "user" (keycloak_id, username, email, role, is_active)
       VALUES ($1, 'othercashier', 'other@test.com', 'cashier', true)`,
      [OTHER_CASHIER_SUB]
    );

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

    // Configure happy hour to cover right now (a rolling 1-hour window
    // starting on the current hour, so this isn't flaky around midnight)
    // and ring up a second transaction while it's "active".
    const now = new Date();
    const startHour = now.getHours();
    const endHour = (startHour + 1) % 24;

    await request(app)
      .put("/config")
      .set(adminAuth)
      .send({
        happy_hour_days: [now.getDay()],
        happy_hour_start_time: `${pad(startHour)}:00`,
        happy_hour_end_time: `${pad(endHour)}:00`,
      });

    await request(app)
      .post("/cart")
      .set(cashierAuth)
      .send({ item_id: fixtures.productId, amount: 2 });

    const happyHourCheckoutRes = await request(app)
      .post("/cart/checkout")
      .set(cashierAuth)
      .send({ payment_method: "CASH", amount_tendered: 5 });

    happyHourTransactionId = happyHourCheckoutRes.body.transaction_id;
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/transactions/mine");
    assert.equal(res.status, 401);
  });

  it("lists the caller's own transactions under /mine", async () => {
    const res = await request(app).get("/transactions/mine").set(cashierAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
    const original = res.body.find((t) => t.id === transactionId);
    assert.ok(original);
    assert.equal(original.items.length, 1);
    assert.equal(original.items[0].name, "Cola");
    assert.equal(Number(original.amount_tendered), 5);
  });

  it("forbids non-admin/manager from listing all transactions", async () => {
    const res = await request(app).get("/transactions").set(cashierAuth);
    assert.equal(res.status, 403);
  });

  it("allows admins to list all transactions", async () => {
    const res = await request(app).get("/transactions").set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
  });

  it("flags a transaction rung up during happy hour and leaves others unflagged", async () => {
    const regularRes = await request(app)
      .get(`/transactions/${transactionId}`)
      .set(cashierAuth);
    assert.equal(regularRes.status, 200);
    assert.equal(regularRes.body.happy_hour_active, false);

    const happyHourRes = await request(app)
      .get(`/transactions/${happyHourTransactionId}`)
      .set(cashierAuth);
    assert.equal(happyHourRes.status, 200);
    assert.equal(happyHourRes.body.happy_hour_active, true);
  });

  it("filters transactions by happy_hour status", async () => {
    const onlyHappyHour = await request(app)
      .get("/transactions?happy_hour=true")
      .set(adminAuth);
    assert.equal(onlyHappyHour.status, 200);
    assert.deepEqual(
      onlyHappyHour.body.map((t) => t.id),
      [happyHourTransactionId]
    );

    const onlyRegular = await request(app)
      .get("/transactions?happy_hour=false")
      .set(adminAuth);
    assert.equal(onlyRegular.status, 200);
    assert.deepEqual(
      onlyRegular.body.map((t) => t.id),
      [transactionId]
    );
  });

  it("returns a transaction by id with corrections and net_total", async () => {
    const res = await request(app)
      .get(`/transactions/${transactionId}`)
      .set(cashierAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.id, transactionId);
    assert.deepEqual(res.body.corrections, []);
    assert.equal(Number(res.body.net_total), 5);

    await request(app)
      .post("/corrections")
      .set(cashierAuth)
      .send({
        transaction_id: transactionId,
        type: "REFUND",
        amount: 2,
        reason: "Customer changed their mind",
      });

    const afterCorrection = await request(app)
      .get(`/transactions/${transactionId}`)
      .set(cashierAuth);

    assert.equal(afterCorrection.body.corrections.length, 1);
    assert.equal(Number(afterCorrection.body.net_total), 3);
  });

  it("forbids other cashiers from viewing someone else's transaction", async () => {
    const res = await request(app)
      .get(`/transactions/${transactionId}`)
      .set(otherAuth);

    assert.equal(res.status, 403);
  });

  it("allows an admin to view another cashier's transaction using the DB role", async () => {
    const dbRoleOnlyAdmin = testAuthHeaders(fixtures.adminSub, { roles: [] });
    const res = await request(app)
      .get(`/transactions/${transactionId}`)
      .set(dbRoleOnlyAdmin);

    assert.equal(res.status, 200);
    assert.equal(res.body.id, transactionId);
  });

  it("returns 404 for an unknown transaction id", async () => {
    const res = await request(app).get("/transactions/999999").set(cashierAuth);
    assert.equal(res.status, 404);
  });

  it("returns a receipt with amount tendered and change due for the owner", async () => {
    const res = await request(app)
      .get(`/transactions/${transactionId}/receipt`)
      .set(cashierAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.id, transactionId);
    assert.equal(res.body.items.length, 1);
    assert.equal(res.body.items[0].line_total, 5);
    assert.equal(Number(res.body.amount_tendered), 5);
    assert.equal(Number(res.body.change_due), 0);
  });

  it("allows an admin to view another cashier's receipt", async () => {
    const res = await request(app)
      .get(`/transactions/${transactionId}/receipt`)
      .set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.id, transactionId);
  });

  it("allows an admin to view another cashier's receipt using the DB role", async () => {
    const dbRoleOnlyAdmin = testAuthHeaders(fixtures.adminSub, { roles: [] });
    const res = await request(app)
      .get(`/transactions/${transactionId}/receipt`)
      .set(dbRoleOnlyAdmin);

    assert.equal(res.status, 200);
    assert.equal(res.body.id, transactionId);
  });

  it("returns 404 for a receipt on an unknown transaction", async () => {
    const res = await request(app)
      .get("/transactions/999999/receipt")
      .set(cashierAuth);
    assert.equal(res.status, 404);
  });

  it("forbids other cashiers from viewing someone else's receipt", async () => {
    const res = await request(app)
      .get(`/transactions/${transactionId}/receipt`)
      .set(otherAuth);

    assert.equal(res.status, 403);
  });
});
