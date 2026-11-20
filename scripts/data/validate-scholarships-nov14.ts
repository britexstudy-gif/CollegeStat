/** Validates data/review/scholarships-nov14.json and promotes passing records.
 *
 *   node --import tsx scripts/data/validate-scholarships-nov14.ts [--offline]
 *
 * Passing records are normalised to the loader's field names and set to
 * "verified". Failing records stay "staged" with a review_note. URL results are
 * cached in data/review/url-checks-scholarships-nov14.json so a re-run only fetches new URLs.
 * Records already verified in an earlier run are re-validated from their
 * original staged fields, which are kept under `staged_source`. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { checkUrl, isOfficialHost, pool, normalizeScholarshipRecord, validateScholarshipRecord, type Raw, type UrlCheck, type CatalogueEntry } from "./nov14-lib";

const REVIEW = "data/review/scholarships-nov14.json";
const CACHE = "data/review/url-checks-scholarships-nov14.json";
const TODAY = "2026-11-14";
const offline = process.argv.includes("--offline");

const records = JSON.parse(readFileSync(REVIEW, "utf8")) as Raw[];
const catalogue = new Map<string, CatalogueEntry>(
  (JSON.parse(readFileSync("data/generated/catalogue/list.json", "utf8")) as CatalogueEntry[]).map((u) => [u.id, { id: u.id, name: u.name, slug: u.slug }]),
);
const cache: Record<string, UrlCheck> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};

const urlsOf = (r: Raw) => [...new Set([r.source_url, r.application_url].filter((u): u is string => typeof u === "string" && !!u))];
const todo = [...new Set(records.flatMap(urlsOf))].filter((u) => !cache[u] || cache[u].status === 0);
if (!offline) {
  console.log(`checking ${todo.length} URLs`);
  await pool(todo, 3, async (u) => {
    cache[u] = await checkUrl(u, { requireOfficial: true });
  });
  writeFileSync(CACHE, JSON.stringify(cache, null, 1));
}

const out: Raw[] = [];
const tally = new Map<string, number>();
let verified = 0;
for (const rec of records) {
  const base = (rec.staged_source as Raw | undefined) ?? rec;
  const reasons: string[] = [];
  const url = String(base.source_url ?? "");
  const chk = cache[url];
  if (!chk) reasons.push("source_url not checked");
  else if (!chk.ok) reasons.push(`source_url: ${chk.reason}`);
  else {
    try {
      if (!isOfficialHost(new URL(chk.finalUrl ?? url).hostname)) reasons.push(`source_url is not on an official domain (${new URL(chk.finalUrl ?? url).hostname})`);
    } catch {
      reasons.push("source_url is not a valid URL");
    }
  }
  const verdict = validateScholarshipRecord(base, new Set(catalogue.keys()));
  reasons.push(...verdict.reasons);
  const norm = normalizeScholarshipRecord(base, catalogue, TODAY);
  if (!reasons.length) {
    verified++;
    const { review_note: _drop, ...rest } = norm;
    void _drop;
    out.push({ ...rest, verification_status: "verified", verified_at: `${TODAY}T00:00:00Z`, staged_source: base });
  } else {
    for (const why of reasons) {
      const key = why.replace(/https?:\/\/\S+|\b[0-9a-f]{8}-[0-9a-f-]{27}\b|\(.*\)/g, "").replace(/\s+/g, " ").trim();
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    const { staged_source: _s, ...plain } = base as Raw;
    void _s;
    out.push({ ...plain, verification_status: "staged", review_note: reasons.join("; ") });
  }
}
writeFileSync(REVIEW, JSON.stringify(out, null, 2) + "\n");
console.log(`verified ${verified}, rejected ${records.length - verified}`);
for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`${String(n).padStart(3)}  ${k}`);
