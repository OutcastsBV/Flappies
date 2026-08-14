const { before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../../app");
const { setupDatabase } = require("../helpers/migrate");
const { seedTestData } = require("../helpers/seed");
const { testAuthHeaders } = require("../helpers/auth");

process.env.NODE_ENV = "test";

describe("config e2e", () => {
  let fixtures;

  before(async () => {
    await setupDatabase();
    fixtures = await seedTestData();
  });

  it("returns shop info for authenticated users", async () => {
    const res = await request(app)
      .get("/config/shop")
      .set(testAuthHeaders(fixtures.userSub));

    assert.equal(res.status, 200);
    assert.equal(res.body.operation_mode, "self_service");
    assert.deepEqual(res.body.payment_methods, ["WALLET"]);
  });

  it("forbids config updates for non-admin users", async () => {
    const res = await request(app)
      .put("/config")
      .set(testAuthHeaders(fixtures.userSub))
      .send({ operation_mode: "pos" });

    assert.equal(res.status, 403);
  });

  it("allows admin to read and update config", async () => {
    const adminAuth = testAuthHeaders(fixtures.adminSub, { roles: ["admin"] });

    const getRes = await request(app).get("/config").set(adminAuth);
    assert.equal(getRes.status, 200);

    const updateRes = await request(app)
      .put("/config")
      .set(adminAuth)
      .send({
        happy_hour_days: [1, 2, 3, 4, 5],
        happy_hour_start_time: "16:00",
        happy_hour_end_time: "18:00",
      });

    assert.equal(updateRes.status, 200);
    assert.deepEqual(updateRes.body.happy_hour_days, [1, 2, 3, 4, 5]);
    assert.equal(updateRes.body.happy_hour_start_time, "16:00");
    assert.equal(updateRes.body.happy_hour_end_time, "18:00");
  });
});
