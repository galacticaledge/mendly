/**
 * Apply the schema, then exit. Run by the container before the server starts.
 */

import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import { getPool } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";

// Wrapped rather than using top-level await: tsx compiles these scripts as
// CommonJS, which has no top-level await.
async function main() {
  await migrate();
  console.log("Schema is up to date.");
  await getPool().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
