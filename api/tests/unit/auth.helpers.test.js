const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { getRoles, hasRole } = require("../../services/auth.helpers");

describe("auth.helpers", () => {
  it("returns Zitadel project roles when present", () => {
    const auth = {
      "urn:zitadel:iam:org:project:roles": {
        admin: {},
        user: {},
      },
    };

    assert.deepEqual(getRoles(auth), ["admin", "user"]);
    assert.equal(hasRole(auth, "admin"), true);
    assert.equal(hasRole(auth, "cashier"), false);
  });

  it("falls back to Keycloak resource roles", () => {
    const auth = {
      resource_access: {
        flappies: {
          roles: ["admin", "member"],
        },
      },
    };

    assert.deepEqual(getRoles(auth), ["admin", "member"]);
  });

  it("falls back to groups", () => {
    const auth = { groups: ["admin"] };
    assert.deepEqual(getRoles(auth), ["admin"]);
  });

  it("returns empty roles when auth is missing", () => {
    assert.deepEqual(getRoles(null), []);
    assert.equal(hasRole(null, "admin"), false);
  });
});
