const authConfig = require("../config/auth");
const { COOKIE_NAME } = require("../lib/cookies");
const logger = require("../lib/logger");
const metrics = require("../lib/metrics");

let jose;
let jwks;

async function loadJose() {
  if (!jose) {
    jose = await import("jose");
  }
  return jose;
}

async function getJwks() {
  if (!jwks) {
    const { createRemoteJWKSet } = await loadJose();
    const jwksUrl = new URL(`${authConfig.internalBase}/oauth/v2/keys`);
    jwks = createRemoteJWKSet(jwksUrl, {
      // A hung ZITADEL must fail fast rather than hang every login/request;
      // cooldown avoids hammering it with retries once it's known to be down.
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      ...(authConfig.publicHost ? { headers: authConfig.internalHostHeader() } : {}),
    });
  }
  return jwks;
}

// Network/availability failures reaching ZITADEL's JWKS endpoint should
// surface as 503 (retry-able, not the caller's fault) rather than 401
// ("Invalid token"), which would wrongly tell a cashier to log in again
// when the real problem is an outage on our end.
const JWKS_UNAVAILABLE_CODES = new Set([
  "ERR_JWKS_TIMEOUT",
  "ERR_JWKS_INVALID",
]);

function isAuthServiceUnavailable(err) {
  if (JWKS_UNAVAILABLE_CODES.has(err?.code)) {
    return true;
  }
  // Raw network errors from the underlying fetch (DNS, connection refused,
  // reset, etc.) surface as TypeError/AggregateError, not a jose error.
  if (err instanceof TypeError || err?.name === "AggregateError") {
    return true;
  }
  return false;
}

function authenticateWithTestToken(req, res, next) {
  const auth = req.headers.authorization;
  const testSub = req.headers["x-test-user-sub"];

  if (!auth?.startsWith("Bearer test-token") || !testSub) {
    return null;
  }

  const roles = (req.headers["x-test-roles"] || "")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);

  req.auth = {
    sub: testSub,
    email: req.headers["x-test-user-email"] || "test@example.com",
    ...(roles.length > 0 && {
      "urn:zitadel:iam:org:project:roles": Object.fromEntries(
        roles.map((role) => [role, {}])
      ),
    }),
  };

  next();
  return true;
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return req.cookies?.[COOKIE_NAME] || null;
}

async function authenticate(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  if (
    process.env.NODE_ENV === "test" &&
    authenticateWithTestToken(req, res, next)
  ) {
    return;
  }

  try {
    const { jwtVerify } = await loadJose();
    const JWKS = await getJwks();

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: authConfig.issuer,
      audience: authConfig.audience,
    });

    req.auth = payload;
    next();
  } catch (err) {
    if (isAuthServiceUnavailable(err)) {
      logger.error(
        { err: err.message, code: err.code },
        "Authentication service (ZITADEL JWKS) unreachable"
      );
      metrics.appErrorsTotal.inc({ type: "zitadel_unavailable" });
      return res.status(503).json({ error: "Authentication service temporarily unavailable" });
    }
    logger.warn({ err: err.message }, "JWT verify failed");
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = authenticate;
