const authConfig = require("../config/auth");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetchFn }) => fetchFn(...args));

const ZITADEL_TIMEOUT_MS = Number(process.env.ZITADEL_HTTP_TIMEOUT_MS || 10_000);

/**
 * All calls to ZITADEL go through this so a hung/unreachable instance fails
 * fast with a 503 (retry-able) instead of hanging the request indefinitely
 * or bubbling up as a confusing generic error.
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ZITADEL_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    const wrapped = new Error(
      err.name === "AbortError"
        ? `ZITADEL request timed out after ${ZITADEL_TIMEOUT_MS}ms`
        : `ZITADEL is unreachable: ${err.message}`
    );
    wrapped.status = 503;
    wrapped.code = "ZITADEL_UNAVAILABLE";
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}

function serviceHeaders(extra = {}) {
  const pat = authConfig.servicePat;
  if (!pat) {
    throw new Error("ZITADEL_SERVICE_PAT (or ZITADEL_IMPERSONATOR_PAT) is not configured");
  }

  const headers = {
    Authorization: `Bearer ${pat}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    ...authConfig.internalHostHeader(),
    ...extra,
  };

  if (authConfig.orgId) {
    headers["x-zitadel-orgid"] = authConfig.orgId;
  }

  return headers;
}

function isUserNotFoundError(details) {
  const text = String(details || "");
  return (
    text.includes("QUERY-Dfbg2") || text.includes("User could not be found")
  );
}

function isMembershipNotFoundError(details) {
  const text = String(details || "");
  return (
    text.includes("AUTHZ-cdgFk") || text.includes("membership not found")
  );
}

function authConfigError(message, details) {
  const err = new Error(message);
  err.status = 503;
  err.details = details;
  return err;
}

function uniqueUserChecks(checks) {
  const seen = new Set();
  const out = [];

  for (const check of checks) {
    const key = JSON.stringify(check);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(check);
    }
  }

  return out;
}

async function searchZitadelUser(identifier) {
  const searchQueries = [
    {
      loginNameQuery: {
        loginName: identifier,
        method: "TEXT_QUERY_METHOD_EQUALS",
      },
    },
    {
      userNameQuery: {
        userName: identifier,
        method: "TEXT_QUERY_METHOD_EQUALS",
      },
    },
  ];

  if (identifier.includes("@")) {
    searchQueries.unshift({
      emailQuery: {
        emailAddress: identifier,
        method: "TEXT_QUERY_METHOD_EQUALS",
      },
    });
  }

  const res = await fetchWithTimeout(`${authConfig.internalBase}/v2/users`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({
      queries: [{ orQuery: { queries: searchQueries } }],
      limit: 1,
    }),
  });

  if (!res.ok) {
    return null;
  }

  const body = await res.json();
  const user = body.result?.[0];
  if (!user) {
    return null;
  }

  const human = user.human || user;
  return {
    userId: user.userId || human.userId,
    preferredLoginName: user.preferredLoginName || human.preferredLoginName,
    loginNames: user.loginNames || human.loginNames || [],
  };
}

async function buildUserCheckCandidates(identifier) {
  const trimmed = identifier.trim();
  const checks = [{ loginName: trimmed }];

  if (authConfig.orgDomain && !trimmed.includes("@")) {
    checks.push({ loginName: `${trimmed}@${authConfig.orgDomain}` });
  }

  const found = await searchZitadelUser(trimmed);
  if (found?.userId) {
    checks.push({ userId: found.userId });
  }
  if (found?.preferredLoginName) {
    checks.push({ loginName: found.preferredLoginName });
  }
  for (const loginName of found?.loginNames || []) {
    checks.push({ loginName });
  }

  return uniqueUserChecks(checks);
}

async function createPasswordSession(userCheck, password) {
  const createRes = await fetchWithTimeout(`${authConfig.internalBase}/v2/sessions`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({
      checks: {
        user: userCheck,
        password: { password },
      },
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    if (isMembershipNotFoundError(text)) {
      throw authConfigError(
        "ZITADEL service account missing IAM_LOGIN_CLIENT role",
        text
      );
    }
    const err = new Error("Invalid credentials");
    err.status = 401;
    err.details = text;
    throw err;
  }

  const created = await createRes.json();
  const sessionId = created.sessionId || created.session_id;
  const sessionToken = created.sessionToken || created.session_token;

  try {
    const getRes = await fetchWithTimeout(
      `${authConfig.internalBase}/v2/sessions/${sessionId}`,
      {
        method: "GET",
        headers: {
          ...serviceHeaders(),
          Authorization: `Bearer ${sessionToken}`,
        },
      }
    );

    if (!getRes.ok) {
      const text = await getRes.text();
      throw new Error(`Failed to read ZITADEL session: ${text}`);
    }

    const sessionBody = await getRes.json();
    const session = sessionBody.session || sessionBody;
    const zitadelUserId =
      session?.factors?.user?.id || session?.factors?.user?.userId;

    if (!zitadelUserId) {
      throw new Error("Session did not include a verified user id");
    }

    if (!session?.factors?.password?.verifiedAt) {
      const err = new Error("Invalid credentials");
      err.status = 401;
      throw err;
    }

    return zitadelTokenForUser(zitadelUserId);
  } finally {
    try {
      await fetchWithTimeout(`${authConfig.internalBase}/v2/sessions/${sessionId}`, {
        method: "DELETE",
        headers: serviceHeaders(),
        body: JSON.stringify({ sessionToken }),
      });
    } catch {
      // best-effort cleanup
    }
  }
}

/**
 * Issue a ZITADEL access token for a user via token exchange (impersonation).
 * Requires a service user with ORG_END_USER_IMPERSONATOR and client credentials.
 */
let impersonatorAccessTokenCache = null;
let impersonatorAccessTokenExpiresAt = 0;

async function getImpersonatorAccessToken() {
  const now = Date.now();
  if (
    impersonatorAccessTokenCache &&
    impersonatorAccessTokenExpiresAt > now + 30_000
  ) {
    return impersonatorAccessTokenCache;
  }

  if (
    !authConfig.impersonatorClientId ||
    !authConfig.impersonatorClientSecret
  ) {
    throw authConfigError(
      "Missing ZITADEL_IMPERSONATOR_CLIENT_ID / ZITADEL_IMPERSONATOR_CLIENT_SECRET",
      "Generate client credentials on the service machine user in ZITADEL"
    );
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: authConfig.impersonatorClientId,
    client_secret: authConfig.impersonatorClientSecret,
    scope: "openid profile email urn:zitadel:iam:org:project:roles",
  });

  const res = await fetchWithTimeout(`${authConfig.internalBase}/oauth/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...authConfig.internalHostHeader(),
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw authConfigError(
      "Failed to obtain impersonator access token via client_credentials",
      text
    );
  }

  const token = await res.json();
  impersonatorAccessTokenCache = token.access_token;
  impersonatorAccessTokenExpiresAt =
    now + Math.max(60, (token.expires_in || 3600) - 60) * 1000;

  return impersonatorAccessTokenCache;
}

async function zitadelTokenForUser(zitadelUserId) {
  if (!zitadelUserId) {
    throw new Error("User missing keycloak_id");
  }

  if (!authConfig.impersonatorPat) {
    throw new Error("ZITADEL_IMPERSONATOR_PAT is not configured");
  }

  const actorToken = await getImpersonatorAccessToken();

  const params = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    client_id: authConfig.clientId,
    client_secret: authConfig.clientSecret,
    subject_token: zitadelUserId,
    subject_token_type: "urn:zitadel:params:oauth:token-type:user_id",
    actor_token: actorToken,
    actor_token_type: "urn:ietf:params:oauth:token-type:access_token",
    requested_token_type: "urn:ietf:params:oauth:token-type:jwt",
    scope: "openid profile email urn:zitadel:iam:org:project:roles",
  });

  const res = await fetchWithTimeout(`${authConfig.internalBase}/oauth/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...authConfig.internalHostHeader(),
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    if (text.includes("token-exchange") && text.includes("not allowed")) {
      throw authConfigError(
        "OAuth app missing Token Exchange grant type",
        text
      );
    }
    if (text.includes("PolicyDisabled") || text.includes("Impersonation")) {
      throw authConfigError(
        "ZITADEL impersonation disabled in instance Security Settings",
        text
      );
    }
    const err = new Error(`ZITADEL token exchange failed: ${text}`);
    err.status = 502;
    err.details = text;
    throw err;
  }

  const token = await res.json();
  const jwt = pickJwt(token.access_token, token.id_token);
  if (!jwt) {
    const err = new Error("ZITADEL did not return a JWT access token or id_token");
    err.status = 503;
    err.details = `issued_token_type=${token.issued_token_type || ""}`;
    throw err;
  }

  return {
    access_token: jwt,
    expires_in: token.expires_in,
  };
}

function isJwt(value) {
  return typeof value === "string" && value.split(".").length === 3;
}

function pickJwt(...candidates) {
  return candidates.find(isJwt) || null;
}

/**
 * Verify username/password via Session API, then exchange for an OIDC access token.
 * Accepts ZITADEL login name, username@org-domain, or email (resolved via user search).
 */
async function loginWithPassword(loginName, password) {
  const candidates = await buildUserCheckCandidates(loginName);
  let lastError;

  for (const userCheck of candidates) {
    try {
      return await createPasswordSession(userCheck, password);
    } catch (err) {
      if (err.status === 503) {
        throw err;
      }
      if (err.status === 401 && isUserNotFoundError(err.details)) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  if (lastError) {
    throw lastError;
  }

  const err = new Error("Invalid credentials");
  err.status = 401;
  throw err;
}

/**
 * Create a human user in ZITADEL. Returns the ZITADEL user id (JWT sub).
 */
async function createZitadelUser({
  username,
  email,
  password,
  givenName,
  familyName,
}) {
  const displayName =
    [givenName, familyName].filter(Boolean).join(" ") || username;

  const body = {
    username,
    profile: {
      givenName: givenName || username,
      familyName: familyName || username,
      displayName,
    },
    email: {
      email,
      isVerified: true,
    },
    password: {
      password,
      changeRequired: false,
    },
  };

  if (authConfig.orgId) {
    body.organization = { orgId: authConfig.orgId };
  }

  const res = await fetchWithTimeout(`${authConfig.internalBase}/v2/users/human`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Failed to create ZITADEL user: ${text}`);
    err.status = res.status >= 400 && res.status < 500 ? 400 : 502;
    err.details = text;
    throw err;
  }

  const data = await res.json();
  const userId = data.userId || data.user_id || data.id;
  if (!userId) {
    throw new Error("ZITADEL did not return a user id");
  }

  return { userId };
}

/**
 * Grant (or update) the single app role a user has in the Flappies ZITADEL
 * project, via the Authorization v2 API. Roles are mutually exclusive here
 * (admin | manager | cashier), so we look up any existing authorization for
 * this user/project and update it in place, otherwise create a new one.
 * Requires ZITADEL_PROJECT_ID and a service user with `user.grant.write`.
 */
async function setUserProjectRole(userId, roleKey) {
  if (!authConfig.projectId) {
    throw authConfigError(
      "ZITADEL_PROJECT_ID is not configured",
      "Set ZITADEL_PROJECT_ID to the project that owns the admin/manager/cashier roles"
    );
  }

  const searchRes = await fetchWithTimeout(
    `${authConfig.internalBase}/zitadel.authorization.v2.AuthorizationService/ListAuthorizations`,
    {
      method: "POST",
      headers: serviceHeaders(),
      body: JSON.stringify({
        filters: [
          { userIdFilter: { userId } },
          { projectIdFilter: { projectId: authConfig.projectId } },
        ],
      }),
    }
  );

  let existingId = null;
  if (searchRes.ok) {
    const body = await searchRes.json();
    existingId = body.authorizations?.[0]?.id || null;
  }

  const base = `${authConfig.internalBase}/zitadel.authorization.v2.AuthorizationService`;
  const url = existingId
    ? `${base}/UpdateAuthorization`
    : `${base}/CreateAuthorization`;

  const payload = existingId
    ? { id: existingId, roleKeys: [roleKey] }
    : {
        userId,
        projectId: authConfig.projectId,
        organizationId: authConfig.orgId,
        roleKeys: [roleKey],
      };

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to assign ZITADEL role '${roleKey}': ${text}`);
  }
}

async function deleteZitadelUser(userId) {
  if (!userId) return;

  const res = await fetchWithTimeout(`${authConfig.internalBase}/v2/users/${userId}`, {
    method: "DELETE",
    headers: serviceHeaders(),
  });

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Failed to delete ZITADEL user: ${text}`);
  }
}

module.exports = {
  zitadelTokenForUser,
  loginWithPassword,
  createZitadelUser,
  deleteZitadelUser,
  setUserProjectRole,
};
