const fs = require("fs");
const path = require("path");
const pool = require("../db");
const logger = require("../lib/logger");

const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR ||
  path.resolve(__dirname, "../../db_migrations");

const ORDERED_FILES = [
  "db_init.sql",
  "db_patch_1.sql",
  "db_patch_2.sql",
  "db_patch_3.sql",
  "db_patch_4.sql",
  "db_patch_5.sql",
  "db_patch_6.sql",
  "db_patch_7.sql",
  "db_patch_8.sql",
  "db_patch_9.sql",
  "db_patch_10.sql",
  "db_patch_11.sql",
  "db_patch_12.sql",
  "db_patch_13.sql",
  "db_patch_14.sql",
  "db_patch_15.sql",
];

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query(
      `SELECT filename FROM schema_migrations`
    );
    const applied = new Set(rows.map((r) => r.filename));

    for (const filename of ORDERED_FILES) {
      if (applied.has(filename)) {
        logger.info({ filename }, "Migration already applied");
        continue;
      }

      const fullPath = path.join(MIGRATIONS_DIR, filename);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Migration file missing: ${fullPath}`);
      }

      const sql = fs.readFileSync(fullPath, "utf8");
      logger.info({ filename }, "Applying migration");

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (filename) VALUES ($1)`,
          [filename]
        );
        await client.query("COMMIT");
        logger.info({ filename }, "Migration applied");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
  }
}

if (require.main === module) {
  require("../config/env");
  migrate()
    .then(async () => {
      await pool.end();
      logger.info("Migrations complete");
      process.exit(0);
    })
    .catch(async (err) => {
      logger.fatal({ err: err.message }, "Migration failed");
      try {
        await pool.end();
      } catch {
        // ignore
      }
      process.exit(1);
    });
}

module.exports = { migrate };
