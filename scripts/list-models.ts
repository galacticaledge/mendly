/**
 * Print the Gemini models this Backboard account can reach.
 *
 * Backboard's docs do not pin a fixed list of Google model identifiers, and
 * the catalogue moves, so guessing the string in .env is how you end up with
 * every proposal silently falling back to the rules engine. This asks.
 *
 *   npm run ai:models            # Google models only
 *   npm run ai:models -- --all   # every provider
 */

import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

const BASE = process.env.BACKBOARD_API_URL?.replace(/\/threads\/messages$/, "")
  ?? "https://app.backboard.io/api";

type Model = { name?: string; provider?: string; model_type?: string };

async function main() {
  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) {
    console.error("BACKBOARD_API_KEY is not set. Add it to .env.local and try again.");
    process.exit(1);
  }

  const all = process.argv.includes("--all");
  const response = await fetch(`${BASE}/models`, { headers: { "X-API-Key": apiKey } });

  if (!response.ok) {
    console.error(`Backboard returned ${response.status}: ${(await response.text()).slice(0, 400)}`);
    process.exit(1);
  }

  const body = (await response.json()) as { models?: Model[]; total?: number };
  const models = body.models ?? [];

  const shown = models
    .filter((model) => model.model_type === undefined || model.model_type === "llm")
    .filter((model) => {
      if (all) return true;
      const provider = (model.provider ?? "").toLowerCase();
      const name = (model.name ?? "").toLowerCase();
      return provider.includes("google") || name.includes("gemini");
    })
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  if (shown.length === 0) {
    console.log(`No matching models among ${models.length} returned. Try --all.`);
    return;
  }

  console.log(`\n${shown.length} model(s) of ${body.total ?? models.length} total:\n`);
  for (const model of shown) {
    console.log(`  provider=${model.provider ?? "?"}  name=${model.name ?? "?"}`);
  }
  console.log(`\nSet BACKBOARD_LLM_PROVIDER and BACKBOARD_MODEL in .env.local to one of these.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
