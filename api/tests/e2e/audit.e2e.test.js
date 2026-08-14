const { before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../../app");
const pool = require("../../db");
const { setupDatabase } = require("../helpers/migrate");
const { seedTestData } = require("../helpers/seed");
const { testAuthHeaders } = require("../helpers/auth");

process.env.NODE_ENV = "test";

describe("audit e2e", () => {
  let fixtures;
  let cashierAuth;
  let managerAuth;
  let adminAuth;
  let registerSessionId;
  let correctionId;

  before(async () => {
    await setupDatabase();
    fixtures = await seedTestData();
    cashierAuth = testAuthHeaders(fixtures.cashierSub);
    managerAuth = testAuthHeaders(fixtures.managerSub, { roles: ["manager"] });
    adminAuth = testAuthHeaders(fixtures.adminSub, { roles: ["admin"] });

    // Generate a handful of auditable actions without needing a live ZITADEL:
    // register open/close, a config change, and a correction.
    const openRes = await request(app)
      .post("/register/open")
      .set(cashierAuth)
      .send({ starting_amount: 20 });
    registerSessionId = openRes.body.id;

    await request(app)
      .post("/cart")
      .set(cashierAuth)
      .send({ item_id: fixtures.productId, amount: 2 });
    const checkoutRes = await request(app)
      .post("/cart/checkout")
      .set(cashierAuth)
      .send({ payment_method: "CASH", amount_tendered: 5 });

    const correctionRes = await request(app)
      .post("/corrections")
      .set(cashierAuth)
      .send({
        transaction_id: checkoutRes.body.transaction_id,
        type: "REFUND",
        amount: 1,
        reason: "Customer complaint",
      });
    correctionId = correctionRes.body.id;

    await request(app)
      .put("/config")
      .set(adminAuth)
      .send({ happy_hour_days: [1, 2], happy_hour_start_time: "16:00", happy_hour_end_time: "18:00" });

    await request(app)
      .put("/payment-methods/stripe")
      .set(adminAuth)
      .send({ enabled: true, config: { secret_key: "sk_test_123", publishable_key: "pk_test_123" } });

    // Deactivating the cashier happens *after* their register is closed —
    // requireUser only resolves active users, so a deactivated cashier
    // couldn't make any further authenticated requests themselves.
    await request(app)
      .post("/register/close")
      .set(cashierAuth)
      .send({ counted_cash_amount: 25 });

    await request(app)
      .put(`/users/${fixtures.cashierId}`)
      .set(adminAuth)
      .send({ is_active: false });
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/audit");
    assert.equal(res.status, 401);
  });

  it("forbids cashiers from viewing the audit log", async () => {
    const res = await request(app).get("/audit").set(cashierAuth);
    assert.equal(res.status, 403);
  });

  it("allows admins and managers to view the audit log", async () => {
    const adminRes = await request(app).get("/audit").set(adminAuth);
    assert.equal(adminRes.status, 200);
    assert.ok(adminRes.body.length >= 6);

    const managerRes = await request(app).get("/audit").set(managerAuth);
    assert.equal(managerRes.status, 200);
    assert.deepEqual(
      managerRes.body.map((e) => e.id).sort(),
      adminRes.body.map((e) => e.id).sort()
    );
  });

  it("records register.open and register.close with the acting user", async () => {
    const res = await request(app)
      .get("/audit?action=register.open")
      .set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].actor_username, "testcashier");
    assert.equal(res.body[0].entity_type, "register_session");
    assert.equal(String(res.body[0].entity_id), String(registerSessionId));
    assert.equal(res.body[0].details.starting_amount, 20);

    const closeRes = await request(app)
      .get("/audit?action=register.close")
      .set(adminAuth);
    assert.equal(closeRes.status, 200);
    assert.equal(closeRes.body.length, 1);
    assert.equal(closeRes.body[0].details.counted_cash_amount, 25);
  });

  it("records correction.create with the correction details", async () => {
    const res = await request(app)
      .get("/audit?action=correction.create")
      .set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(String(res.body[0].entity_id), String(correctionId));
    assert.equal(res.body[0].details.type, "REFUND");
    assert.equal(res.body[0].actor_username, "testcashier");
  });

  it("records config.update with the new configuration", async () => {
    const res = await request(app)
      .get("/audit?action=config.update")
      .set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].actor_username, "testadmin");
    assert.deepEqual(res.body[0].details.happy_hour_days, [1, 2]);
  });

  it("records payment_method.update without ever storing the secret value", async () => {
    const res = await request(app)
      .get("/audit?action=payment_method.update")
      .set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].entity_type, "payment_method");
    assert.equal(res.body[0].entity_id, "STRIPE");
    assert.equal(res.body[0].details.enabled, true);
    assert.deepEqual(res.body[0].details.config_fields_changed.sort(), [
      "publishable_key",
      "secret_key",
    ]);
    const serialized = JSON.stringify(res.body[0].details);
    assert.ok(!serialized.includes("sk_test_123"));
  });

  it("records user.update for a role/status change", async () => {
    const res = await request(app)
      .get("/audit?action=user.update")
      .set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].entity_type, "user");
    assert.equal(String(res.body[0].entity_id), String(fixtures.cashierId));
    assert.equal(res.body[0].details.is_active, false);
  });

  it("filters by entity_type", async () => {
    const res = await request(app)
      .get("/audit?entity_type=register_session")
      .set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
    assert.ok(res.body.every((e) => e.entity_type === "register_session"));
  });

  it("fetches a single audit entry by id and 404s for an unknown one", async () => {
    const list = await request(app).get("/audit").set(adminAuth);
    const entryId = list.body[0].id;

    const res = await request(app).get(`/audit/${entryId}`).set(adminAuth);
    assert.equal(res.status, 200);
    assert.equal(res.body.id, entryId);

    const missing = await request(app).get("/audit/999999").set(adminAuth);
    assert.equal(missing.status, 404);
  });

  it("does not expose any write endpoints (read-only)", async () => {
    const postRes = await request(app).post("/audit").set(adminAuth).send({});
    assert.equal(postRes.status, 404);

    const putRes = await request(app).put("/audit/1").set(adminAuth).send({});
    assert.equal(putRes.status, 404);

    const deleteRes = await request(app).delete("/audit/1").set(adminAuth);
    assert.equal(deleteRes.status, 404);
  });

  it("rejects UPDATE/DELETE on audit_log at the database level", async () => {
    const { rows } = await pool.query(`SELECT id FROM audit_log LIMIT 1`);
    const id = rows[0].id;

    await assert.rejects(
      pool.query(`UPDATE audit_log SET action = 'tampered' WHERE id = $1`, [id]),
      /audit_log rows are immutable/
    );

    await assert.rejects(
      pool.query(`DELETE FROM audit_log WHERE id = $1`, [id]),
      /audit_log rows are immutable/
    );
  });
});
