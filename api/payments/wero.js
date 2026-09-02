/**
 * Payconiq Instore Display (v3) HTTP client. Used by Wero at checkout to
 * create a 120-second QR payment, poll status, and cancel unused ones.
 *
 * Auth is the merchant API key stored in payment_method_config (encrypted),
 * not an env var. Sandbox vs production is selected by config.environment.
 *
 * fetchFn is injectable so unit tests never hit the network.
 */
const logger = require("../lib/logger");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetchFn }) => fetchFn(...args));

const SANDBOX_BASE = "https://api.ext.payconiq.com/v3";
const PRODUCTION_BASE = "https://api.payconiq.com/v3";
const TIMEOUT_MS = Number(process.env.WERO_HTTP_TIMEOUT_MS || 10_000);
const PAYMENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const WAITING_STATUSES = new Set(["PENDING", "IDENTIFIED", "AUTHORIZED"]);

function eurosToCents(euros) {
  return Math.round(Number(euros) * 100);
}

function apiBase(config = {}) {
  const environment = String(config.environment || "sandbox").toLowerCase();
  return environment === "production" ? PRODUCTION_BASE : SANDBOX_BASE;
}

function enlargeQr(href) {
  if (!href || typeof href !== "string") return null;
  try {
    const url = new URL(href);
    url.searchParams.set("s", "M");
    url.searchParams.set("f", "PNG");
    return url.toString();
  } catch {
    return href;
  }
}

function assertPaymentId(paymentId) {
  if (!paymentId || !PAYMENT_ID_RE.test(String(paymentId))) {
    const err = new Error("Invalid Wero payment id");
    err.status = 400;
    throw err;
  }
  return String(paymentId);
}

function shapePayment(payload) {
  return {
    paymentId: payload.paymentId,
    status: payload.status,
    expiresAt: payload.expiresAt || payload.expireAt || null,
    amount: Number(payload.amount),
    currency: payload.currency || "EUR",
    qrcodeUrl: enlargeQr(payload._links?.qrcode?.href),
  };
}

function statusError(message, status, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

function mapPayconiqError(status, body) {
  const code = body?.code || body?.messageCode;
  const detail = body?.message || body?.error || "";

  if (status === 401 || status === 403) {
    return statusError("Wero rejected the API key", 503, { code: "WERO_UNAUTHORIZED" });
  }
  if (status === 404) {
    return statusError("Wero payment not found", 400, { code: "WERO_NOT_FOUND" });
  }
  if (status >= 500) {
    return statusError("Wero is unavailable", 503, { code: "WERO_UNAVAILABLE" });
  }
  return statusError(
    detail ? `Wero request failed: ${detail}` : "Wero request failed",
    status >= 400 && status < 500 ? 400 : 503,
    { code }
  );
}

async function weroFetch(config, path, { method = "GET", body, fetchFn } = {}) {
  const fetchImpl = fetchFn || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const url = `${apiBase(config)}${path}`;

  try {
    const res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.api_key}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (res.status === 204) {
      return null;
    }

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.warn(
        { status: res.status, path, code: payload.code },
        "Wero/Payconiq request failed"
      );
      throw mapPayconiqError(res.status, payload);
    }

    return payload;
  } catch (err) {
    if (err.status) throw err;
    const timedOut = err.name === "AbortError";
    throw statusError(
      timedOut
        ? `Wero request timed out after ${TIMEOUT_MS}ms`
        : "Wero is unreachable",
      503,
      { code: "WERO_UNAVAILABLE" }
    );
  } finally {
    clearTimeout(timer);
  }
}

async function createPayment(config, { amount, currency, description, reference }, { fetchFn } = {}) {
  if (!config?.api_key) {
    throw statusError("Wero is not configured", 503);
  }

  const payload = await weroFetch(config, "/payments", {
    method: "POST",
    body: {
      amount,
      currency: currency || "EUR",
      ...(description ? { description } : {}),
      ...(reference ? { reference } : {}),
    },
    fetchFn,
  });

  return shapePayment(payload);
}

async function getPayment(config, paymentId, { fetchFn } = {}) {
  if (!config?.api_key) {
    throw statusError("Wero is not configured", 503);
  }

  const payload = await weroFetch(
    config,
    `/payments/${assertPaymentId(paymentId)}`,
    { fetchFn }
  );
  return shapePayment(payload);
}

async function cancelPayment(config, paymentId, { fetchFn } = {}) {
  if (!config?.api_key) {
    throw statusError("Wero is not configured", 503);
  }

  await weroFetch(config, `/payments/${assertPaymentId(paymentId)}`, {
    method: "DELETE",
    fetchFn,
  });
}

function assertPaymentSucceeded(payment, expectedAmountCents) {
  if (!payment || payment.status !== "SUCCEEDED") {
    const status = payment?.status || "UNKNOWN";
    throw statusError(
      WAITING_STATUSES.has(status)
        ? "Wero payment is still processing"
        : `Wero payment is not complete (${status})`,
      400
    );
  }

  if (Number(payment.amount) !== expectedAmountCents) {
    throw statusError(
      "Wero payment amount does not match the cart total",
      400
    );
  }

  return payment;
}

module.exports = {
  SANDBOX_BASE,
  PRODUCTION_BASE,
  WAITING_STATUSES,
  eurosToCents,
  apiBase,
  enlargeQr,
  assertPaymentId,
  shapePayment,
  createPayment,
  getPayment,
  cancelPayment,
  assertPaymentSucceeded,
};
