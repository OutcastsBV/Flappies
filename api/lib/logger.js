const pino = require("pino");

const isProduction = process.env.NODE_ENV === "production";
const tenantId = process.env.TENANT_ID || "default";
const lokiUrl = process.env.LOKI_URL;
const level = process.env.LOG_LEVEL || (isProduction ? "info" : "debug");

const baseOptions = {
  level,
  // Every log line (console, file, and Loki) carries the tenant id so a
  // shared/master Loki can filter logs back out per tenant.
  base: { tenant_id: tenantId, service: "flappies-api" },
};

function buildTransport() {
  const targets = [];

  if (!isProduction) {
    targets.push({ target: "pino-pretty", level, options: { colorize: true } });
  } else {
    targets.push({ target: "pino/file", level, options: { destination: 1 } });
  }

  if (lokiUrl) {
    targets.push({
      target: "pino-loki",
      level,
      options: {
        host: lokiUrl,
        basicAuth:
          process.env.LOKI_USERNAME && process.env.LOKI_PASSWORD
            ? {
                username: process.env.LOKI_USERNAME,
                password: process.env.LOKI_PASSWORD,
              }
            : undefined,
        labels: {
          app: "flappies-api",
          tenant_id: tenantId,
          env: process.env.NODE_ENV || "development",
        },
        // Harmless if the target Loki isn't multi-tenant; required if it is
        // (auth_enabled: true) — covers both setups without extra config.
        headers: { "X-Scope-OrgID": tenantId },
        // Batches + a bounded buffer mean a Loki outage never blocks the
        // event loop and can never grow memory unbounded — oldest buffered
        // logs are dropped (FIFO) once the buffer is full.
        batching: { interval: 5, maxBufferSize: 10000 },
        timeout: 10000,
        silenceErrors: false,
      },
    });
  }

  return pino.transport({ targets });
}

// pino transports run in a worker thread, so logger.*() calls here never
// block the event loop even if Loki (or stdout, in theory) is slow/down.
const logger =
  isProduction && !lokiUrl ? pino(baseOptions) : pino(baseOptions, buildTransport());

module.exports = logger;
