const { before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../../app");
const { setupDatabase } = require("../helpers/migrate");
const { seedTestData } = require("../helpers/seed");
const { testAuthHeaders } = require("../helpers/auth");

process.env.NODE_ENV = "test";
// createZitadelUser/setUserProjectRole fail fast with a clean error when no
// ZITADEL PAT/project id is configured, which lets the validation/permission
// paths be exercised here without a live ZITADEL instance.
delete process.env.ZITADEL_SERVICE_PAT;
delete process.env.ZITADEL_IMPERSONATOR_PAT;

describe("user e2e", () => {
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

  it("rejects unauthenticated access to /me", async () => {
    const res = await request(app).get("/users/me");
    assert.equal(res.status, 401);
  });

  it("returns the caller's own profile at /me without keycloak_id", async () => {
    const res = await request(app).get("/users/me").set(cashierAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.username, "testcashier");
    assert.equal(res.body.role, "cashier");
    assert.equal(res.body.keycloak_id, undefined);
  });

  it("forbids cashiers from listing all users", async () => {
    const res = await request(app).get("/users").set(cashierAuth);
    assert.equal(res.status, 403);
  });

  it("allows admins and managers to list all users", async () => {
    const adminRes = await request(app).get("/users").set(adminAuth);
    assert.equal(adminRes.status, 200);
    assert.equal(adminRes.body.length, 3);

    const managerRes = await request(app).get("/users").set(managerAuth);
    assert.equal(managerRes.status, 200);
    assert.equal(managerRes.body.length, 3);
  });

  it("allows admins to fetch a single user by id", async () => {
    const res = await request(app)
      .get(`/users/${fixtures.cashierId}`)
      .set(adminAuth);

    assert.equal(res.status, 200);
    assert.equal(res.body.username, "testcashier");
  });

  it("returns 404 for an unknown user id", async () => {
    const res = await request(app).get("/users/999999").set(adminAuth);
    assert.equal(res.status, 404);
  });

  it("validates required fields when creating a user", async () => {
    const res = await request(app).post("/users").set(adminAuth).send({});

    assert.equal(res.status, 400);
    assert.match(res.body.error, /Username/);
  });

  it("validates password length when creating a user", async () => {
    const res = await request(app)
      .post("/users")
      .set(adminAuth)
      .send({ username: "newbie", email: "newbie@test.com", password: "short" });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /Password/);
  });

  it("rejects an invalid role when creating a user", async () => {
    const res = await request(app)
      .post("/users")
      .set(adminAuth)
      .send({
        username: "newbie",
        email: "newbie@test.com",
        password: "longenough",
        role: "superuser",
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /Invalid role/);
  });

  it("forbids managers from creating manager or admin accounts", async () => {
    const managerRole = await request(app)
      .post("/users")
      .set(managerAuth)
      .send({
        username: "newmanager",
        email: "newmanager@test.com",
        password: "longenough",
        role: "manager",
      });
    assert.equal(managerRole.status, 403);

    const adminRole = await request(app)
      .post("/users")
      .set(managerAuth)
      .send({
        username: "newadmin",
        email: "newadmin@test.com",
        password: "longenough",
        role: "admin",
      });
    assert.equal(adminRole.status, 403);
  });

  it("fails cleanly when ZITADEL is not configured (manager creating a cashier)", async () => {
    const res = await request(app)
      .post("/users")
      .set(managerAuth)
      .send({
        username: "newcashier",
        email: "newcashier@test.com",
        password: "longenough",
        role: "cashier",
      });

    assert.equal(res.status, 500);
    assert.equal(res.body.error, "Failed to create user");
  });

  it("fails cleanly when ZITADEL is not configured (admin creating any role)", async () => {
    const res = await request(app)
      .post("/users")
      .set(adminAuth)
      .send({
        username: "newbie",
        email: "newbie@test.com",
        password: "longenough",
      });

    assert.equal(res.status, 500);
    assert.equal(res.body.error, "Failed to create user");
  });

  it("forbids cashiers from creating users", async () => {
    const res = await request(app)
      .post("/users")
      .set(cashierAuth)
      .send({
        username: "newbie",
        email: "newbie@test.com",
        password: "longenough",
      });

    assert.equal(res.status, 403);
  });

  it("validates role and is_active on update", async () => {
    const badRole = await request(app)
      .put(`/users/${fixtures.cashierId}`)
      .set(adminAuth)
      .send({ role: "superuser" });
    assert.equal(badRole.status, 400);

    const badActive = await request(app)
      .put(`/users/${fixtures.cashierId}`)
      .set(adminAuth)
      .send({ is_active: "yes" });
    assert.equal(badActive.status, 400);
  });

  it("returns 404 when updating an unknown user", async () => {
    const res = await request(app)
      .put("/users/999999")
      .set(adminAuth)
      .send({ username: "ghost" });

    assert.equal(res.status, 404);
  });

  it("forbids managers from editing manager or admin accounts", async () => {
    const res = await request(app)
      .put(`/users/${fixtures.adminId}`)
      .set(managerAuth)
      .send({ username: "renamed-admin" });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /cannot edit manager or admin/i);
  });

  it("forbids managers from promoting a cashier above cashier", async () => {
    const res = await request(app)
      .put(`/users/${fixtures.cashierId}`)
      .set(managerAuth)
      .send({ role: "manager" });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /only assign the cashier role/i);
  });

  it("allows managers to update a cashier's basic info without changing role", async () => {
    const res = await request(app)
      .put(`/users/${fixtures.cashierId}`)
      .set(managerAuth)
      .send({ username: "renamed-cashier" });

    assert.equal(res.status, 200);
    assert.equal(res.body.username, "renamed-cashier");
    assert.equal(res.body.role, "cashier");
  });

  it("fails cleanly when changing a user's role since ZITADEL is not configured", async () => {
    const res = await request(app)
      .put(`/users/${fixtures.cashierId}`)
      .set(adminAuth)
      .send({ role: "manager" });

    assert.equal(res.status, 503);
    assert.equal(res.body.error, "Failed to update role");
  });

  it("allows an admin to deactivate a user", async () => {
    const res = await request(app)
      .put(`/users/${fixtures.cashierId}`)
      .set(adminAuth)
      .send({ is_active: false });

    assert.equal(res.status, 200);
    assert.equal(res.body.is_active, false);
  });
});
