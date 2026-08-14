require("./config/env");

const app = require("./app");
const pool = require("./db");
const { loadEnv } = require("./config/env");
const logger = require("./lib/logger");
const metrics = require("./lib/metrics");

const env = loadEnv();
const server = app.listen(env.port, () => {
  logger.info({ port: env.port }, "API running");
});

function shutdown(signal) {
  logger.info({ signal }, "Shutting down");
  metrics.stopMetricsPush();
  server.close(async () => {
    try {
      await pool.end();
    } catch (err) {
      logger.error({ err: err.message }, "Error closing DB pool");
    }
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: String(reason) }, "Unhandled rejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, "Uncaught exception");
  shutdown("uncaughtException");
});
