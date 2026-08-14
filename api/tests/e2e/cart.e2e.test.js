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

  before(async () => {
    await setupDatabase();
    fixtures = await seedTestData();
  });

  it("rejects unauthenticated cart access", async () => {
    const res = await request(app).get("/cart");
    assert.equal(res.status, 401);
  });

  it("adds items to cart and completes checkout", async () => {
    const auth = testAuthHeaders(fixtures.userSub);

    const addRes = await request(app)
      .post("/cart")
      .set(auth)
      .send({ item_id: fixtures.productId, amount: 2 });

    assert.equal(addRes.status, 201);

    const cartRes = await request(app).get("/cart").set(auth);
    assert.equal(cartRes.status, 200);
    assert.equal(cartRes.body.length, 1);
    assert.equal(cartRes.body[0].amount, 2);

    const checkoutRes = await request(app)
      .post("/cart/checkout")
      .set(auth)
      .send({ payment_method: "WALLET" });

    assert.equal(checkoutRes.status, 200);
    assert.equal(checkoutRes.body.total, 5);
    assert.ok(checkoutRes.body.transaction_id);

    const balanceResult = await pool.query(
      `SELECT balance FROM "user" WHERE id = $1`,
      [fixtures.userId]
    );
    assert.equal(Number(balanceResult.rows[0].balance), 95);

    const stockResult = await pool.query(
      `SELECT current_stock FROM inventory WHERE product_id = $1`,
      [fixtures.productId]
    );
    assert.equal(stockResult.rows[0].current_stock, 48);

    const emptyCart = await request(app).get("/cart").set(auth);
    assert.deepEqual(emptyCart.body, []);
  });

  it("rejects checkout with insufficient balance", async () => {
    await pool.query(`UPDATE "user" SET balance = 0 WHERE id = $1`, [
      fixtures.userId,
    ]);

    const auth = testAuthHeaders(fixtures.userSub);

    await request(app)
      .post("/cart")
      .set(auth)
      .send({ item_id: fixtures.productId, amount: 1 });

    const checkoutRes = await request(app)
      .post("/cart/checkout")
      .set(auth)
      .send({ payment_method: "WALLET" });

    assert.equal(checkoutRes.status, 400);
    assert.match(checkoutRes.body.error, /Insufficient balance/);
  });
});
