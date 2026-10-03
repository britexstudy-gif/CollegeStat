// Offline-first conversion; --stage is an explicit write to the private review queue.
import { readFile, stat, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { normalizeROR } from "./ror";
const args = process.argv.slice(2);
const flag = (key: string) => {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = flag("--file"),
  provenance = flag("--source"),
  country = flag("--country");
if (
  !file ||
  !provenance ||
  !/^https:\/\/(zenodo\.org|doi\.org|github\.com\/ror-community)\//.test(
    provenance,
  )
)
  throw new Error(
    "Usage: npm run ingest:ror -- --file dump_v2.json --source https://zenodo.org/records/RELEASE --country DE [--out candidates.json] [--stage]",
  );
if (country && !/^[A-Z]{2}$/.test(country))
  throw new Error("Country must be a two-letter uppercase ISO code");
if ((await stat(file)).size > 256 * 1024 * 1024)
  throw new Error(
    "Extract a country subset first; JSON input limit is 256 MiB",
  );
const input: unknown = JSON.parse(await readFile(file, "utf8"));
if (!Array.isArray(input)) throw new Error("Expected a ROR v2 JSON array");
const rows = input
  .map((r) => normalizeROR(r, country))
  .filter((r) => r !== null);
if (!args.includes("--stage")) {
  await writeFile(
    flag("--out") || "ror-candidates.json",
    JSON.stringify({ dataset_url: provenance, records: rows }, null, 2),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({ event: "ror_preview_written", records: rows.length }),
  );
} else {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.startsWith("https://") || !key)
    throw new Error("Server Supabase credentials required for --stage");
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (let i = 0; i < rows.length; i += 100) {
    const { data, error } = await db.rpc("stage_institution_candidates", {
      records: rows.slice(i, i + 100),
      dataset: provenance,
    });
    if (error)
      throw new Error(
        "ROR staging failed; completed batches are retained, reruns deduplicate",
      );
    console.log(JSON.stringify({ event: "ror_batch_staged", ...data }));
  }
}
