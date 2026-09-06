require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function loadEnv() {
  if (isProduction) {
    if (!process.env.DATABASE_URL && !process.env.PGPASSWORD) {
      throw new Error("Missing DATABASE_URL or PG* database settings");
    }
    required("ZITADEL_URL");
    required("ZITADEL_CLIENT_ID");
    required("ZITADEL_CLIENT_SECRET");
    required("ZITADEL_REDIRECT_URI");
    required("ZITADEL_AUDIENCE");
    required("ZITADEL_IMPERSONATOR_PAT");
    required("ZITADEL_PROJECT_ID");
    required("CORS_ORIGIN");
    required("CONFIG_ENCRYPTION_KEY");
  }

  return {
    nodeEnv: process.env.NODE_ENV || "development",
    isProduction,
    port: Number(process.env.PORT || 3001),
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3002",
    // Cookie domain derived from CORS_ORIGIN's hostname, with the leading
    // label (e.g. "api.") and any single subdomain label stripped so the
    // access-token cookie is readable from both the API host
    // (api.<tenant>.<base>) and the frontend host (<tenant>.<base>).
    // e.g. https://demo.flappies.shop -> demo.flappies.shop -> .flappies.shop
    cookieDomain: (() => {
      try {
        const host = new URL(
          process.env.CORS_ORIGIN || "http://localhost:3002"
        ).hostname;
        const parts = host.split(".");
        // localhost or bare IP: no cookie domain override
        if (parts.length < 3) return undefined;
        // Drop the tenant subdomain label, keep the rest as the shared
        // parent domain (e.g. "demo.flappies.shop" -> "flappies.shop").
        return "." + parts.slice(1).join(".");
      } catch {
        return undefined;
      }
    })(),
    cookieSecure:
      process.env.COOKIE_SECURE === "true" ||
      (isProduction && process.env.COOKIE_SECURE !== "false"),
    trustProxy: process.env.TRUST_PROXY === "true" || isProduction,
    configEncryptionKey:
      process.env.CONFIG_ENCRYPTION_KEY || "dev-config-encryption-key-32bytes!",
    databaseUrl: process.env.DATABASE_URL,
    pg: {
      user: process.env.PGUSER || "flappies",
      password: process.env.PGPASSWORD || "flappies_password",
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || "flappies",
    },
    // Observability — all optional, each integration is a no-op if its URL
    // isn't set (see api/lib/metrics.js, api/lib/logger.js,
    // api/services/support.service.js for the actual usage).
    tenantId: process.env.TENANT_ID || "default",
    prometheusPushgatewayUrl: process.env.PROMETHEUS_PUSHGATEWAY_URL || null,
    lokiUrl: process.env.LOKI_URL || null,
    smtpConfigured: Boolean(
      process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD
    ),
  };
}

module.exports = { loadEnv };
