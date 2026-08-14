const pool = require("../db");

async function findUserByOidcSub(keycloakId) {
  const result = await pool.query(
    `
    SELECT *
    FROM "user"
    WHERE keycloak_id = $1
      AND is_active = true
    `,
    [keycloakId]
  );

  return result.rows[0] || null;
}

async function getUserById(userId) {
  const result = await pool.query(
    `
    SELECT id, username, email, role, is_active, created_at, keycloak_id
    FROM "user"
    WHERE id = $1
      AND is_active = true
    `,
    [userId]
  );
  return result.rows[0] || null;
}

async function deactivateUser(userId) {
  const result = await pool.query(
    `
    UPDATE "user"
    SET is_active = false
    WHERE id = $1
    RETURNING id, username, is_active
    `,
    [userId]
  );
  return result.rows[0] || null;
}

async function getAllUsers() {
  const result = await pool.query(
    `
    SELECT id, username, email, role, is_active, created_at, keycloak_id
    FROM "user"
    WHERE is_active = true
    ORDER BY username ASC
    `
  );
  return result.rows;
}

async function createUser({
  username,
  email,
  keycloakId,
  role = "cashier",
  isActive = true,
}) {
  const result = await pool.query(
    `
    INSERT INTO "user" (username, email, keycloak_id, role, is_active)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, username, email, role, is_active, created_at
    `,
    [username, email, keycloakId, role, isActive]
  );

  return result.rows[0];
}

async function updateUser(userId, updates) {
  const fields = [];
  const values = [userId];
  let i = 2;

  if (updates.username !== undefined) {
    fields.push(`username = $${i++}`);
    values.push(updates.username);
  }
  if (updates.email !== undefined) {
    fields.push(`email = $${i++}`);
    values.push(updates.email);
  }
  if (updates.role !== undefined) {
    fields.push(`role = $${i++}`);
    values.push(updates.role);
  }
  if (updates.is_active !== undefined) {
    fields.push(`is_active = $${i++}`);
    values.push(updates.is_active);
  }

  if (fields.length === 0) {
    const result = await pool.query(
      `SELECT id, username, email, role, is_active, created_at, keycloak_id FROM "user" WHERE id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  const result = await pool.query(
    `
    UPDATE "user"
    SET ${fields.join(", ")}
    WHERE id = $1
    RETURNING id, username, email, role, is_active, created_at, keycloak_id
    `,
    values
  );

  return result.rows[0] || null;
}

module.exports = {
  findUserByOidcSub,
  getUserById,
  deactivateUser,
  getAllUsers,
  createUser,
  updateUser,
};
