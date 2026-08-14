const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");
const { storeRfidCode } = require("../../lib/rfidCodes");

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

  it("POST /auth/rfid-exchange rejects missing code", async () => {
    const res = await request(app).post("/auth/rfid-exchange").send({});
    assert.equal(res.status, 400);
  });

  it("POST /auth/rfid-exchange rejects invalid code", async () => {
    const res = await request(app)
      .post("/auth/rfid-exchange")
      .send({ code: "invalid" });
    assert.equal(res.status, 401);
  });

  it("POST /auth/rfid-exchange sets cookie for a valid one-time code", async () => {
    const code = storeRfidCode("access-from-rfid", 600);
    const res = await request(app)
      .post("/auth/rfid-exchange")
      .send({ code });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    const setCookie = res.headers["set-cookie"];
    assert.ok(setCookie);
    assert.match(setCookie.join(";"), /kassa_access_token=/);
    assert.match(setCookie.join(";"), /HttpOnly/i);
  });

  it("POST /auth/logout clears the session cookie", async () => {
    const res = await request(app).post("/auth/logout");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    const setCookie = res.headers["set-cookie"] || [];
    assert.match(setCookie.join(";"), /kassa_access_token=/);
  });

  it("POST /auth/login rejects missing credentials", async () => {
    const res = await request(app).post("/auth/login").send({});
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Username and password/i);
  });
});
