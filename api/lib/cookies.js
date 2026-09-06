const COOKIE_NAME = "flappies_access_token";

function setAccessTokenCookie(res, accessToken, expiresInSeconds, env) {
  const maxAge = Math.max(1, Number(expiresInSeconds) || 3600) * 1000;

  res.cookie(COOKIE_NAME, accessToken, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    maxAge,
    path: "/",
    domain: env.cookieDomain,
  });
}

function clearAccessTokenCookie(res, env) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/",
    domain: env.cookieDomain,
  });
}

module.exports = {
  COOKIE_NAME,
  setAccessTokenCookie,
  clearAccessTokenCookie,
};
