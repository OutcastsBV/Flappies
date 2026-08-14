const { before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../../app");
const { setupDatabase } = require("../helpers/migrate");
const { seedTestData } = require("../helpers/seed");
const { testAuthHeaders } = require("../helpers/auth");

process.env.NODE_ENV = "test";

describe("product e2e", () => {
  let fixtures;

  before(async () => {
    await setupDatabase();
    fixtures = await seedTestData();
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/products");
    assert.equal(res.status, 401);
  });

  it("lists products for authenticated members", async () => {
    const res = await request(app)
      .get("/products")
      .set(testAuthHeaders(fixtures.userSub));

    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].name, "Cola");
  });

  it("returns a single product by id", async () => {
    const res = await request(app)
      .get(`/products/${fixtures.productId}`)
      .set(testAuthHeaders(fixtures.userSub));

    assert.equal(res.status, 200);
    assert.equal(res.body.name, "Cola");
  });

  it("returns 404 for an unknown product", async () => {
    const res = await request(app)
      .get("/products/999999")
      .set(testAuthHeaders(fixtures.userSub));

    assert.equal(res.status, 404);
  });

  it("forbids members from creating products", async () => {
    const res = await request(app)
      .post("/products")
      .set(testAuthHeaders(fixtures.userSub))
      .send({ name: "Chips", price: 3 });

    assert.equal(res.status, 403);
  });

  it("requires a name and price when an admin creates a product", async () => {
    const adminAuth = testAuthHeaders(fixtures.adminSub, { roles: ["admin"] });

    const res = await request(app)
      .post("/products")
      .set(adminAuth)
      .send({ description: "No name or price" });

    assert.equal(res.status, 400);
  });

  it("allows an admin to create, update and delete a product", async () => {
    const adminAuth = testAuthHeaders(fixtures.adminSub, { roles: ["admin"] });

    const createRes = await request(app)
      .post("/products")
      .set(adminAuth)
      .send({ name: "Chips", description: "Salty snack", price: 3, cost_price: 1 });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.body.name, "Chips");
    const productId = createRes.body.id;

    const updateRes = await request(app)
      .put(`/products/${productId}`)
      .set(adminAuth)
      .send({ price: 3.5 });

    assert.equal(updateRes.status, 200);
    assert.equal(Number(updateRes.body.price), 3.5);

    const deleteRes = await request(app)
      .delete(`/products/${productId}`)
      .set(adminAuth);

    assert.equal(deleteRes.status, 200);

    const getRes = await request(app)
      .get(`/products/${productId}`)
      .set(adminAuth);
    assert.equal(getRes.status, 404);
  });

  it("returns 404 when updating or deleting an unknown product", async () => {
    const adminAuth = testAuthHeaders(fixtures.adminSub, { roles: ["admin"] });

    const updateRes = await request(app)
      .put("/products/999999")
      .set(adminAuth)
      .send({ price: 1 });
    assert.equal(updateRes.status, 404);

    const deleteRes = await request(app)
      .delete("/products/999999")
      .set(adminAuth);
    assert.equal(deleteRes.status, 404);
  });
});
