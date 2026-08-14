const pool = require("../db");
const logger = require("../lib/logger");

/**
 * Insert-only audit trail. There is deliberately no update/delete function
 * here — the audit_log table itself also rejects UPDATE/DELETE via a
 * database trigger (db_patch_11.sql), so history cannot be altered even by
 * a bug bypassing this service or a compromised admin account.
 *
 * Auditing failures are logged but never thrown: the primary action being
 * audited (e.g. saving a payment method, closing a register) must still
 * succeed even if writing the audit row itself fails.
 */
async function writeAuditLog(client, {
  actorUserId = null,
  actorUsername = null,
  action,
  entityType,
  entityId = null,
  details = {},
} = {}) {
  if (!action || !entityType) {
    throw new Error("logAudit requires an action and entityType");
  }

  const executor = client || pool;

  try {
    await executor.query(
      `
      INSERT INTO audit_log (actor_user_id, actor_username, action, entity_type, entity_id, details)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        actorUserId,
        actorUsername,
        action,
        entityType,
        entityId != null ? String(entityId) : null,
        JSON.stringify(details),
      ]
    );
  } catch (err) {
    logger.error(
      { err: err.message, action, entityType, entityId },
      "Failed to write audit log entry"
    );
  }
}

async function getAuditLog(filters = {}) {
  const conditions = [];
  const values = [];
  let i = 1;

  if (filters.action) {
    conditions.push(`action = $${i++}`);
    values.push(filters.action);
  }
  if (filters.entity_type) {
    conditions.push(`entity_type = $${i++}`);
    values.push(filters.entity_type);
  }
  if (filters.from) {
    conditions.push(`created_at >= $${i++}`);
    values.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`created_at <= $${i++}`);
    values.push(filters.to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 500);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  values.push(limit);
  const limitParam = i++;
  values.push(offset);
  const offsetParam = i++;

  const result = await pool.query(
    `
    SELECT *
    FROM audit_log
    ${where}
    ORDER BY created_at DESC
    LIMIT $${limitParam} OFFSET $${offsetParam}
    `,
    values
  );

  return result.rows;
}

async function getAuditLogEntry(id) {
  const result = await pool.query(`SELECT * FROM audit_log WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

module.exports = {
  logAudit: writeAuditLog,
  getAuditLog,
  getAuditLogEntry,
};
