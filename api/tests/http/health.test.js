const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

describe("health endpoints", () => {
  it("GET /health returns ok without DB", async () => {
    process.env.NODE_ENV = "development";
    delete require.cache[require.resolve("../../app")];
    const app = require("../../app");

    const res = await request(app).get("/health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: "ok" });
  });
});
