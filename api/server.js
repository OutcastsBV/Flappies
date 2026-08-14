require("./config/env");

const http = require("http");
const WebSocket = require("ws");
const app = require("./app");
const pool = require("./db");
const { loadEnv } = require("./config/env");
const logger = require("./lib/logger");
const { findUserByCardUid } = require("./services/user.service");
const { zitadelTokenForUser } = require("./services/zitadel.service");
const { storeRfidCode } = require("./lib/rfidCodes");

const env = loadEnv();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws/rfid" });

function extractSecret(req, message) {
  const url = new URL(req.url || "", "http://localhost");
  return (
    url.searchParams.get("secret") ||
    message?.secret ||
    req.headers["x-rfid-secret"] ||
    null
  );
}

function isScanner(req, message) {
  const secret = extractSecret(req, message);
  return Boolean(secret && secret === env.rfidWsSecret);
}

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

wss.on("connection", (ws, req) => {
  ws.isScanner = isScanner(req, null);

  ws.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.type === "auth") {
        ws.isScanner = isScanner(req, data);
        ws.send(
          JSON.stringify({
            type: ws.isScanner ? "auth-ok" : "auth-error",
          })
        );
        if (!ws.isScanner) ws.close();
        return;
      }

      if (data.type !== "card-scan") return;

      if (!ws.isScanner && !isScanner(req, data)) {
        ws.send(JSON.stringify({ type: "auth-error" }));
        return;
      }
      ws.isScanner = true;

      const user = await findUserByCardUid(data.uid);
      if (!user) {
        broadcast({ type: "card-error", reason: "unknown_card" });
        return;
      }

      const token = await zitadelTokenForUser(user.keycloak_id);
      const code = storeRfidCode(token.access_token, token.expires_in);

      broadcast({
        type: "card-login",
        code,
        expires_in: 60,
      });
    } catch (err) {
      logger.error({ err: err.message }, "RFID WS message failed");
      try {
        broadcast({ type: "card-error", reason: "server_error" });
      } catch {
        // ignore
      }
    }
  });
});

server.listen(env.port, () => {
  logger.info({ port: env.port }, "API + WS running");
});

function shutdown(signal) {
  logger.info({ signal }, "Shutting down");
  wss.close();
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
