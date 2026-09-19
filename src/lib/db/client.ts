/**
 * The database connection.
 *
 * One pool per process, cached on globalThis so Next's dev server does not open
 * a new pool on every hot reload.
 */

import { Pool } from "pg";
import type { QueryResultRow } from "pg";

const globalForDb = globalThis as unknown as { mendlyPool?: Pool };

export function getPool(): Pool {
  if (!globalForDb.mendlyPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Start the database with `docker compose up` " +
          "or point DATABASE_URL at a PostgreSQL instance.",
      );
    }
    globalForDb.mendlyPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      // Managed TigerData/DigitalOcean instances terminate TLS with their own
      // CA, which is not in the container's trust store.
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalForDb.mendlyPool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/** A query expected to return exactly one row, or none. */
export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Run several statements as one transaction, rolling back on any throw. */
export async function transaction<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
