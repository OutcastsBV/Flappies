const pool = require("../db");
const { encrypt, decrypt } = require("../lib/crypto");
const { getMethodDefinition } = require("../payments/registry");

function toAdminShape(row) {
  const def = getMethodDefinition(row.method_key);
  const config = row.config || {};

  return {
    method_key: row.method_key,
    label: row.label,
    enabled: row.enabled,
    updated_at: row.updated_at,
    fields: def.configFields.map((field) => ({
      key: field.key,
      label: field.label,
      secret: field.secret,
      has_value: Boolean(config[field.key]),
    })),
  };
}

async function listForAdmin() {
  const result = await pool.query(
    `SELECT method_key, label, enabled, config, updated_at FROM payment_method_config ORDER BY method_key`
  );
  return result.rows.map(toAdminShape);
}

async function listEnabled() {
  const result = await pool.query(
    `SELECT method_key, label FROM payment_method_config WHERE enabled = true ORDER BY method_key`
  );
  return result.rows;
}

async function isEnabled(methodKey) {
  const result = await pool.query(
    `SELECT enabled FROM payment_method_config WHERE method_key = $1`,
    [methodKey]
  );
  return Boolean(result.rows[0]?.enabled);
}

async function updateMethod(methodKey, { enabled, config }, adminUserId) {
  const current = await pool.query(
    `SELECT method_key, label, enabled, config FROM payment_method_config WHERE method_key = $1`,
    [methodKey]
  );

  if (current.rows.length === 0) {
    const err = new Error("Unknown payment method");
    err.status = 404;
    throw err;
  }

  const def = getMethodDefinition(methodKey);
  const existingConfig = current.rows[0].config || {};
  const nextConfig = { ...existingConfig };

  if (config && typeof config === "object") {
    for (const field of def.configFields) {
      const incoming = config[field.key];
      if (incoming === undefined) continue;

      if (incoming === null || incoming === "") {
        delete nextConfig[field.key];
        continue;
      }

      nextConfig[field.key] = field.secret ? encrypt(incoming) : incoming;
    }
  }

  const willBeEnabled = enabled ?? current.rows[0].enabled;
  const missingRequired = def.configFields
    .filter((field) => field.secret)
    .some((field) => !nextConfig[field.key]);

  if (willBeEnabled && missingRequired) {
    const err = new Error(
      `Cannot enable ${def.label}: missing required configuration`
    );
    err.status = 400;
    throw err;
  }

  const result = await pool.query(
    `
    UPDATE payment_method_config
    SET enabled = COALESCE($2, enabled),
        config = $3,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = $4
    WHERE method_key = $1
    RETURNING method_key, label, enabled, config, updated_at
    `,
    [methodKey, enabled ?? null, JSON.stringify(nextConfig), adminUserId]
  );

  return toAdminShape(result.rows[0]);
}

async function getDecryptedConfig(methodKey) {
  const result = await pool.query(
    `SELECT config FROM payment_method_config WHERE method_key = $1`,
    [methodKey]
  );
  const config = result.rows[0]?.config || {};
  const def = getMethodDefinition(methodKey);
  const decrypted = {};

  for (const [key, value] of Object.entries(config)) {
    const field = def.configFields.find((f) => f.key === key);
    decrypted[key] = field?.secret ? decrypt(value) : value;
  }

  return decrypted;
}

module.exports = {
  listForAdmin,
  listEnabled,
  isEnabled,
  updateMethod,
  getDecryptedConfig,
};
