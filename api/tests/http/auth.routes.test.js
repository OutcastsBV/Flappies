const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");

describe("auth HTTP routes", () => {
  let app;

  before(() => {
    process.env.NODE_ENV = "development";
    process.env.ZITADEL_CLIENT_SECRET = "test-secret";

    // Fresh require so auth routes pick up test env
    delete require.cache[require.resolve("../../config/env")];
    delete require.cache[require.resolve("../../config/auth")];
    delete require.cache[require.resolve("../../routes/auth.routes")];

    const authRoutes = require("../../routes/auth.routes");
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(authRoutes);
  });

  it("POST /auth/callback rejects missing code", async () => {
    const res = await request(app).post("/auth/callback").send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Missing authorization code");
  });

  it("POST /auth/logout clears the session cookie", async () => {
    const res = await request(app).post("/auth/logout");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    const setCookie = res.headers["set-cookie"] || [];
    assert.match(setCookie.join(";"), /flappies_access_token=/);
  });

  it("POST /auth/login rejects missing credentials", async () => {
    const res = await request(app).post("/auth/login").send({});
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Username and password/i);
  });
});
