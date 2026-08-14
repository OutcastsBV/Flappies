const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  COOKIE_NAME,
  setAccessTokenCookie,
  clearAccessTokenCookie,
} = require("../../lib/cookies");

describe("cookies", () => {
  it("sets an httpOnly access cookie", () => {
    const calls = [];
    const res = {
      cookie: (...args) => calls.push(args),
    };

    setAccessTokenCookie(res, "tok", 1800, { cookieSecure: true });

    assert.equal(COOKIE_NAME, "kassa_access_token");
    assert.deepEqual(calls[0], [
      COOKIE_NAME,
      "tok",
      {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 1_800_000,
        path: "/",
      },
    ]);
  });

  it("clears the access cookie", () => {
    const calls = [];
    const res = {
      clearCookie: (...args) => calls.push(args),
    };

    clearAccessTokenCookie(res, { cookieSecure: false });

    assert.deepEqual(calls[0], [
      COOKIE_NAME,
      {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
      },
    ]);
  });
});
