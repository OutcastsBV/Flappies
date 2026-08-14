const { before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../../app");
const { setupDatabase } = require("../helpers/migrate");
const { seedTestData } = require("../helpers/seed");
const { testAuthHeaders } = require("../helpers/auth");

process.env.NODE_ENV = "test";

describe("inventory e2e", () => {
  let fixtures;

  before(async () => {
    await setupDatabase();
    fixtures = await seedTestData();
  });

  it("lists in-stock products for members", async () => {
    const res = await request(app)
      .get("/inventory")
      .set(testAuthHeaders(fixtures.userSub));

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].name, "Cola");
  });

  it("lists all inventory for admins", async () => {
    const res = await request(app)
      .get("/inventory/admin")
      .set(testAuthHeaders(fixtures.adminSub, { roles: ["admin"] }));

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
  });
});
