const { before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../../app");
const pool = require("../../db");
const { setupDatabase } = require("../helpers/migrate");
const { seedTestData } = require("../helpers/seed");
const { testAuthHeaders } = require("../helpers/auth");

process.env.NODE_ENV = "test";

describe("payment methods e2e", () => {
  let fixtures;
  let cashierAuth;
  let managerAuth;
  let adminAuth;

  before(async () => {
    await setupDatabase();
    fixtures = await seedTestData();
    cashierAuth = testAuthHeaders(fixtures.cashierSub);
    managerAuth = testAuthHeaders(fixtures.managerSub, { roles: ["manager"] });
    adminAuth = testAuthHeaders(fixtures.adminSub, { roles: ["admin"] });
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/payment-methods");
    assert.equal(res.status, 401);
  });

  it("lists only the enabled methods for staff at checkout (cash by default)", async () => {
    const res = await request(app).get("/payment-methods").set(cashierAuth);

    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.map((m) => m.method_key),
      ["CASH"]
    );
  });

  it("forbids non-admins from viewing the full admin config", async () => {
    const cashierRes = await request(app)
      .get("/payment-methods/admin")
      .set(cashierAuth);
    assert.equal(cashierRes.status, 403);

    const managerRes = await request(app)
      .get("/payment-methods/admin")
      .set(managerAuth);
    assert.equal(managerRes.status, 403);
  });

  it("shows every method with field metadata (no secret values) to admins", async () => {
    const res = await request(app).get("/payment-methods/admin").set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 4);

    const stripe = res.body.find((m) => m.method_key === "STRIPE");
    assert.equal(stripe.enabled, false);
    const secretField = stripe.fields.find((f) => f.key === "secret_key");
    assert.equal(secretField.secret, true);
    assert.equal(secretField.has_value, false);

    const wero = res.body.find((m) => m.method_key === "WERO");
    assert.equal(wero.label, "Wero");
    assert.equal(wero.enabled, false);
    const weroSecret = wero.fields.find((f) => f.key === "api_key");
    assert.equal(weroSecret.secret, true);
    assert.equal(
      wero.fields.some((f) => f.key === "payment_profile_id"),
      true
    );
    const environment = wero.fields.find((f) => f.key === "environment");
    assert.deepEqual(environment.options, ["sandbox", "production"]);
  });

  it("forbids non-admins from updating payment methods", async () => {
    const res = await request(app)
      .put("/payment-methods/stripe")
      .set(managerAuth)
      .send({ enabled: true });

    assert.equal(res.status, 403);
  });

  it("validates the request body", async () => {
    const badEnabled = await request(app)
      .put("/payment-methods/cash")
      .set(adminAuth)
      .send({ enabled: "yes" });
    assert.equal(badEnabled.status, 400);

    const badConfig = await request(app)
      .put("/payment-methods/cash")
      .set(adminAuth)
      .send({ config: "not-an-object" });
    assert.equal(badConfig.status, 400);
  });

  it("returns 404 for an unknown payment method", async () => {
    const res = await request(app)
      .put("/payment-methods/paypal")
      .set(adminAuth)
      .send({ enabled: true });

    assert.equal(res.status, 404);
  });

  it("rejects enabling Stripe without its required secret key", async () => {
    const res = await request(app)
      .put("/payment-methods/stripe")
      .set(adminAuth)
      .send({ enabled: true });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /missing required configuration/);
  });

  it("rejects enabling Wero without its API key", async () => {
    const res = await request(app)
      .put("/payment-methods/wero")
      .set(adminAuth)
      .send({ enabled: true });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /missing required configuration/);
  });

  it("rejects enabling SumUp without its merchant code", async () => {
    const res = await request(app)
      .put("/payment-methods/sumup")
      .set(adminAuth)
      .send({ enabled: true, config: { api_key: "sup_sk_test" } });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /missing required configuration/);
  });

  it("allows an admin to configure and enable Stripe, encrypting the secret key at rest", async () => {
    const res = await request(app)
      .put("/payment-methods/stripe")
      .set(adminAuth)
      .send({
        enabled: true,
        config: { secret_key: "sk_test_123", publishable_key: "pk_test_123" },
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, true);
    const secretField = res.body.fields.find((f) => f.key === "secret_key");
    assert.equal(secretField.has_value, true);

    const dbRow = await pool.query(
      `SELECT config FROM payment_method_config WHERE method_key = 'STRIPE'`
    );
    assert.notEqual(dbRow.rows[0].config.secret_key, "sk_test_123");

    const enabledList = await request(app)
      .get("/payment-methods")
      .set(cashierAuth);
    assert.deepEqual(
      enabledList.body.map((m) => m.method_key).sort(),
      ["CASH", "STRIPE"]
    );
  });

  it("allows an admin to configure Wero keys without exposing the secret", async () => {
    const res = await request(app)
      .put("/payment-methods/wero")
      .set(adminAuth)
      .send({
        config: {
          api_key: "wero_test_secret",
          payment_profile_id: "profile-1",
          environment: "sandbox",
        },
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, false);
    const secretField = res.body.fields.find((f) => f.key === "api_key");
    assert.equal(secretField.has_value, true);

    const dbRow = await pool.query(
      `SELECT config FROM payment_method_config WHERE method_key = 'WERO'`
    );
    assert.notEqual(dbRow.rows[0].config.api_key, "wero_test_secret");
    assert.equal(dbRow.rows[0].config.environment, "sandbox");
  });

  it("rejects an invalid Wero environment", async () => {
    const res = await request(app)
      .put("/payment-methods/wero")
      .set(adminAuth)
      .send({ config: { environment: "prod" } });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /sandbox, production/);
  });

  it("allows an admin to disable a method", async () => {
    const res = await request(app)
      .put("/payment-methods/cash")
      .set(adminAuth)
      .send({ enabled: false });

    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, false);

    const enabledList = await request(app)
      .get("/payment-methods")
      .set(cashierAuth);
    assert.deepEqual(
      enabledList.body.map((m) => m.method_key),
      ["STRIPE"]
    );
  });

  it("hides host-disabled methods from Config and checkout", async () => {
    const previous = process.env.PAYMENT_STRIPE_AVAILABLE;
    process.env.PAYMENT_STRIPE_AVAILABLE = "false";
    try {
      const adminRes = await request(app)
        .get("/payment-methods/admin")
        .set(adminAuth);
      assert.equal(adminRes.status, 200);
      assert.equal(
        adminRes.body.some((m) => m.method_key === "STRIPE"),
        false
      );

      const staffRes = await request(app)
        .get("/payment-methods")
        .set(cashierAuth);
      assert.equal(
        staffRes.body.some((m) => m.method_key === "STRIPE"),
        false
      );

      const putRes = await request(app)
        .put("/payment-methods/stripe")
        .set(adminAuth)
        .send({ enabled: true });
      assert.equal(putRes.status, 404);
    } finally {
      if (previous === undefined) delete process.env.PAYMENT_STRIPE_AVAILABLE;
      else process.env.PAYMENT_STRIPE_AVAILABLE = previous;
    }
  });
});
