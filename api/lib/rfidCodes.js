const crypto = require("crypto");

const TTL_MS = 60_000;
const codes = new Map();

function storeRfidCode(accessToken, expiresIn) {
  const code = crypto.randomBytes(32).toString("hex");
  codes.set(code, {
    accessToken,
    expiresIn,
    expiresAt: Date.now() + TTL_MS,
  });
  return code;
}

function consumeRfidCode(code) {
  const entry = codes.get(code);
  if (!entry) return null;
  codes.delete(code);
  if (Date.now() > entry.expiresAt) return null;
  return entry;
}

setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of codes) {
    if (now > entry.expiresAt) codes.delete(code);
  }
}).unref();

module.exports = { storeRfidCode, consumeRfidCode };
