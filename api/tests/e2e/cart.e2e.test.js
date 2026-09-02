const { before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../../app");
const pool = require("../../db");
const { setupDatabase } = require("../helpers/migrate");
const { seedTestData } = require("../helpers/seed");
const { testAuthHeaders } = require("../helpers/auth");

process.env.NODE_ENV = "test";

describe("cart checkout e2e", () => {
  let fixtures;
  let cashierAuth;

  before(async () => {
    await setupDatabase();
    fixtures = await seedTestData();
    cashierAuth = testAuthHeaders(fixtures.cashierSub);
  });

  it("rejects unauthenticated cart access", async () => {
    const res = await request(app).get("/cart");
    assert.equal(res.status, 401);
  });

  it("rejects checkout when the register is not open", async () => {
    await request(app)
      .post("/cart")
      .set(cashierAuth)
      .send({ item_id: fixtures.productId, amount: 1 });

    const res = await request(app)
      .post("/cart/checkout")
      .set(cashierAuth)
      .send({ payment_method: "CASH", amount_tendered: 5 });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /Register is not open/);

    await request(app).delete("/cart").set(cashierAuth);
  });

  it("adds items to cart and completes a cash checkout once the register is open", async () => {
    const openRes = await request(app)
      .post("/register/open")
      .set(cashierAuth)
      .send({ starting_amount: 50 });
    assert.equal(openRes.status, 201);

    const addRes = await request(app)
      .post("/cart")
      .set(cashierAuth)
      .send({ item_id: fixtures.productId, amount: 2 });

    assert.equal(addRes.status, 201);

    const cartRes = await request(app).get("/cart").set(cashierAuth);
    assert.equal(cartRes.status, 200);
    assert.equal(cartRes.body.length, 1);
    assert.equal(cartRes.body[0].amount, 2);

    const checkoutRes = await request(app)
      .post("/cart/checkout")
      .set(cashierAuth)
      .send({ payment_method: "CASH", amount_tendered: 10 });

    assert.equal(checkoutRes.status, 200);
    assert.equal(checkoutRes.body.total, 5);
    assert.equal(checkoutRes.body.change_due, 5);
    assert.ok(checkoutRes.body.transaction_id);

    const stockResult = await pool.query(
      `SELECT current_stock FROM inventory WHERE product_id = $1`,
      [fixtures.productId]
    );
    assert.equal(stockResult.rows[0].current_stock, 48);

    const emptyCart = await request(app).get("/cart").set(cashierAuth);
    assert.deepEqual(emptyCart.body, []);
  });

  it("rejects cash checkout when amount tendered is insufficient", async () => {
    await request(app)
      .post("/cart")
      .set(cashierAuth)
      .send({ item_id: fixtures.productId, amount: 1 });

    const checkoutRes = await request(app)
      .post("/cart/checkout")
      .set(cashierAuth)
      .send({ payment_method: "CASH", amount_tendered: 1 });

    assert.equal(checkoutRes.status, 400);
    assert.match(checkoutRes.body.error, /less than the total due/);

    await request(app).delete("/cart").set(cashierAuth);
  });

  it("rejects checkout with a disabled payment method", async () => {
    await request(app)
      .post("/cart")
      .set(cashierAuth)
      .send({ item_id: fixtures.productId, amount: 1 });

    const checkoutRes = await request(app)
      .post("/cart/checkout")
      .set(cashierAuth)
      .send({ payment_method: "STRIPE", payment_reference: "ch_123" });

    assert.equal(checkoutRes.status, 400);
    assert.match(checkoutRes.body.error, /not enabled/);

    await request(app).delete("/cart").set(cashierAuth);
  });

  it("rejects unauthenticated Wero payment creation", async () => {
    const res = await request(app).post("/payments/wero");
    assert.equal(res.status, 401);
  });

  it("rejects creating a Wero payment when the method is not enabled", async () => {
    await request(app)
      .post("/cart")
      .set(cashierAuth)
      .send({ item_id: fixtures.productId, amount: 1 });

    const res = await request(app).post("/payments/wero").set(cashierAuth);
    assert.equal(res.status, 400);
    assert.match(res.body.error, /not enabled/);

    await request(app).delete("/cart").set(cashierAuth);
  });

  it("rejects a Wero checkout without a Payconiq payment id", async () => {
    const adminAuth = testAuthHeaders(fixtures.adminSub, { roles: ["admin"] });
    const enableRes = await request(app)
      .put("/payment-methods/wero")
      .set(adminAuth)
      .send({
        enabled: true,
        config: { api_key: "wero_test_secret", environment: "sandbox" },
      });
    assert.equal(enableRes.status, 200);

    await request(app)
      .post("/cart")
      .set(cashierAuth)
      .send({ item_id: fixtures.productId, amount: 1 });

    const checkoutRes = await request(app)
      .post("/cart/checkout")
      .set(cashierAuth)
      .send({ payment_method: "WERO" });

    assert.equal(checkoutRes.status, 400);
    assert.match(checkoutRes.body.error, /Wero payment reference is required/);

    await request(app).delete("/cart").set(cashierAuth);
  });

  it("rejects unauthenticated SumUp checkout creation", async () => {
    const res = await request(app).post("/payments/sumup");
    assert.equal(res.status, 401);
  });

  it("rejects a SumUp checkout without a terminal payment id", async () => {
    const adminAuth = testAuthHeaders(fixtures.adminSub, { roles: ["admin"] });
    const enableRes = await request(app)
      .put("/payment-methods/sumup")
      .set(adminAuth)
      .send({
        enabled: true,
        config: { api_key: "sup_sk_test", merchant_code: "MK10CL2A" },
      });
    assert.equal(enableRes.status, 200);

    await request(app)
      .post("/cart")
      .set(cashierAuth)
      .send({ item_id: fixtures.productId, amount: 1 });

    const checkoutRes = await request(app)
      .post("/cart/checkout")
      .set(cashierAuth)
      .send({ payment_method: "SUMUP" });

    assert.equal(checkoutRes.status, 400);
    assert.match(checkoutRes.body.error, /SumUp payment reference is required/);

    await request(app).delete("/cart").set(cashierAuth);
  });

  it("rejects checkout with an empty cart", async () => {
    const checkoutRes = await request(app)
      .post("/cart/checkout")
      .set(cashierAuth)
      .send({ payment_method: "CASH", amount_tendered: 10 });

    assert.equal(checkoutRes.status, 400);
    assert.match(checkoutRes.body.error, /Cart is empty/);
  });
});
