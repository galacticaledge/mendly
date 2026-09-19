/**
 * Apply the schema.
 *
 * `schema.sql` is written so it can be run repeatedly against the same
 * database: every statement is CREATE ... IF NOT EXISTS. That is enough for a
 * project at this stage, and it means starting the stack never needs a
 * migration tool or an ordering decision. A schema change that has to alter an
 * existing table is the point at which this should become real migrations.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "@/lib/db/client";

export async function migrate(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = await readFile(join(here, "schema.sql"), "utf8");
  await getPool().query(sql);
}
