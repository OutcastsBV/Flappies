const client = require("prom-client");
const logger = require("./logger");

const tenantId = process.env.TENANT_ID || "default";

const register = new client.Registry();
register.setDefaultLabels({ tenant_id: tenantId });
client.collectDefaultMetrics({ register });

// --- Technical metrics ---

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests handled",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

const appErrorsTotal = new client.Counter({
  name: "app_errors_total",
  help: "Total number of application-level errors",
  labelNames: ["type"],
  registers: [register],
});

// --- Business metrics ---

const itemUnitsSoldTotal = new client.Counter({
  name: "pos_item_units_sold_total",
  help: "Total units sold, per product",
  labelNames: ["product_name"],
  registers: [register],
});

const transactionsTotal = new client.Counter({
  name: "pos_transactions_total",
  help: "Total number of completed transactions",
  labelNames: ["payment_method"],
  registers: [register],
});

const transactionRevenueTotal = new client.Counter({
  name: "pos_transaction_revenue_total",
  help: "Total transaction revenue, per payment method",
  labelNames: ["payment_method"],
  registers: [register],
});

const correctionsTotal = new client.Counter({
  name: "pos_corrections_total",
  help: "Total number of corrections issued, per type",
  labelNames: ["type"],
  registers: [register],
});

// --- Push to a central Pushgateway (optional) ---
//
// Pushed metrics are grouped by tenant_id so a shared/master Prometheus can
// tell tenants apart. A hung Pushgateway must never affect the app itself:
// pushes run on their own timer, are skipped (not queued) if a previous push
// is still in flight, use a socket timeout, and only ever log a warning.

let pushTimer = null;
let pushInFlight = false;

function startMetricsPush() {
  const url = process.env.PROMETHEUS_PUSHGATEWAY_URL;
  if (!url) {
    return;
  }

  const intervalMs = Number(process.env.PROMETHEUS_PUSH_INTERVAL_MS || 15000);
  const gateway = new client.Pushgateway(url, { timeout: 5000 }, register);

  pushTimer = setInterval(async () => {
    if (pushInFlight) {
      return;
    }
    pushInFlight = true;
    try {
      await gateway.pushAdd({
        jobName: "flappies_api",
        groupings: { tenant_id: tenantId },
      });
    } catch (err) {
      logger.warn(
        { err: err.message, url },
        "Failed to push metrics to Prometheus Pushgateway"
      );
    } finally {
      pushInFlight = false;
    }
  }, intervalMs);

  if (typeof pushTimer.unref === "function") {
    pushTimer.unref();
  }

  logger.info({ url, intervalMs }, "Prometheus Pushgateway push loop started");
}

function stopMetricsPush() {
  if (pushTimer) {
    clearInterval(pushTimer);
    pushTimer = null;
  }
}

module.exports = {
  register,
  tenantId,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  appErrorsTotal,
  itemUnitsSoldTotal,
  transactionsTotal,
  transactionRevenueTotal,
  correctionsTotal,
  startMetricsPush,
  stopMetricsPush,
};
