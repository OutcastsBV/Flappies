const { before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../../app");
const { setupDatabase } = require("../helpers/migrate");
const { seedTestData } = require("../helpers/seed");
const { testAuthHeaders } = require("../helpers/auth");

process.env.NODE_ENV = "test";

describe("health e2e", () => {
  before(async () => {
    await setupDatabase();
    await seedTestData();
  });

  it("GET /health returns ok", async () => {
    const res = await request(app).get("/health");

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: "ok" });
  });
});
