const express = require("express");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetchFn }) => fetchFn(...args));

const authenticate = require("../middleware/authenticate");
const requireUser = require("../middleware/requireUser");
const authConfig = require("../config/auth");
const { getRoles } = require("../services/auth.helpers");
const { loadEnv } = require("../config/env");
const logger = require("../lib/logger");
const {
  setAccessTokenCookie,
  clearAccessTokenCookie,
} = require("../lib/cookies");
const { consumeRfidCode } = require("../lib/rfidCodes");
const { loginWithPassword } = require("../services/zitadel.service");
const { findUserByOidcSub } = require("../services/user.service");

const env = loadEnv();
const router = express.Router();

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (
    !username ||
    typeof username !== "string" ||
    !password ||
    typeof password !== "string"
  ) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const token = await loginWithPassword(username.trim(), password);

    // Decode JWT payload without verify (verify happens on subsequent requests)
    // to gate users that exist in ZITADEL but not in the app DB.
    const jose = await import("jose");
    const payload = jose.decodeJwt(token.access_token);
    const appUser = await findUserByOidcSub(payload.sub);
    if (!appUser) {
      return res
        .status(403)
        .json({ error: "User not allowed in this application" });
    }

    setAccessTokenCookie(res, token.access_token, token.expires_in, env);
    res.json({ ok: true, expires_in: token.expires_in });
  } catch (err) {
    logger.warn({ err: err.message, details: err.details }, "Password login failed");
    const status = err.status || 500;
    let error = "Login failed";
    if (status === 401) {
      error = "Invalid username or password";
    } else if (status === 503) {
      error =
        "Authentication service misconfigured (check ZITADEL service user roles)";
    }
    res.status(status).json({ error });
  }
});

router.post("/auth/callback", async (req, res) => {
  const { code } = req.body;

  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Missing authorization code" });
  }

  if (!authConfig.clientSecret) {
    logger.error("ZITADEL_CLIENT_SECRET is not configured");
    return res.status(500).json({ error: "Auth not configured" });
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: authConfig.clientId,
    client_secret: authConfig.clientSecret,
    redirect_uri: authConfig.redirectUri,
    code,
  });

  try {
    const tokenRes = await fetch(`${authConfig.internalBase}/oauth/v2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...authConfig.internalHostHeader(),
      },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      logger.warn({ status: tokenRes.status }, "Token exchange failed");
      logger.debug({ text }, "Token exchange response body");
      return res.status(401).json({ error: "Token exchange failed" });
    }

    const token = await tokenRes.json();
    setAccessTokenCookie(res, token.access_token, token.expires_in, env);

    res.json({
      ok: true,
      expires_in: token.expires_in,
    });
  } catch (err) {
    logger.error({ err: err.message }, "Auth callback failed");
    res.status(500).json({ error: "Auth callback failed" });
  }
});

router.post("/auth/rfid-exchange", async (req, res) => {
  const { code } = req.body;

  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Missing RFID code" });
  }

  const entry = consumeRfidCode(code);
  if (!entry) {
    return res.status(401).json({ error: "Invalid or expired RFID code" });
  }

  setAccessTokenCookie(res, entry.accessToken, entry.expiresIn, env);
  res.json({ ok: true, expires_in: entry.expiresIn });
});

router.post("/auth/logout", (req, res) => {
  clearAccessTokenCookie(res, env);
  res.json({ ok: true });
});

router.get("/me", authenticate, requireUser, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    email: req.auth.email,
    groups: getRoles(req.auth),
  });
});

module.exports = router;
