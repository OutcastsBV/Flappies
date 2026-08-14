const issuer = process.env.ZITADEL_URL || "http://localhost:8080";

function resolvePublicHost() {
  const domain = process.env.ZITADEL_EXTERNALDOMAIN;
  if (domain) {
    const port = process.env.ZITADEL_EXTERNALPORT || "8080";
    const secure = process.env.ZITADEL_EXTERNALSECURE === "true";
    const defaultPort = secure ? "443" : "80";
    if (port === defaultPort) {
      return domain;
    }
    return `${domain}:${port}`;
  }

  try {
    return new URL(issuer).host;
  } catch {
    return null;
  }
}

const publicHost = resolvePublicHost();

/** Org domain suffix for ZITADEL login names (e.g. admin@10.61.2.101). */
const orgDomain =
  process.env.ZITADEL_ORG_DOMAIN ||
  process.env.ZITADEL_EXTERNALDOMAIN ||
  (publicHost ? publicHost.split(":")[0] : null);

/** Host header for calls to ZITADEL_INTERNAL_URL (e.g. http://zitadel:8080 in Docker). */
function internalHostHeader() {
  return publicHost ? { Host: publicHost } : {};
}

module.exports = {
  issuer,
  internalBase: process.env.ZITADEL_INTERNAL_URL || issuer,
  publicHost,
  orgDomain,
  internalHostHeader,
  clientId: process.env.ZITADEL_CLIENT_ID || "flappies",
  clientSecret: process.env.ZITADEL_CLIENT_SECRET,
  redirectUri:
    process.env.ZITADEL_REDIRECT_URI || "http://localhost:3002/callback",
  audience: process.env.ZITADEL_AUDIENCE || "flappies",
  impersonatorPat: process.env.ZITADEL_IMPERSONATOR_PAT,
  impersonatorClientId: process.env.ZITADEL_IMPERSONATOR_CLIENT_ID || "",
  impersonatorClientSecret: process.env.ZITADEL_IMPERSONATOR_CLIENT_SECRET || "",
  servicePat:
    process.env.ZITADEL_SERVICE_PAT || process.env.ZITADEL_IMPERSONATOR_PAT,
  orgId: process.env.ZITADEL_ORG_ID || "",
};
