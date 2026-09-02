/**
 * SumUp Cloud API client for Solo / Virtual Solo readers.
 * Auth is the merchant API key stored in payment_method_config (encrypted).
 * fetchFn is injectable so unit tests never hit the network.
 */
const logger = require("../lib/logger");

const fetch = (...args) =>
  import("node-fetch").then(({ default: fetchFn }) => fetchFn(...args));

const API_BASE = "https://api.sumup.com";
const TIMEOUT_MS = Number(process.env.SUMUP_HTTP_TIMEOUT_MS || 15_000);
const READER_ID_RE = /^rdr_[A-Za-z0-9]+$/;
const CHECKOUT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WAITING_STATUSES = new Set(["pending"]);

function eurosToCents(euros) {
  return Math.round(Number(euros) * 100);
}

function statusError(message, status, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

function assertReaderId(readerId) {
  if (!readerId || !READER_ID_RE.test(String(readerId))) {
    throw statusError("Invalid SumUp reader id", 400);
  }
  return String(readerId);
}

function assertCheckoutId(checkoutId) {
  if (!checkoutId || !CHECKOUT_ID_RE.test(String(checkoutId))) {
    throw statusError("Invalid SumUp checkout id", 400);
  }
  return String(checkoutId);
}

function formatPaymentReference(readerId, checkoutId) {
  return `${assertReaderId(readerId)}:${assertCheckoutId(checkoutId)}`;
}

function parsePaymentReference(reference) {
  if (!reference || typeof reference !== "string") {
    throw statusError("SumUp payment reference is required", 400);
  }
  const idx = reference.lastIndexOf(":");
  if (idx === -1) {
    return { readerId: null, checkoutId: assertCheckoutId(reference) };
  }
  return {
    readerId: assertReaderId(reference.slice(0, idx)),
    checkoutId: assertCheckoutId(reference.slice(idx + 1)),
  };
}

function mapSumupError(status, body) {
  const errors = body?.errors || {};
  const type = errors.type || body?.type;
  const detail = errors.detail || body?.detail || body?.title || "";

  if (status === 401 || status === 403) {
    return statusError("SumUp rejected the API key", 503, {
      code: "SUMUP_UNAUTHORIZED",
    });
  }
  if (type === "READER_OFFLINE" || /offline/i.test(detail)) {
    return statusError(
      "SumUp terminal is offline. Check Wi-Fi and try again.",
      400,
      { code: "SUMUP_READER_OFFLINE" }
    );
  }
  if (type === "READER_BUSY" || /pending checkout/i.test(detail)) {
    return statusError(
      "SumUp terminal is busy. Wait a moment and try again.",
      409,
      { code: "SUMUP_READER_BUSY" }
    );
  }
  if (status === 404) {
    return statusError("SumUp reader or checkout not found", 400, {
      code: "SUMUP_NOT_FOUND",
    });
  }
  if (status >= 500) {
    return statusError("SumUp is unavailable", 503, {
      code: "SUMUP_UNAVAILABLE",
    });
  }
  return statusError(
    detail ? `SumUp request failed: ${detail}` : "SumUp request failed",
    status >= 400 && status < 500 ? 400 : 503,
    { code: type }
  );
}

async function sumupFetch(config, path, { method = "GET", body, fetchFn } = {}) {
  const fetchImpl = fetchFn || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const url = `${API_BASE}${path}`;

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

    if (res.status === 204 || res.status === 202) {
      const payload = await res.json().catch(() => ({}));
      return payload && Object.keys(payload).length ? payload : null;
    }

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.warn(
        { status: res.status, path, type: payload.errors?.type },
        "SumUp request failed"
      );
      throw mapSumupError(res.status, payload);
    }
    return payload;
  } catch (err) {
    if (err.status) throw err;
    const timedOut = err.name === "AbortError";
    throw statusError(
      timedOut
        ? `SumUp request timed out after ${TIMEOUT_MS}ms`
        : "SumUp is unreachable",
      503,
      { code: "SUMUP_UNAVAILABLE" }
    );
  } finally {
    clearTimeout(timer);
  }
}

function merchantPath(config, suffix) {
  const merchantCode = String(config.merchant_code || "").trim();
  if (!merchantCode) {
    throw statusError("SumUp merchant code is not configured", 503);
  }
  return `/v0.1/merchants/${encodeURIComponent(merchantCode)}${suffix}`;
}

function shapeReader(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    model: row.device?.model || null,
    serial: row.device?.identifier || null,
  };
}

function shapeCheckout(payload, readerId) {
  const data = payload?.data || payload || {};
  const amount = data.total_amount || {};
  return {
    readerId,
    checkoutId: data.checkout_id || null,
    clientTransactionId: data.client_transaction_id || null,
    status: data.status || "pending",
    amountCents: Number(amount.value) || null,
    currency: amount.currency || "EUR",
    validUntil: data.valid_until || null,
  };
}

async function listReaders(config, { fetchFn } = {}) {
  if (!config?.api_key) {
    throw statusError("SumUp is not configured", 503);
  }
  const payload = await sumupFetch(config, merchantPath(config, "/readers"), {
    fetchFn,
  });
  const items = Array.isArray(payload) ? payload : payload?.items || [];
  return items.map(shapeReader);
}

async function pairReader(config, { pairingCode, name }, { fetchFn } = {}) {
  if (!config?.api_key) {
    throw statusError("SumUp is not configured", 503);
  }
  const code = String(pairingCode || "").trim().toUpperCase();
  if (code.length < 8 || code.length > 9) {
    throw statusError("Pairing code must be 8 or 9 characters", 400);
  }
  const payload = await sumupFetch(config, merchantPath(config, "/readers"), {
    method: "POST",
    body: {
      pairing_code: code,
      name: String(name || "Register").trim() || "Register",
    },
    fetchFn,
  });
  return shapeReader(payload);
}

async function createReaderCheckout(
  config,
  readerId,
  { amountCents, description },
  { fetchFn } = {}
) {
  if (!config?.api_key) {
    throw statusError("SumUp is not configured", 503);
  }
  const id = assertReaderId(readerId);
  const payload = await sumupFetch(
    config,
    merchantPath(config, `/readers/${encodeURIComponent(id)}/checkout`),
    {
      method: "POST",
      body: {
        total_amount: {
          currency: "EUR",
          minor_unit: 2,
          value: amountCents,
        },
        ...(description ? { description: String(description).slice(0, 128) } : {}),
      },
      fetchFn,
    }
  );
  return shapeCheckout(payload, id);
}

async function getReaderCheckout(config, readerId, checkoutId, { fetchFn } = {}) {
  if (!config?.api_key) {
    throw statusError("SumUp is not configured", 503);
  }
  const rid = assertReaderId(readerId);
  const cid = assertCheckoutId(checkoutId);
  const payload = await sumupFetch(
    config,
    merchantPath(
      config,
      `/readers/${encodeURIComponent(rid)}/checkout/${encodeURIComponent(cid)}`
    ),
    { fetchFn }
  );
  return shapeCheckout(payload, rid);
}

async function terminateCheckout(config, readerId, { fetchFn } = {}) {
  if (!config?.api_key) {
    throw statusError("SumUp is not configured", 503);
  }
  const id = assertReaderId(readerId);
  await sumupFetch(
    config,
    merchantPath(config, `/readers/${encodeURIComponent(id)}/terminate`),
    { method: "POST", fetchFn }
  );
}

function assertCheckoutSucceeded(checkout, expectedAmountCents) {
  if (!checkout || checkout.status !== "successful") {
    const status = checkout?.status || "unknown";
    throw statusError(
      WAITING_STATUSES.has(status)
        ? "SumUp payment is still processing"
        : `SumUp payment is not complete (${status})`,
      400
    );
  }

  if (
    expectedAmountCents != null &&
    Number(checkout.amountCents) !== expectedAmountCents
  ) {
    throw statusError(
      "SumUp payment amount does not match the cart total",
      400
    );
  }

  return checkout;
}

function pickPairedReader(readers, requestedReaderId) {
  const paired = (readers || []).filter(
    (reader) => reader && reader.status === "paired"
  );

  if (requestedReaderId) {
    const id = assertReaderId(requestedReaderId);
    if (!paired.some((reader) => reader.id === id)) {
      throw statusError(
        "That SumUp terminal is not paired. Pick another in Charge.",
        400
      );
    }
    return id;
  }

  if (paired.length === 1) {
    return paired[0].id;
  }
  if (paired.length === 0) {
    throw statusError(
      "No SumUp terminal is paired. Pair it in Admin → Config.",
      400
    );
  }

  throw statusError("Choose which SumUp terminal to charge.", 400);
}

module.exports = {
  API_BASE,
  WAITING_STATUSES,
  eurosToCents,
  formatPaymentReference,
  parsePaymentReference,
  assertReaderId,
  assertCheckoutId,
  pickPairedReader,
  listReaders,
  pairReader,
  createReaderCheckout,
  getReaderCheckout,
  terminateCheckout,
  assertCheckoutSucceeded,
};
