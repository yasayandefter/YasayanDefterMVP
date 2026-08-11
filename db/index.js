"use strict";

const { getConfig } = require("./config");

let pool = null;

function safeError(error, fallback = "DATABASE_OPERATION_FAILED") {
  const code = error && typeof error.code === "string" ? error.code.replace(/[^A-Z0-9_]/gi, "_").slice(0, 40) : fallback;
  return new Error(code);
}

async function getPool() {
  const config = getConfig();
  if (config.storageMode !== "postgres") return null;
  if (pool) return pool;
  let pg;
  try { pg = require("pg"); } catch (_) { throw new Error("PG_DRIVER_MISSING"); }
  pool = new pg.Pool({ connectionString: config.databaseUrl, max: config.poolMax, idleTimeoutMillis: config.idleTimeoutMillis, connectionTimeoutMillis: config.connectionTimeoutMillis });
  pool.on("error", () => {});
  return pool;
}

async function query(text, values = []) {
  const connection = await getPool();
  if (!connection) throw new Error("POSTGRES_MODE_REQUIRED");
  try { return await connection.query(text, values); } catch (error) { throw safeError(error); }
}

async function withTransaction(callback) {
  const connectionPool = await getPool();
  if (!connectionPool) throw new Error("POSTGRES_MODE_REQUIRED");
  const client = await connectionPool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw safeError(error);
  } finally { client.release(); }
}

async function health() {
  const config = getConfig();
  if (config.storageMode !== "postgres") return { ok: true, mode: "json" };
  try { await query("SELECT 1 AS ok"); return { ok: true, mode: "postgres" }; }
  catch (error) { return { ok: false, mode: "postgres", errorCode: error.message }; }
}

async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

module.exports = { getPool, query, withTransaction, health, closePool, safeError };
