/** Merges the five admissions research files into one validated file and publishes
 * the rows that can be read without guessing.
 *
 *   node --import tsx scripts/data/merge-admissions-nov14.ts [--offline] [--no-publish]
 *
 * Writes data/review/segment-admissions-nov14-merged.json (+ fill-rate file) and
 * the NEW files data/published/{requirements,application-fees,application-dates}-segment-nov14.json.
 * Existing published files are never edited. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { checkUrl, dedupeBy, dedupeRequirements, pool, type Raw, type UrlCheck } from "./nov14-lib";
import { canonicalise, dateRow, feeRow, FIELDS, parsedIssues, requirementRow, type Canonical, type FieldName } from "./admissions-nov14-lib";

const REVIEW = "data/review";
const CACHE = `${REVIEW}/url-checks-admissions-nov14.json`;
const offline = process.argv.includes("--offline");
const read = <T = unknown>(p: string) => JSON.parse(readFileSync(p, "utf8")) as T;

const filledCount = (c: Canonical) => FIELDS.filter((k) => c.fields[k].value !== null).length;
const byId = new Map<string, Canonical>();
for (const file of ["segment-admissions-nov14.json", ...[1, 2, 3, 4].map((n) => `segment-admissions-nov14-part${n}.json`)]) {
  for (const raw of read(`${REVIEW}/${file}`) as Raw[]) {
    const c = canonicalise(raw);
    const prev = byId.get(c.university_id);
    if (!prev || filledCount(c) > filledCount(prev)) byId.set(c.university_id, c);
  }
}
const records = [...byId.values()];

const cache: Record<string, UrlCheck> = existsSync(CACHE) ? read(CACHE) : {};
const urls = [...new Set(records.flatMap((c) => c.sources))];
if (!offline) {
  const todo = urls.filter((u) => !cache[u] || cache[u].status === 0);
  console.log(`checking ${todo.length} of ${urls.length} URLs`);
  let n = 0;
  await pool(todo, 6, async (u) => {
    cache[u] = await checkUrl(u, { timeoutMs: 20000 });
    if (++n % 50 === 0) {
      writeFileSync(CACHE, JSON.stringify(cache, null, 1));
      console.log(`  ${n}/${todo.length}`);
    }
  });
  writeFileSync(CACHE, JSON.stringify(cache, null, 1));
}

type FieldStatus = "verified" | "unverified" | "empty";
const FIELD_PARSE: Partial<Record<FieldName, "ielts" | "toefl" | "fee" | "tuition" | "deadlines">> = { ielts: "ielts", toefl: "toefl", application_fee: "fee", tuition: "tuition", deadlines: "deadlines" };

const merged: Raw[] = [];
const fill: Record<string, { filled: number; verified: number; parsed?: number }> = Object.fromEntries(FIELDS.map((k) => [k, { filled: 0, verified: 0 }]));
const pub = { req: [] as Raw[], fee: [] as Raw[], date: [] as Raw[] };
for (const c of records) {
  const fields: Record<string, Raw> = {};
  let verifiedFields = 0;
  for (const k of FIELDS) {
    const l = c.fields[k];
    const issues: string[] = [];
    let status: FieldStatus = "empty";
    if (l.value !== null) {
      fill[k].filled++;
      if (!l.source_url) issues.push("no source_url");
      else if (!cache[l.source_url]) issues.push("source_url not checked");
      else if (!cache[l.source_url].ok) issues.push(`source_url: ${cache[l.source_url].reason}`);
      const pk = FIELD_PARSE[k];
      if (pk && c.parsed[pk]) issues.push(...parsedIssues({ [pk]: c.parsed[pk] } as never));
      status = issues.length ? "unverified" : "verified";
      if (status === "verified") {
        fill[k].verified++;
        verifiedFields++;
      }
    }
    fields[k] = { value: l.value, source_url: l.source_url, checked_at: l.checked_at, status, ...(issues.length ? { issues } : {}) };
    if (status === "verified" && pk(k) && c.parsed[pk(k)!]) fill[k].parsed = (fill[k].parsed ?? 0) + 1;
  }
  const failed = c.sources.filter((u) => cache[u] && !cache[u].ok);
  merged.push({
    university_id: c.university_id,
    name: c.name,
    country: c.country,
    fields,
    parsed: c.parsed,
    source_urls: c.sources.map((u) => ({ url: u, ok: cache[u]?.ok ?? null, status: cache[u]?.status ?? null })),
    verification_status: verifiedFields ? "verified" : "staged",
    ...(failed.length ? { review_note: `${failed.length} of ${c.sources.length} source URLs did not resolve; values citing them are marked unverified` } : {}),
  });
  const ok = (k: FieldName) => (fields[k] as Raw).status === "verified";
  if (ok("ielts") && c.parsed.ielts) pub.req.push(requirementRow(c, "IELTS", c.parsed.ielts, c.fields.ielts.source_url!));
  if (ok("toefl") && c.parsed.toefl) pub.req.push(requirementRow(c, "TOEFL", c.parsed.toefl, c.fields.toefl.source_url!));
  if (ok("application_fee") && c.parsed.fee) pub.fee.push(feeRow(c, c.parsed.fee, c.fields.application_fee.source_url!));
  if (ok("deadlines") && c.parsed.deadlines) for (const d of c.parsed.deadlines) pub.date.push(dateRow(c, d, c.fields.deadlines.source_url!));
}
function pk(k: FieldName) {
  return FIELD_PARSE[k];
}

writeFileSync(`${REVIEW}/segment-admissions-nov14-merged.json`, JSON.stringify(merged, null, 1) + "\n");
const total = merged.length;
const rate = Object.fromEntries(Object.entries(fill).map(([k, v]) => [k, { ...v, of: total, filled_pct: +((100 * v.filled) / total).toFixed(1), verified_pct: +((100 * v.verified) / total).toFixed(1) }]));
writeFileSync(`${REVIEW}/segment-admissions-nov14-merged-fill-rate.json`, JSON.stringify({ universities: total, verified_records: merged.filter((m) => m.verification_status === "verified").length, fields: rate }, null, 2) + "\n");
console.log(`merged ${total} universities; ${merged.filter((m) => m.verification_status === "verified").length} with at least one verified field`);
console.table(Object.fromEntries(Object.entries(rate).map(([k, v]) => [k, { filled: `${v.filled} (${v.filled_pct}%)`, verified: `${v.verified} (${v.verified_pct}%)`, parsed: v.parsed ?? 0 }])));

if (!process.argv.includes("--no-publish")) {
  const existingReq = read("data/published/requirements-current.json") as Raw[];
  const existingFee = read("data/published/application-fees-current.json") as Raw[];
  const existingDate = read("data/published/application-dates-current.json") as Raw[];
  const req = dedupeRequirements(existingReq, pub.req);
  const fee = dedupeBy(existingFee, pub.fee, (r) => `${r.university_id}|${r.category}`);
  const date = dedupeBy(existingDate, pub.date, (r) => `${r.university_id}|${String(r.due_at).slice(0, 10)}`);
  const write = (p: string, rows: Raw[]) => writeFileSync(p, JSON.stringify(rows, null, 2) + "\n");
  write("data/published/requirements-segment-nov14.json", req);
  write("data/published/application-fees-segment-nov14.json", fee);
  write("data/published/application-dates-segment-nov14.json", date);
  console.log(`published rows: requirements ${req.length} (of ${pub.req.length}, ${pub.req.length - req.length} already in requirements-current), fees ${fee.length}, dates ${date.length}`);
}
