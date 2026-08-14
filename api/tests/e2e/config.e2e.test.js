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

  it("returns happy-hour status only for authenticated staff", async () => {
    const res = await request(app)
      .get("/config/shop")
      .set(testAuthHeaders(fixtures.cashierSub));

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { happy_hour_active: false });
  });

  it("forbids cashiers from reading or updating config", async () => {
    const cashierAuth = testAuthHeaders(fixtures.cashierSub);

    const getRes = await request(app).get("/config").set(cashierAuth);
    assert.equal(getRes.status, 403);

    const putRes = await request(app)
      .put("/config")
      .set(cashierAuth)
      .send({ happy_hour_days: [1] });
    assert.equal(putRes.status, 403);
  });

  it("forbids managers from reading or updating config (admin-only)", async () => {
    const managerAuth = testAuthHeaders(fixtures.managerSub, {
      roles: ["manager"],
    });

    const getRes = await request(app).get("/config").set(managerAuth);
    assert.equal(getRes.status, 403);

    const putRes = await request(app)
      .put("/config")
      .set(managerAuth)
      .send({ happy_hour_days: [1] });
    assert.equal(putRes.status, 403);
  });

  it("allows admin to read and update happy-hour config", async () => {
    const adminAuth = testAuthHeaders(fixtures.adminSub, { roles: ["admin"] });

    const getRes = await request(app).get("/config").set(adminAuth);
    assert.equal(getRes.status, 200);
    assert.deepEqual(getRes.body, {
      happy_hour_days: [],
      happy_hour_start_time: null,
      happy_hour_end_time: null,
    });

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

  it("validates happy-hour fields", async () => {
    const adminAuth = testAuthHeaders(fixtures.adminSub, { roles: ["admin"] });

    const badDays = await request(app)
      .put("/config")
      .set(adminAuth)
      .send({ happy_hour_days: [7] });
    assert.equal(badDays.status, 400);

    const badTime = await request(app)
      .put("/config")
      .set(adminAuth)
      .send({ happy_hour_start_time: "25:00" });
    assert.equal(badTime.status, 400);

    const sameTimes = await request(app)
      .put("/config")
      .set(adminAuth)
      .send({
        happy_hour_days: [1],
        happy_hour_start_time: "10:00",
        happy_hour_end_time: "10:00",
      });
    assert.equal(sameTimes.status, 400);
  });
});
