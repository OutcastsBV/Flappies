const { before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../../app");
const { setupDatabase } = require("../helpers/migrate");
const { seedTestData } = require("../helpers/seed");
const { testAuthHeaders } = require("../helpers/auth");

process.env.NODE_ENV = "test";
// No live mail server in e2e; this exercises the "SMTP not configured" path,
// success/failure-once-configured is covered by the mocked unit test.
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASSWORD;

describe("support e2e", () => {
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
    const res = await request(app)
      .post("/support")
      .send({ subject: "Help", message: "Something is broken" });
    assert.equal(res.status, 401);
  });

  it("forbids cashiers from submitting a support request", async () => {
    const res = await request(app)
      .post("/support")
      .set(cashierAuth)
      .send({ subject: "Help", message: "Something is broken" });
    assert.equal(res.status, 403);
  });

  it("allows managers and admins through the role check", async () => {
    const managerRes = await request(app)
      .post("/support")
      .set(managerAuth)
      .send({ subject: "Help", message: "Something is broken" });
    assert.notEqual(managerRes.status, 403);

    const adminRes = await request(app)
      .post("/support")
      .set(adminAuth)
      .send({ subject: "Help", message: "Something is broken" });
    assert.notEqual(adminRes.status, 403);
  });

  it("requires a non-empty subject", async () => {
    const missing = await request(app)
      .post("/support")
      .set(adminAuth)
      .send({ message: "Something is broken" });
    assert.equal(missing.status, 400);
    assert.match(missing.body.error, /subject is required/);

    const blank = await request(app)
      .post("/support")
      .set(adminAuth)
      .send({ subject: "   ", message: "Something is broken" });
    assert.equal(blank.status, 400);
  });

  it("rejects an overly long subject", async () => {
    const res = await request(app)
      .post("/support")
      .set(adminAuth)
      .send({ subject: "x".repeat(201), message: "Something is broken" });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /too long/);
  });

  it("requires a non-empty message", async () => {
    const missing = await request(app)
      .post("/support")
      .set(adminAuth)
      .send({ subject: "Help" });
    assert.equal(missing.status, 400);
    assert.match(missing.body.error, /message is required/);
  });

  it("rejects an overly long message", async () => {
    const res = await request(app)
      .post("/support")
      .set(adminAuth)
      .send({ subject: "Help", message: "x".repeat(5001) });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /too long/);
  });

  it("rejects an invalid category", async () => {
    const res = await request(app)
      .post("/support")
      .set(adminAuth)
      .send({ subject: "Help", message: "Something is broken", category: "URGENT" });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /category must be one of/);
  });

  it("defaults category to OTHER when omitted", async () => {
    const res = await request(app)
      .post("/support")
      .set(adminAuth)
      .send({ subject: "Help", message: "Something is broken" });
    // No default category rejection; falls through to the SMTP-not-configured path.
    assert.notEqual(res.status, 400);
  });

  it("fails gracefully with a 503 and a generic message when SMTP isn't configured", async () => {
    const res = await request(app)
      .post("/support")
      .set(adminAuth)
      .send({ subject: "Help", message: "Something is broken", category: "BUG" });

    assert.equal(res.status, 503);
    assert.match(res.body.error, /not configured/);
    // Never leak internal error details to the client.
    assert.doesNotMatch(JSON.stringify(res.body), /nodemailer|ECONNREFUSED/);
  });
});
