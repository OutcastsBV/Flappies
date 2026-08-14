const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const requireRole = require("../../middleware/requireRole");

function makeReqRes(auth) {
  const req = { auth };
  let statusCode;
  let body;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  return {
    req,
    res,
    getResult: () => ({ statusCode, body }),
  };
}

describe("middleware/requireRole", () => {
  it("allows a matching single role", () => {
    const { req, res, getResult } = makeReqRes({
      "urn:zitadel:iam:org:project:roles": { admin: {} },
    });
    let nextCalled = false;

    requireRole("admin")(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(getResult(), { statusCode: undefined, body: undefined });
  });

  it("allows any role in an array of allowed roles", () => {
    const { req, res, getResult } = makeReqRes({
      "urn:zitadel:iam:org:project:roles": { manager: {} },
    });
    let nextCalled = false;

    requireRole(["admin", "manager"])(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(getResult().statusCode, undefined);
  });

  it("rejects a user without any of the allowed roles", () => {
    const { req, res, getResult } = makeReqRes({
      "urn:zitadel:iam:org:project:roles": { cashier: {} },
    });
    let nextCalled = false;

    requireRole(["admin", "manager"])(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.deepEqual(getResult(), { statusCode: 403, body: { error: "Forbidden" } });
  });

  it("rejects when auth is missing entirely", () => {
    const { req, res, getResult } = makeReqRes(null);
    let nextCalled = false;

    requireRole("admin")(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(getResult().statusCode, 403);
  });

  it("allows access from the app DB role when JWT project roles are missing", () => {
    const { req, res, getResult } = makeReqRes({});
    req.user = { role: "manager" };
    let nextCalled = false;

    requireRole(["admin", "manager"])(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(getResult().statusCode, undefined);
  });

  it("rejects a DB role that is not in the allowed list", () => {
    const { req, res, getResult } = makeReqRes({});
    req.user = { role: "cashier" };
    let nextCalled = false;

    requireRole(["admin", "manager"])(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(getResult().statusCode, 403);
  });
});
