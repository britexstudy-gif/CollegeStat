// Publishes the datasets the Worker reads at request time (see lib/asset-datasets.ts)
// into dist/client/data. Runs after the framework build; the Worker reads them
// through the ASSETS binding. Run with tsx (part of `npm run build`).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ASSET_FILES, KEYED_DATASETS, bucketOf, bucketPath } from "../lib/asset-datasets";

const root = new URL("../", import.meta.url).pathname;
const out = join(root, "dist/client/data");
const MAX_BYTES = 20 * 1024 * 1024; // Workers assets allow 25 MiB per file.
if (!existsSync(join(root, "dist/client"))) throw new Error("dist/client is missing; run the framework build first.");
rmSync(out, { recursive: true, force: true });

const write = (file: string, text: string) => {
  const target = join(out, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  if (text.length > MAX_BYTES) throw new Error(file + " is too large for a static asset.");
};
let files = 0;

for (const entry of ASSET_FILES) {
  const names = entry.endsWith("/") ? readdirSync(join(root, "data", entry)).filter((n) => n.endsWith(".json")).map((n) => entry + n) : [entry];
  for (const name of names) {
    const source = join(root, "data", name);
    if (!existsSync(source)) throw new Error("Missing dataset: data/" + name + " (run `npm run catalogue`?)");
    if (statSync(source).size > MAX_BYTES) throw new Error(name + " is too large for a static asset.");
    mkdirSync(dirname(join(out, name)), { recursive: true });
    cpSync(source, join(out, name));
    files++;
  }
}

for (const [dataset, select] of Object.entries(KEYED_DATASETS)) {
  const records = (select as (d: unknown) => Record<string, unknown>)(JSON.parse(readFileSync(join(root, "data", dataset), "utf8")));
  const buckets = new Map<string, Record<string, unknown>>(Array.from("0123456789abcdef", (b) => [b, {}]));
  for (const [id, value] of Object.entries(records)) {
    const bucket = buckets.get(bucketOf(id));
    if (!bucket) throw new Error(dataset + ": id " + id + " has no bucket.");
    bucket[id] = value;
  }
  for (const [bucket, rows] of buckets) {
    write(bucketPath(dataset, bucket), JSON.stringify(rows));
    files++;
  }
}
console.log("Published " + files + " dataset files to dist/client/data.");
