const { before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../../app");
const { setupDatabase } = require("../helpers/migrate");
const { seedTestData } = require("../helpers/seed");
const { testAuthHeaders } = require("../helpers/auth");

process.env.NODE_ENV = "test";

describe("register e2e", () => {
  let fixtures;
  let cashierAuth;
  let adminAuth;

  before(async () => {
    await setupDatabase();
    fixtures = await seedTestData();
    cashierAuth = testAuthHeaders(fixtures.cashierSub);
    adminAuth = testAuthHeaders(fixtures.adminSub, { roles: ["admin"] });
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/register/current");
    assert.equal(res.status, 401);
  });

  it("returns null when no register is open", async () => {
    const res = await request(app).get("/register/current").set(cashierAuth);
    assert.equal(res.status, 200);
    assert.equal(res.body, null);
  });

  it("validates starting_amount when opening a register", async () => {
    const missing = await request(app)
      .post("/register/open")
      .set(cashierAuth)
      .send({});
    assert.equal(missing.status, 400);

    const negative = await request(app)
      .post("/register/open")
      .set(cashierAuth)
      .send({ starting_amount: -5 });
    assert.equal(negative.status, 400);
  });

  it("opens a register with a starting float", async () => {
    const res = await request(app)
      .post("/register/open")
      .set(cashierAuth)
      .send({ starting_amount: 50 });

    assert.equal(res.status, 201);
    assert.equal(Number(res.body.starting_amount), 50);
    assert.equal(res.body.status, "open");
  });

  it("rejects opening a second register for the same cashier", async () => {
    const res = await request(app)
      .post("/register/open")
      .set(cashierAuth)
      .send({ starting_amount: 20 });

    assert.equal(res.status, 409);
    assert.match(res.body.error, /already open/);
  });

  it("reflects cash sales in the live register summary", async () => {
    await request(app)
      .post("/cart")
      .set(cashierAuth)
      .send({ item_id: fixtures.productId, amount: 2 });
    await request(app)
      .post("/cart/checkout")
      .set(cashierAuth)
      .send({ payment_method: "CASH", amount_tendered: 10 });

    const res = await request(app).get("/register/current").set(cashierAuth);

    assert.equal(res.status, 200);
    assert.equal(Number(res.body.summary.cash_sales), 5);
    assert.equal(Number(res.body.summary.starting_amount), 50);
    assert.equal(Number(res.body.summary.expected_cash), 55);
    assert.equal(res.body.summary.transaction_count, 1);
  });

  it("validates counted_cash_amount when closing a register", async () => {
    const res = await request(app)
      .post("/register/close")
      .set(cashierAuth)
      .send({});
    assert.equal(res.status, 400);
  });

  it("closes the register and reports variance", async () => {
    const res = await request(app)
      .post("/register/close")
      .set(cashierAuth)
      .send({ counted_cash_amount: 54, notes: "Counted 1 short" });

    assert.equal(res.status, 200);
    assert.equal(res.body.session.status, "closed");
    assert.equal(Number(res.body.summary.expected_cash), 55);
    assert.equal(Number(res.body.summary.counted_cash), 54);
    assert.equal(Number(res.body.summary.variance), -1);
  });

  it("rejects closing when there is no open register", async () => {
    const res = await request(app)
      .post("/register/close")
      .set(cashierAuth)
      .send({ counted_cash_amount: 0 });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /No open register session/);
  });

  it("forbids cashiers from listing all register sessions", async () => {
    const res = await request(app).get("/register/sessions").set(cashierAuth);
    assert.equal(res.status, 403);
  });

  it("allows admins to list all register sessions", async () => {
    const res = await request(app).get("/register/sessions").set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].status, "closed");
    assert.equal(res.body[0].opened_by_username, "testcashier");
  });
});
