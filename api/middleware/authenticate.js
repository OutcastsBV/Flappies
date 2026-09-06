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

// Native fetch (undici) silently drops attempts to override the Host
// header, since it is a Fetch-spec "forbidden request header". That breaks
// ZITADEL's ExternalDomain-based instance resolution when we reach it via
// its internal ClusterIP with a spoofed Host header (see
// authConfig.internalHostHeader()). jose's `headers` option on
// createRemoteJWKSet is therefore silently ineffective, since jose's
// default fetch is native fetch. We supply a node:http-based custom fetch
// via jose's [customFetch] symbol instead, which does honor a custom Host
// header, mirroring the same fix applied to the ZITADEL adapter calls.
function buildJwksFetch(hostHeader) {
  const http = require("node:http");
  const https = require("node:https");

  return function jwksFetch(url, options) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const lib = parsed.protocol === "https:" ? https : http;
      const reqHeaders = {};
      if (options && options.headers) {
        for (const [key, value] of options.headers.entries()) {
          reqHeaders[key] = value;
        }
      }
      if (hostHeader) reqHeaders.Host = hostHeader;

      const req = lib.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
          path: `${parsed.pathname}${parsed.search}`,
          method: (options && options.method) || "GET",
          headers: reqHeaders,
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const body = Buffer.concat(chunks);
            const responseHeaders = new Headers();
            for (const [key, value] of Object.entries(res.headers)) {
              if (value !== undefined) {
                responseHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
              }
            }
            resolve(
              new Response(body, {
                status: res.statusCode,
                statusText: res.statusMessage,
                headers: responseHeaders,
              })
            );
          });
        }
      );
      req.on("error", reject);
      if (options && options.signal) {
        options.signal.addEventListener("abort", () => req.destroy(new Error("aborted")));
      }
      req.end();
    });
  };
}

async function getJwks() {
  if (!jwks) {
    const { createRemoteJWKSet, customFetch } = await loadJose();
    const jwksUrl = new URL(`${authConfig.internalBase}/oauth/v2/keys`);
    jwks = createRemoteJWKSet(jwksUrl, {
      // A hung ZITADEL must fail fast rather than hang every login/request;
      // cooldown avoids hammering it with retries once it's known to be down.
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      ...(authConfig.publicHost
        ? { [customFetch]: buildJwksFetch(authConfig.publicHost) }
        : {}),
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
      issuer: authConfig.tokenIssuer,
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
