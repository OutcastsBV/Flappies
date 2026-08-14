const { before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../../app");
const { setupDatabase } = require("../helpers/migrate");
const { seedTestData } = require("../helpers/seed");
const { testAuthHeaders } = require("../helpers/auth");

process.env.NODE_ENV = "test";

describe("report e2e", () => {
  let fixtures;
  let adminAuth;

  before(async () => {
    await setupDatabase();
    fixtures = await seedTestData();
    adminAuth = testAuthHeaders(fixtures.adminSub, { roles: ["admin"] });

    // Generate one real cash transaction (2x Cola @ 2.5) to report on, plus a
    // correction against it so net_revenue/total_corrections are exercised.
    const cashierAuth = testAuthHeaders(fixtures.cashierSub);
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

    await request(app)
      .post("/corrections")
      .set(cashierAuth)
      .send({
        transaction_id: checkoutRes.body.transaction_id,
        type: "PRICE_ADJUSTMENT",
        amount: 1,
        reason: "Bad price entered",
      });
  });

  it("rejects unauthenticated access to sales summary", async () => {
    const res = await request(app).get("/reports/sales");
    assert.equal(res.status, 401);
  });

  it("forbids non-admin users", async () => {
    const res = await request(app)
      .get("/reports/sales")
      .set(testAuthHeaders(fixtures.cashierSub));

    assert.equal(res.status, 403);
  });

  it("returns the sales summary with cash/other revenue and corrections", async () => {
    const res = await request(app).get("/reports/sales").set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.transaction_count, 1);
    assert.equal(Number(res.body.total_revenue), 5);
    assert.equal(Number(res.body.cash_revenue), 5);
    assert.equal(Number(res.body.other_revenue), 0);
    assert.equal(Number(res.body.total_corrections), 1);
    assert.equal(Number(res.body.net_revenue), 4);
  });

  it("returns sales grouped by product", async () => {
    const res = await request(app)
      .get("/reports/sales/by-product")
      .set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].name, "Cola");
    assert.equal(res.body[0].units_sold, 2);
    assert.equal(Number(res.body[0].revenue), 5);
  });

  it("returns sales grouped by day", async () => {
    const res = await request(app)
      .get("/reports/sales/by-day")
      .set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(Number(res.body[0].revenue), 5);
  });

  it("returns a profit and loss breakdown", async () => {
    const res = await request(app).get("/reports/pnl").set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.products.length, 1);
    assert.equal(Number(res.body.totals.revenue), 5);
    assert.equal(Number(res.body.totals.cost), 2);
    assert.equal(Number(res.body.totals.profit), 3);
  });

  it("supports narrowing reports with a from/to date range", async () => {
    const farFuture = "2099-01-01";
    const res = await request(app)
      .get(`/reports/sales?from=${farFuture}`)
      .set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.transaction_count, 0);
  });

  it("returns sales grouped by payment method", async () => {
    // Enable Stripe ("record only" — no live API call) and ring up a second
    // transaction with it, so the breakdown covers more than just cash.
    const cashierAuth = testAuthHeaders(fixtures.cashierSub);
    await request(app)
      .put("/payment-methods/stripe")
      .set(adminAuth)
      .send({
        enabled: true,
        config: { secret_key: "sk_test_123", publishable_key: "pk_test_123" },
      });

    await request(app)
      .post("/cart")
      .set(cashierAuth)
      .send({ item_id: fixtures.productId, amount: 1 });

    const stripeCheckout = await request(app)
      .post("/cart/checkout")
      .set(cashierAuth)
      .send({ payment_method: "STRIPE", payment_reference: "ch_test_456" });
    assert.equal(stripeCheckout.status, 200);

    const res = await request(app)
      .get("/reports/sales/by-payment-method")
      .set(adminAuth);

    assert.equal(res.status, 200);
    const byMethod = Object.fromEntries(
      res.body.map((row) => [row.payment_method, row])
    );

    assert.equal(byMethod.CASH.transaction_count, 1);
    assert.equal(Number(byMethod.CASH.revenue), 5);
    assert.equal(byMethod.STRIPE.transaction_count, 1);
    assert.equal(Number(byMethod.STRIPE.revenue), 2.5);
  });

  it("rejects non-admins from viewing the payment-method breakdown", async () => {
    const res = await request(app)
      .get("/reports/sales/by-payment-method")
      .set(testAuthHeaders(fixtures.cashierSub));

    assert.equal(res.status, 403);
  });
});
