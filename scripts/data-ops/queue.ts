// "What to collect next" queue for future Haiku/Codex collector runs.
//
//   npm run data:queue                       → data/curated/next-queue.json
//   npm run data:queue -- --shards 4 --size 40 → also data/curated/queue-shards/input-N.json
//                                                (same shape as data/review/oc-shards/input-N.json; use PROMPT.md)
//
// Ranking: value = (target ? 3 : 1) × missing-field weight × (1 + 0.5 per core fact needing verification) × popularity.
//   missing-field weight: Σ FIELD_WEIGHTS of missing core + extra fields (0.5 when only verification is needed)
//   popularity: 1 + min(1, rankings / 8) + target-list position bonus (0–1)
// Each item lists exactly what to fetch (`fetch`), so collectors only look for what is missing.
// Tiers stay as labels: (A) targets missing core fields, (B) targets whose core facts are snippet-only, stale or tied,
// (C) other researched universities missing core fields.
import { readJson, writeText } from "../ingest/lib";
import { CORE_FIELDS, type CuratedRecord, type FieldName } from "./model";
import { readNdjson } from "./check";
import { loadIdentities } from "./identity";
import { trustOf } from "./confidence";

type Fact = { method: string; flags: string[]; source_url: string; confidence?: number };

export const FIELD_WEIGHTS: Partial<Record<FieldName, number>> = {
  tuition: 3, deadlines: 3, platform: 2, ielts: 2, documents: 1.5, programmes: 1, intl_aid: 1, sat_scores: 1, acceptance_rate: 1,
};
/** Extra fields worth collecting beyond the core: everyone needs programmes and international aid; US also SAT + admit rate (Common Data Set). */
export const extraFields = (country: string | null): FieldName[] => (country === "US" ? ["programmes", "intl_aid", "sat_scores", "acceptance_rate"] : ["programmes", "intl_aid"]);
export const FETCH_HINTS: Partial<Record<FieldName, string>> = {
  tuition: "international undergraduate tuition per year for 2026/27 (else 2025/26), amount + currency, official fees page",
  deadlines: "every application round for 2027 entry with an ISO date (EA/ED/RD, UCAS, semester intakes)",
  platform: "how internationals apply: Common App, UCAS, Coalition, own portal, uni-assist…",
  ielts: "minimum IELTS / TOEFL iBT (and 2026 1–6 band) / Duolingo for international bachelor applicants",
  documents: "required application documents for international first-years",
  programmes: "bachelor programme list (name, duration in years, faculty)",
  intl_aid: "aid for international students: CDS H6 (count, average award) or the official international scholarships page",
  sat_scores: "Common Data Set 2025-26 C9 SAT 25th/75th percentiles",
  acceptance_rate: "Common Data Set 2025-26 C1 applicants / admitted",
};

export interface QueueItem {
  id: string; slug: string | null; name: string; country_code: string | null; website: string | null;
  is_target: boolean; target_rank: number | null; tier: "A" | "B" | "C"; priority: number; value: number; popularity: number;
  missing: FieldName[]; missing_extra: FieldName[];
  verify: { field: FieldName; reason: string; source_url: string }[];
  /** Exactly what a collector should fetch for this university (missing first, then verification). */
  fetch: { field: FieldName; action: "collect" | "verify"; hint: string }[];
  known_urls: string[];
}

const RESEARCH = /^(oc-shard|nov1|targets|programmes|published)/;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function popularityOf(r: Pick<CuratedRecord, "target_rank">, rankings = 0) {
  return r2(1 + Math.min(1, rankings / 8) + (r.target_rank ? Math.max(0, 205 - r.target_rank) / 204 : 0));
}

export function buildQueue(records: CuratedRecord[], rankings: Map<string, number> = new Map()): QueueItem[] {
  const items: QueueItem[] = [];
  for (const r of records) {
    const researched = r.is_target || r.collectors.some((c) => RESEARCH.test(c));
    if (!researched) continue;
    const facts = r.facts as Record<string, Fact>;
    // English: any of IELTS/TOEFL/Duolingo satisfies the "ielts" core slot.
    const has = (f: FieldName) => !!facts[f] || (f === "ielts" && !!(facts.toefl || facts.duolingo));
    const missing = CORE_FIELDS.filter((f) => !has(f));
    const missingExtra = extraFields(r.country_code).filter((f) => !has(f));
    const verify = CORE_FIELDS.filter((f) => facts[f]).flatMap((f) => {
      const x = facts[f];
      const reason = x.method === "snippet" ? "search snippet only — fetch the official page"
        : x.flags.includes("conflict-tie") ? "two sources disagree"
        : x.flags.some((fl) => fl.startsWith("xcheck:")) ? `cross-source check failed (${x.flags.filter((fl) => fl.startsWith("xcheck:")).join(", ")})`
        : x.flags.some((fl) => fl.startsWith("stale")) ? "stale"
        : x.confidence != null && trustOf(x.confidence) === "check" ? `low confidence ${x.confidence}` : null;
      return reason ? [{ field: f, reason, source_url: x.source_url }] : [];
    });
    if (!missing.length && !verify.length && !(r.is_target && missingExtra.length)) continue;
    const tier = r.is_target ? (missing.length ? "A" : "B") : "C";
    const weight = [...missing, ...missingExtra].reduce((s, f) => s + (FIELD_WEIGHTS[f] ?? 1), 0);
    const popularity = popularityOf(r, rankings.get(r.id) ?? 0);
    const value = r2((r.is_target ? 3 : 1) * Math.max(weight, 0.5) * (1 + 0.5 * verify.length) * popularity);
    const priority = (tier === "A" ? 3000 : tier === "B" ? 2000 : 1000) + missing.length * 100 + verify.length * 10 + (r.target_rank ? Math.max(0, 204 - r.target_rank) / 10 : 0);
    const known = [...new Set(Object.values(facts).map((x) => x.source_url).filter(Boolean))].sort();
    const fetch = [
      ...[...missing, ...missingExtra].sort((a, b) => (FIELD_WEIGHTS[b] ?? 1) - (FIELD_WEIGHTS[a] ?? 1)).map((f) => ({ field: f, action: "collect" as const, hint: FETCH_HINTS[f] ?? f })),
      ...verify.map((v) => ({ field: v.field, action: "verify" as const, hint: `${v.reason}: ${v.source_url}` })),
    ];
    items.push({ id: r.id, slug: r.slug, name: r.name, country_code: r.country_code, website: r.website, is_target: r.is_target, target_rank: r.target_rank,
      tier, priority: Math.round(priority * 10) / 10, value, popularity, missing, missing_extra: missingExtra, verify, fetch, known_urls: known.slice(0, 8) });
  }
  return items.sort((a, b) => a.tier.localeCompare(b.tier) || b.value - a.value || b.priority - a.priority || (a.name < b.name ? -1 : 1));
}

function main() {
  const records = readNdjson<CuratedRecord>("data/curated/universities.ndjson");
  const rankings = new Map([...loadIdentities().values()].map((i) => [i.id, i.rankings]));
  const items = buildQueue(records, rankings);
  const asOf = readJson<{ as_of: string }>("data/curated/run-report.json").as_of;
  const tiers = { A: 0, B: 0, C: 0 } as Record<string, number>;
  for (const i of items) tiers[i.tier]++;
  writeText("data/curated/next-queue.json", JSON.stringify({
    as_of: asOf, core_fields: CORE_FIELDS, prompt: "data/review/oc-shards/PROMPT.md",
    ranking: "value = (target ? 3 : 1) × Σ weight(missing core + extra fields) × (1 + 0.5 per core fact to verify) × popularity; fetch only the fields in `fetch`",
    weights: FIELD_WEIGHTS,
    tiers: { A: "target missing core fields", B: "target core fields need verification", C: "other researched university missing core fields" },
    counts: tiers, items,
  }, null, 1) + "\n");
  const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : null; };
  const shards = arg("--shards"), size = arg("--size") ?? 40;
  if (shards) for (let n = 0; n < shards; n++) {
    const slice = items.slice(n * size, (n + 1) * size).map((i) => ({ id: i.id, slug: i.slug, name: i.name, country_code: i.country_code, website: i.website, missing: [...i.missing, ...i.missing_extra], verify: i.verify.map((v) => v.field), fetch: i.fetch }));
    if (slice.length) writeText(`data/curated/queue-shards/input-${n + 1}.json`, JSON.stringify(slice, null, 1) + "\n");
  }
  console.log(JSON.stringify({ queued: items.length, tiers }));
}
if (import.meta.url === `file://${process.argv[1]}`) main();
