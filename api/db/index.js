const { Pool } = require("pg");
const { loadEnv } = require("../config/env");

const env = loadEnv();

const pool = env.databaseUrl
  ? new Pool({ connectionString: env.databaseUrl })
  : new Pool({
      user: env.pg.user,
      password: env.pg.password,
      host: env.pg.host,
      port: env.pg.port,
      database: env.pg.database,
    });

module.exports = pool;
