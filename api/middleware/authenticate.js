const authConfig = require("../config/auth");
const { COOKIE_NAME } = require("../lib/cookies");
const logger = require("../lib/logger");

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
    const options = authConfig.publicHost
      ? { headers: authConfig.internalHostHeader() }
      : undefined;
    jwks = createRemoteJWKSet(jwksUrl, options);
  }
  return jwks;
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
    logger.warn({ err: err.message }, "JWT verify failed");
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = authenticate;
