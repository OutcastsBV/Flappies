const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const pinoHttp = require("pino-http");

const { loadEnv } = require("./config/env");
const pool = require("./db");
const logger = require("./lib/logger");
const metrics = require("./lib/metrics");

const authRoutes = require("./routes/auth.routes");
const productRoutes = require("./routes/product.routes");
const inventoryRoutes = require("./routes/inventory.routes");
const userRoutes = require("./routes/user.routes");
const cartRoutes = require("./routes/cart.routes");
const transactionRoutes = require("./routes/transaction.routes");
const configRoutes = require("./routes/config.routes");
const reportRoutes = require("./routes/report.routes");
const registerRoutes = require("./routes/register.routes");
const correctionRoutes = require("./routes/correction.routes");
const paymentMethodRoutes = require("./routes/paymentMethod.routes");
const supportRoutes = require("./routes/support.routes");
const auditRoutes = require("./routes/audit.routes");

const env = loadEnv();

const app = express();

if (env.trustProxy) {
  app.set("trust proxy", 1);
}

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(cookieParser());
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === "/health" || req.url === "/ready",
    },
  })
);

app.use((req, res, next) => {
  const endTimer = metrics.httpRequestDurationSeconds.startTimer();

  res.on("finish", () => {
    const route = `${req.baseUrl || ""}${req.route?.path || req.path}`;
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode,
    };
    metrics.httpRequestsTotal.inc(labels);
    endTimer(labels);
    if (res.statusCode >= 500) {
      metrics.appErrorsTotal.inc({ type: "http_5xx" });
    }
  });

  next();
});

app.use(authRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/users", userRoutes);
app.use("/products", productRoutes);
app.use("/cart", cartRoutes);
app.use("/transactions", transactionRoutes);
app.use("/config", configRoutes);
app.use("/reports", reportRoutes);
app.use("/register", registerRoutes);
app.use("/corrections", correctionRoutes);
app.use("/payment-methods", paymentMethodRoutes);
app.use("/support", supportRoutes);
app.use("/audit", auditRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/ready", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ready" });
  } catch (err) {
    logger.error({ err: err.message }, "Readiness check failed");
    metrics.appErrorsTotal.inc({ type: "readiness_check" });
    res.status(503).json({ status: "not_ready" });
  }
});

// Local/pull-based metrics endpoint, gated by an optional shared token —
// pushing to a central Pushgateway (see api/lib/metrics.js) is the primary
// path, this is mainly for local inspection/debugging.
app.get("/metrics", async (req, res) => {
  const token = process.env.METRICS_TOKEN;
  if (token) {
    const provided = req.headers.authorization;
    if (provided !== `Bearer ${token}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  res.set("Content-Type", metrics.register.contentType);
  res.end(await metrics.register.metrics());
});

app.use((err, req, res, next) => {
  logger.error({ err: err.message, stack: err.stack }, "Unhandled error");
  metrics.appErrorsTotal.inc({ type: "unhandled_exception" });
  const status = err.status || 500;
  res.status(status).json({
    error: env.isProduction ? "Internal server error" : err.message,
  });
});

metrics.startMetricsPush();

module.exports = app;
