const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const pinoHttp = require("pino-http");

const { loadEnv } = require("./config/env");
const pool = require("./db");
const logger = require("./lib/logger");

const authRoutes = require("./routes/auth.routes");
const productRoutes = require("./routes/product.routes");
const inventoryRoutes = require("./routes/inventory.routes");
const userRoutes = require("./routes/user.routes");
const cartRoutes = require("./routes/cart.routes");
const transactionRoutes = require("./routes/transaction.routes");
const configRoutes = require("./routes/config.routes");
const reportRoutes = require("./routes/report.routes");
const topupRoutes = require("./routes/topup.routes");
const { handleStripeWebhook } = require("./services/topup.service");

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

app.post(
  "/topup/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

    if (!signature) {
      return res.status(400).json({ error: "Missing Stripe signature" });
    }

    try {
      await handleStripeWebhook(req.body, signature);
      res.json({ received: true });
    } catch (err) {
      logger.error({ err: err.message }, "Stripe webhook failed");
      res.status(400).json({ error: err.message || "Webhook failed" });
    }
  }
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

app.use(authRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/users", userRoutes);
app.use("/products", productRoutes);
app.use("/cart", cartRoutes);
app.use("/transactions", transactionRoutes);
app.use("/config", configRoutes);
app.use("/reports", reportRoutes);
app.use("/topup", topupRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/ready", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ready" });
  } catch (err) {
    logger.error({ err: err.message }, "Readiness check failed");
    res.status(503).json({ status: "not_ready" });
  }
});

app.use((err, req, res, next) => {
  logger.error({ err: err.message, stack: err.stack }, "Unhandled error");
  const status = err.status || 500;
  res.status(status).json({
    error: env.isProduction ? "Internal server error" : err.message,
  });
});

module.exports = app;
