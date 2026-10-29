// Dry-run by default; --apply stages rows in the private review queue as a signed-in staff user.
// It never approves or publishes. Staff approve each observation in Admin → Review.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { observationSchema } from "../../lib/research";
const args = process.argv.slice(2);
const flag = (key: string) => {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = flag("--file"),
  source = flag("--source"),
  apply = args.includes("--apply");
if (!file)
  throw new Error(
    "Usage: npm run ingest:review -- --file data/review/BATCH/observations.json [--source DATA_SOURCE_UUID --apply]",
  );
const input: unknown = JSON.parse(await readFile(file, "utf8"));
if (!Array.isArray(input)) throw new Error("Expected an array of observations");
const parsed = input.map((row) => observationSchema.safeParse(row));
const invalid = parsed.flatMap((r, i) => (r.success ? [] : [i]));
if (invalid.length)
  throw new Error(`Invalid observation rows: ${invalid.join(", ")}. Nothing was staged.`);
const rows = parsed.map((r) => r.data!);
const universities = new Set(rows.map((r) => r.university_id)).size;
if (!apply) {
  console.log(
    JSON.stringify({ mode: "dry-run", observations: rows.length, universities }),
  );
  process.exit(0);
}
const url = process.env.SUPABASE_URL,
  key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  token = process.env.STAFF_ACCESS_TOKEN;
if (!url?.startsWith("https://") || !key || !token)
  throw new Error(
    "SUPABASE_URL, the publishable key and a current STAFF_ACCESS_TOKEN are required",
  );
if (!source || !/^[0-9a-f-]{36}$/i.test(source))
  throw new Error("--source must be the UUID of a registered official data source");
// A staff user token keeps is_admin() and audit attribution; the service-role key is not accepted here.
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${token}` } },
});
let accepted = 0,
  duplicates = 0;
for (let i = 0; i < rows.length; i += 25) {
  const { data, error } = await db.rpc("stage_observations", {
    source,
    rows: rows.slice(i, i + 25),
  });
  if (error) throw new Error(`staging_failed at row ${i}`);
  accepted += data.accepted;
  duplicates += data.duplicates;
}
console.log(JSON.stringify({ mode: "staged", accepted, duplicates }));
