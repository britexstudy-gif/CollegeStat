// Builds the D1 public catalogue from the Supabase export (scripts/d1/export-supabase.mjs).
//
//   node --import tsx scripts/d1/build-d1.ts
//
// Output: data/d1-build/NN.sql, applied in order with
//   wrangler d1 execute collegestat --remote --file=data/d1-build/NN.sql
//
// Each published university becomes:
//   uni_blob kind 'doc'  - the row PostgREST returned for universitySelect (gzip, base64, in parts)
//   uni_blob kind 'card' - the row for discoverySelect
//   uni_facts           - filter/sort values computed with the app's own TypeScript (lib/research)
// Rows hidden from anonymous readers by Supabase row-level security are left out the same way.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { normalizeUniversity, languageMinimum, countryName, type University } from "../../lib/domain";
import { valueOf } from "../../lib/research";
import { universityRanks, rankingPublishers } from "../../lib/ranking-highlights";
import { normalizeSearch } from "../../lib/search-text";

type Row = Record<string, unknown> & { id: string };
const IN = new URL("../../data/d1-export/", import.meta.url);
const OUT = new URL("../../data/d1-build/", import.meta.url);
const PART = 90_000; // D1 caps one SQL statement at 100 KB.
const FILE_BYTES = 40_000_000;

function load(table: string): Row[] {
  // --local reads data/generated/catalogue instead of the Supabase export.
  if (process.argv.includes("--local")) return [];
  const file = new URL(table + ".ndjson", IN);
  if (!existsSync(file)) throw new Error(`missing export: ${table}`);
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}
const verified = (r: Row) => !("verification_status" in r) || r.verification_status === "verified";
function byUni(rows: Row[]) {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.university_id as string;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

const LOCAL = process.argv.includes("--local");
const CAT = new URL("../../data/generated/catalogue/", import.meta.url);
const readJSON = (u: URL) => JSON.parse(readFileSync(u, "utf8"));
/** --local: the bundled catalogue (data/generated/catalogue) plus the Nov 18
 * gap-fill rows that were imported into Supabase but not into data/published. */
function localDocs(): Row[] {
  const docs: Row[] = [];
  for (let i = 0; existsSync(new URL(`shard-${String(i).padStart(2, "0")}.json`, CAT)); i++)
    for (const u of Object.values(readJSON(new URL(`shard-${String(i).padStart(2, "0")}.json`, CAT))) as Row[])
      if (u.published !== false) docs.push(u);
  const gap = readJSON(new URL("../../data/review/codex-gaps-nov18/import/rows.json", import.meta.url)) as Record<string, Row[]>;
  const gapSources = new Map(gap.data_sources.map((r) => [r.id, r]));
  const byId = new Map(docs.map((d) => [d.id, d]));
  let added = 0;
  for (const t of ["requirements", "costs", "deadlines", "admissions"]) {
    for (const r of gap[t] || []) {
      const doc = byId.get(r.university_id as string);
      if (!doc || !verified(r)) continue;
      const list = ((doc[t] as Row[]) ||= []);
      if (list.some((x) => x.id === r.id)) continue;
      list.push({ ...r, data_sources: gapSources.get(r.source_id as string) ?? null });
      added++;
    }
  }
  console.log(`local catalogue: ${docs.length} universities, ${added} Nov 18 rows added`);
  return docs;
}
const universities = LOCAL ? localDocs() : load("universities").filter((u) => u.published === true);
const sources = new Map(load("data_sources").map((r) => [r.id, r]));
const src = (r: Row): Row => ({ ...r, data_sources: r.source_id ? sources.get(r.source_id as string) ?? null : null });
const programs = new Map(load("programs").map((r) => [r.id, r]));
const providers = new Map(load("ranking_providers").map((r) => [r.id, r]));
const editions = new Map(
  load("ranking_editions")
    .filter((e) => e.permitted === true && (providers.get(e.provider_id as string) as Row | undefined)?.license_status === "permitted")
    .map((e) => [e.id, { ...e, ranking_providers: providers.get(e.provider_id as string) ?? null }]),
);
const scholarships = new Map(
  load("scholarships")
    .filter((s) => s.published === true)
    .map((s) => [s.id, src(s)]),
);

const withSource = ["data_points", "costs", "admissions", "departments", "professors", "research", "deadlines", "requirements", "financial_aid", "media"];
const children: Record<string, Map<string, Row[]>> = {};
for (const t of withSource) {
  const rows = load(t).filter(verified).filter((r) => t !== "media" || r.reuse_permitted === true);
  children[t] = byUni(rows.map(src));
}
children.campuses = byUni(load("campuses"));
children.research_metrics = byUni(load("research_metrics").filter(verified));
children.ranking_entries = byUni(
  load("ranking_entries").filter(verified).map((r) => ({ ...src(r), ranking_editions: editions.get(r.edition_id as string) ?? null })),
);
children.university_programs = byUni(
  load("university_programs").filter(verified).map((r) => ({ ...src(r), programs: programs.get(r.program_id as string) ?? null })),
);
children.university_scholarships = byUni(
  load("university_scholarships").map((r) => ({ university_id: r.university_id, scholarships: scholarships.get(r.scholarship_id as string) ?? null }) as unknown as Row),
);
const kids = (t: string, id: string) =>
  (children[t].get(id) || []).map((r) => (t === "university_scholarships" ? { scholarships: r.scholarships } : r));

const q = (v: unknown) => (v == null ? "NULL" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "NULL") : "'" + String(v).replace(/'/g, "''") + "'");
const pack = (value: unknown) => gzipSync(JSON.stringify(value), { level: 9 }).toString("base64");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
let fileNo = 0;
let buffer: string[] = [];
let bytes = 0;
const flush = () => {
  if (!buffer.length) return;
  writeFileSync(new URL(String(fileNo++).padStart(2, "0") + ".sql", OUT), buffer.join("\n") + "\n");
  buffer = [];
  bytes = 0;
};
const emit = (stmt: string) => {
  if (stmt.length > 99_000) throw new Error("statement over the D1 limit");
  buffer.push(stmt);
  bytes += stmt.length;
  if (bytes > FILE_BYTES) flush();
};

emit(`DROP TABLE IF EXISTS uni_blob;
DROP TABLE IF EXISTS uni_facts;
DROP TABLE IF EXISTS catalogue_meta;
CREATE TABLE uni_blob (id TEXT NOT NULL, kind TEXT NOT NULL, part INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (id, kind, part)) WITHOUT ROWID;
CREATE TABLE uni_facts (
  id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, country_code TEXT, region TEXT, city TEXT, type TEXT,
  search TEXT NOT NULL, aliases TEXT, brand_color TEXT,
  rank_qs INTEGER, rank_the INTEGER, rank_arwu INTEGER,
  admission REAL, tuition_usd REAL, intl REAL, grad REAL, ielts REAL, aid INTEGER NOT NULL, schol INTEGER NOT NULL,
  subjects TEXT, progs TEXT, reported TEXT
);
CREATE INDEX uni_facts_country ON uni_facts (country_code);
CREATE INDEX uni_facts_qs ON uni_facts (rank_qs, name);
CREATE TABLE catalogue_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);

const card = (u: Row, full: Record<string, unknown>) => {
  const pr = (u.profile_resources as Record<string, unknown> | null) ?? null;
  const pick = ["id", "name", "slug", "short_name", "country_code", "city", "region", "website", "logo_url", "logo_source_url", "logo_usage_notes", "university_type", "aliases"];
  return {
    ...Object.fromEntries(pick.map((k) => [k, u[k] ?? null])),
    rankings: pr?.rankings ?? u.rankings ?? null,
    institution_image_url: (pr?.institution_image_url ?? u.institution_image_url) == null ? null : String(pr?.institution_image_url ?? u.institution_image_url),
    imported_records: u.imported_records ?? null,
    data_points: full.data_points,
    costs: full.costs,
    admissions: full.admissions,
    ranking_entries: full.ranking_entries,
    media: full.media,
  };
};
const tables = ["data_points", "costs", "admissions", "university_programs", "ranking_entries", "campuses", "departments", "professors", "research", "research_metrics", "deadlines", "requirements", "financial_aid", "media", "university_scholarships"];
const year = { qs: rankingPublishers.qs.year, the: rankingPublishers.the.year, arwu: rankingPublishers.arwu.year };
let docBytes = 0;
let biggest = 0;
const countries = new Set<string>();
for (const u of universities) {
  const full: Record<string, unknown> = { ...u };
  if (!LOCAL) for (const t of tables) full[t] = kids(t, u.id);
  const n = normalizeUniversity(full as Partial<University>);
  const rank = (p: "qs" | "the" | "arwu") => universityRanks(n).find((r) => r.provider === p && r.year === year[p])?.rank ?? null;
  const tuition = valueOf(n, "tuition");
  const aid = valueOf(n, "aid_recipients").value;
  const facts = {
    id: n.id, slug: n.slug, name: n.name, country_code: n.country_code, region: n.region ?? null, city: n.city ?? null, type: n.university_type ?? null,
    search: normalizeSearch([n.name, n.short_name, n.city, countryName(n.country_code), n.region, ...(n.aliases || [])].filter(Boolean).join(" ")),
    aliases: JSON.stringify(n.aliases || []), brand_color: (u.brand_color as string) ?? null,
    rank_qs: rank("qs"), rank_the: rank("the"), rank_arwu: rank("arwu"),
    admission: valueOf(n, "admission").value, tuition_usd: tuition.currency === "USD" ? tuition.value : null,
    intl: valueOf(n, "international_students").value, grad: valueOf(n, "graduation_rate").value, ielts: languageMinimum(n, "IELTS") ?? null,
    aid: aid != null && aid > 0 ? 1 : 0,
    schol: n.university_scholarships.some((l) => l.scholarships?.published && l.scholarships.verification_status === "verified") ? 1 : 0,
    subjects: (n.publisher_students?.subjects || []).join("\n").toLowerCase() || null,
    progs: JSON.stringify(n.university_programs.map(({ programs: p }) => [((p?.subject || "") + " " + (p?.name || "")).toLowerCase(), p?.degree_level ?? null, p?.language ?? null])),
    reported: JSON.stringify((n.reported_programs || []).map((p) => [p.name.toLowerCase(), p.level ?? null])),
  };
  if (n.country_code) countries.add(n.country_code);
  const cols = Object.keys(facts);
  emit(`INSERT INTO uni_facts (${cols.join(",")}) VALUES (${cols.map((c) => q((facts as Record<string, unknown>)[c])).join(",")});`);
  for (const [kind, value] of [["doc", full], ["card", card(u, full)]] as const) {
    const body = pack(value);
    docBytes += body.length;
    biggest = Math.max(biggest, body.length);
    for (let i = 0, part = 0; i < body.length; i += PART, part++)
      emit(`INSERT INTO uni_blob (id, kind, part, body) VALUES (${q(u.id)}, '${kind}', ${part}, ${q(body.slice(i, i + PART))});`);
  }
}

// The landing's scholarship list (published, verified, by deadline).
const homeScholarships = LOCAL
  ? (readJSON(new URL("featured.json", CAT)) as { scholarships: Row[] }).scholarships.slice(0, 24)
  : [...scholarships.values()]
  .filter((s) => s.verification_status === "verified")
  .sort((a, b) => String(a.deadline ?? "9999").localeCompare(String(b.deadline ?? "9999")))
  .slice(0, 24)
  .map((s) => ({
    ...s,
    university_scholarships: load("university_scholarships")
      .filter((l) => l.scholarship_id === s.id)
      .map((l) => {
        const uni = universities.find((x) => x.id === l.university_id);
        return { university_id: l.university_id, universities: uni ? { id: uni.id, name: uni.name, slug: uni.slug } : null };
      }),
  }));
const meta = { scholarships: pack(homeScholarships), total: String(universities.length), countries: String(countries.size), built_at: new Date().toISOString() };
for (const [k, v] of Object.entries(meta)) {
  if (v.length > PART) throw new Error(`meta ${k} too large`);
  emit(`INSERT INTO catalogue_meta (key, value) VALUES (${q(k)}, ${q(v)});`);
}
flush();
console.log(`${universities.length} universities, ${countries.size} countries, ${(docBytes / 1e6).toFixed(1)} MB compressed, biggest ${(biggest / 1e3).toFixed(0)} KB, ${fileNo} SQL files`);
