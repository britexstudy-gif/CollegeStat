// Precomputes the local catalogue so the server never builds it at request
// time. server/global-catalogue.ts joins ~40 published files over 14k rows,
// which took seconds on every cold start and put the inputs in the worker.
// Output (data/generated/catalogue, gitignored):
//   shard-NN.json  full profiles keyed by slug, one shard per profile page
//   ids.json       id → slug
//   list.json      list-weight rows for search, explore and rankings
//   featured.json  the landing/reference catalogue
// Skips the work when nothing in data/published or the builders changed.
import { mkdirSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { shardOf, SHARD_COUNT, listRow } from "../lib/catalogue-shards";

const out = new URL("../data/generated/catalogue/", import.meta.url);
const stamp = new URL("stamp", out);
const newest = (dir: URL): number =>
  Math.max(
    0,
    ...readdirSync(dir, { withFileTypes: true }).map((e) =>
      e.isDirectory() ? newest(new URL(e.name + "/", dir)) : statSync(new URL(e.name, dir)).mtimeMs,
    ),
  );
const inputs = Math.max(
  newest(new URL("../data/published/", import.meta.url)),
  newest(new URL("../server/", import.meta.url)),
  statSync(new URL("../lib/catalogue-shards.ts", import.meta.url)).mtimeMs,
  statSync(new URL("../lib/domain.ts", import.meta.url)).mtimeMs,
);
if (!process.argv.includes("--force") && existsSync(stamp) && statSync(stamp).mtimeMs > inputs) {
  console.log("catalogue: up to date");
  process.exit(0);
}

const started = Date.now();
const { globalCatalogue, featuredCatalogue } = await import("../server/global-catalogue");
const { featuredCatalogue: landing, referenceScholarships } = await import("../server/featured-catalogue");
mkdirSync(out, { recursive: true });

const shards: Record<string, unknown>[] = Array.from({ length: SHARD_COUNT }, () => ({}));
const ids: Record<string, string> = {};
for (const u of globalCatalogue) {
  shards[shardOf(u.slug)][u.slug] = u;
  ids[u.id] = u.slug;
}
shards.forEach((shard, i) => writeFileSync(new URL(`shard-${String(i).padStart(2, "0")}.json`, out), JSON.stringify(shard)));
writeFileSync(new URL("ids.json", out), JSON.stringify(ids));
writeFileSync(new URL("list.json", out), JSON.stringify(globalCatalogue.map(listRow)));
writeFileSync(
  new URL("list.d.json.ts", out),
  'import type { University } from "@/lib/domain";\ndeclare const list: University[];\nexport default list;\n',
);
writeFileSync(
  new URL("featured.json", out),
  JSON.stringify({ reference: featuredCatalogue.map((u) => u.id), landing, scholarships: referenceScholarships }),
);
writeFileSync(stamp, new Date().toISOString());
console.log(`catalogue: ${globalCatalogue.length} profiles in ${SHARD_COUNT} shards (${Date.now() - started} ms)`);
