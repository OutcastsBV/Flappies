const fs = require("fs");
const path = require("path");
const pool = require("../../db");

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../db_migrations");

const MIGRATION_ORDER = [
  "db_init.sql",
  "db_patch_1.sql",
  "db_patch_2.sql",
  "db_patch_3.sql",
  "db_patch_4.sql",
  "db_patch_5.sql",
  "db_patch_6.sql",
  "db_patch_7.sql",
  "db_patch_8.sql",
];

async function resetDatabase() {
  await pool.query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  `);
}

async function runMigrations() {
  for (const file of MIGRATION_ORDER) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await pool.query(sql);
  }
}

async function setupDatabase() {
  await resetDatabase();
  await runMigrations();
}

module.exports = {
  setupDatabase,
  resetDatabase,
  runMigrations,
};
