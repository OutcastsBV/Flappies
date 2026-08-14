const COOKIE_NAME = "kassa_access_token";

function setAccessTokenCookie(res, accessToken, expiresInSeconds, env) {
  const maxAge = Math.max(1, Number(expiresInSeconds) || 3600) * 1000;

  res.cookie(COOKIE_NAME, accessToken, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    maxAge,
    path: "/",
  });
}

function clearAccessTokenCookie(res, env) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    path: "/",
  });
}

module.exports = {
  COOKIE_NAME,
  setAccessTokenCookie,
  clearAccessTokenCookie,
};
