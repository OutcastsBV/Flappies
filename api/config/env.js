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
    required("RFID_WS_SECRET");
    required("CORS_ORIGIN");
  }

  return {
    nodeEnv: process.env.NODE_ENV || "development",
    isProduction,
    port: Number(process.env.PORT || 3001),
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3002",
    cookieSecure:
      process.env.COOKIE_SECURE === "true" ||
      (isProduction && process.env.COOKIE_SECURE !== "false"),
    trustProxy: process.env.TRUST_PROXY === "true" || isProduction,
    rfidWsSecret: process.env.RFID_WS_SECRET || "dev-rfid-secret-change-me",
    databaseUrl: process.env.DATABASE_URL,
    pg: {
      user: process.env.PGUSER || "kassa",
      password: process.env.PGPASSWORD || "kassa_password",
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || "kassasysteem",
    },
  };
}

module.exports = { loadEnv };
