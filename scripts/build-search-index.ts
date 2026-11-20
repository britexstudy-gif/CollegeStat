// Builds the unified search index (lib/search/types.ts) from the curated data
// layer (data/curated/universities.ndjson: one record per visible university,
// hidden ones are already moved to excluded.ndjson) plus display fields from the
// generated catalogue (city, logos, rankings, publisher subject areas), and the
// scholarship and article libraries.
//
// Writes data/generated/search/ (dev server and tests read it from there). With
// --publish it also writes dist/client/data/search/, which the Worker reads
// through the ASSETS binding (server/search-index.ts). Run with tsx:
//   node --import tsx scripts/build-search-index.ts [--publish]
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectPlatform, parseRouteText, type PlatformData } from "../lib/application-platforms";
import { mergeScholarships, type Raw, type ScholarshipOverlay } from "../lib/scholarships-data";
import { mergeArticles, type ArticleOverlay } from "../lib/articles-data";
import { FIELDS, NAME_ALIASES } from "../lib/search/lexicon";
import {
  SEARCH_INDEX_DIR,
  SEARCH_META_FILE,
  SEARCH_SHARDS,
  derivedSlug,
  searchShardFile,
  type IndexArticle,
  type IndexScholarship,
  type IndexUni,
  type SearchMeta,
} from "../lib/search/types";

const root = new URL("../", import.meta.url).pathname;
const read = <T>(file: string): T => JSON.parse(readFileSync(join(root, file), "utf8")) as T;
const readNdjson = <T>(file: string): T[] =>
  readFileSync(join(root, file), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
const started = Date.now();

type Fact<T = any> = { value: T; academic_year: string | null }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Curated = {
  id: string;
  slug: string;
  name: string;
  country_code: string;
  website: string | null;
  is_target: boolean;
  aliases: string[];
  facts: Record<string, Fact>;
};
type CatalogueRow = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  city: string | null;
  website: string | null;
  logo_url: string | null;
  website_icon_url: string | null;
  brand_color: string | null;
  aliases?: string[];
  rankings?: { provider: string; year: number; rank: number | null; rank_label: string; band?: boolean; national_rank?: number | null }[];
  publisher_students?: { subjects?: string[] } | null;
  university_scholarships?: { scholarships?: { slug?: string; verification_status?: string } | null }[];
};

const curatedFile = "data/curated/universities.ndjson";
if (!existsSync(join(root, curatedFile))) throw new Error("Missing " + curatedFile + " (run `npm run data:merge`).");
const curated = readNdjson<Curated>(curatedFile);
const excluded = new Set(existsSync(join(root, "data/curated/excluded.ndjson")) ? readNdjson<{ id: string }>("data/curated/excluded.ndjson").map((e) => e.id) : []);
const listFile = "data/generated/catalogue/list.json";
const catalogue = existsSync(join(root, listFile)) ? read<CatalogueRow[]>(listFile) : [];
if (!catalogue.length) console.warn("build-search-index: " + listFile + " missing; cities, logos and rankings left out.");
const catalogueById = new Map(catalogue.map((u) => [u.id, u]));
const platformData = read<PlatformData>("components/college/application-practice/platform-data.json");
const fx = Object.fromEntries(
  Object.entries(read<{ rates: Record<string, { usd_per_unit: number }> }>("data/curated/fx-rates.json").rates).map(([k, v]) => [k, v.usd_per_unit]),
);

// ── Scholarships and articles (same merge the app uses; Vite-only globs read by hand) ──
const reviewedScholarships = read<Raw[] | { records: Raw[] }>("data/review/scholarships-nov14.json");
const scholarships = mergeScholarships(
  [read<Raw[]>("data/published/scholarships-current.json"), read<{ records: Raw[] }>("data/published/scholarships-researched.json").records],
  Array.isArray(reviewedScholarships) ? reviewedScholarships : reviewedScholarships.records,
  read<ScholarshipOverlay>("data/review/content-scholarships-nov15.json"),
);
const articleDir = join(root, "data/review/articles-nov14");
const reviewedArticles = existsSync(articleDir)
  ? readdirSync(articleDir)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => {
        const d = JSON.parse(readFileSync(join(articleDir, f), "utf8"));
        return Array.isArray(d) ? d : (d?.records ?? [d]);
      })
  : [];
const articles = mergeArticles(
  read<{ records: Raw[] }>("data/published/external-articles-oct15.json").records,
  reviewedArticles,
  read<ArticleOverlay>("data/review/content-articles-nov15.json"),
);
const CENTRAL_ASIA = ["UZ", "KZ", "KG", "TJ", "TM"];
const metaScholarships: IndexScholarship[] = scholarships.map((s) => {
  const out: IndexScholarship = { s: s.slug, n: s.name };
  if (s.provider) out.pr = s.provider;
  const c = s.browseCountry || s.country;
  if (c && /^[A-Z]{2}$/.test(c)) out.c = c;
  if (s.fundingKind) out.k = s.fundingKind;
  if (s.amountHeadline) out.h = s.amountHeadline;
  if (s.deadline && /^\d{4}-\d{2}-\d{2}/.test(s.deadline)) out.d = s.deadline.slice(0, 10);
  if (s.undergrad) out.u = 1;
  if (s.openToAll || s.eligibleCodes.some((x) => CENTRAL_ASIA.includes(x))) out.ca = 1;
  return out;
});
const scholarshipIndex = new Map(metaScholarships.map((s, i) => [s.s, i]));
const metaArticles: IndexArticle[] = articles.map((a) => {
  const out: IndexArticle = { s: a.slug, t: a.title };
  if (a.summary) out.sm = a.summary.slice(0, 160);
  if (a.countryCode) out.c = a.countryCode;
  if (a.category) out.cat = a.category;
  return out;
});

// Scholarship ↔ university links: the scholarship's own list, the reviewed link file, catalogue rows.
const slugToId = new Map(curated.map((r) => [r.slug, r.id]));
const linked = new Map<string, Set<number>>();
const link = (id: string | undefined, slug: string) => {
  const i = scholarshipIndex.get(slug);
  if (!id || i == null) return;
  (linked.get(id) ?? linked.set(id, new Set()).get(id)!).add(i);
};
for (const s of scholarships) for (const u of s.universities) if (u.slug) link(slugToId.get(u.slug), s.slug);
for (const l of read<{ scholarship_slug: string; university_ids: string[] }[]>("data/review/scholarship-university-links-nov14.json"))
  for (const id of l.university_ids) link(id, l.scholarship_slug);
for (const u of catalogue)
  for (const us of u.university_scholarships ?? [])
    if (us.scholarships?.slug && us.scholarships.verification_status === "verified") link(u.id, us.scholarships.slug);

// ── Programme dictionary ──
const programmes: string[] = [];
const programmeIds = new Map<string, number>();
const programmeId = (name: string) => {
  let id = programmeIds.get(name);
  if (id == null) {
    id = programmes.push(name) - 1;
    programmeIds.set(name, id);
  }
  return id;
};
const cleanField = (name: string) => name.replace(/,\s*General$/i, "").replace(/\s+/g, " ").trim();
const junkProgramme = /programmes?\b.*\b(catalogue|finder|see )|^undergraduate programmes|^various|^see /i;

// ── Helpers ──
const autoLogos = read<Record<string, string>>("data/published/auto-logos.json");
const hostOf = (url: string) => url.replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "").replace(/[/?#].*$/, "").toLowerCase();
const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const isoDeadline = (d: { date?: string | null; intake_year?: number }) =>
  d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date >= "2026-08-01" && d.date <= "2027-12-31" ? d.date : null;
const PLATFORM_CODES: Record<string, string> = {
  common_app: "common-app",
  ucas: "ucas",
  uni_assist: "uni-assist",
  universitaly: "universitaly",
  studielink: "studielink",
  direct: "direct",
};
function bestRank(u: CatalogueRow | undefined): { r: number; rl: string } | null {
  let best: { r: number; rl: string } | null = null;
  for (const x of u?.rankings ?? []) {
    if (x.national_rank != null || x.provider === "arwu" || x.rank == null || !["qs", "the"].includes(x.provider)) continue;
    if (!best || x.rank < best.r) best = { r: x.rank, rl: `${x.provider.toUpperCase()} ${x.year} #${x.rank_label}` };
  }
  return best;
}
const aliasFor = new Map<string, string[]>();
for (const r of curated)
  for (const [re, names] of NAME_ALIASES) if (re.test(r.name)) aliasFor.set(r.id, [...(aliasFor.get(r.id) ?? []), ...names]);
for (const [re] of NAME_ALIASES) if (!curated.some((r) => re.test(r.name))) console.warn("build-search-index: no university for alias pattern " + re);

// ── Universities ──
const rows: IndexUni[] = [];
for (const r of curated) {
  if (excluded.has(r.id)) continue;
  const u = catalogueById.get(r.id);
  const f = r.facts;
  const row: IndexUni = { i: r.id, n: r.name, c: r.country_code };
  if (r.slug !== derivedSlug(r.name, r.id)) row.s = r.slug;
  const aliases = new Set<string>([...(r.aliases ?? []), ...(u?.aliases ?? []), ...(aliasFor.get(r.id) ?? [])]);
  if (u?.short_name) aliases.add(u.short_name);
  const website = r.website || u?.website;
  const host = website ? hostOf(website) : null;
  const nameKey = squash(r.name);
  for (const a of aliases)
    if (!a.trim() || a.length > 120 || squash(a) === nameKey || (host && a.toLowerCase().replace(/^www\./, "") === host)) aliases.delete(a);
  if (aliases.size) row.a = [...aliases].slice(0, 8);
  if (u?.city) row.y = u.city;
  if (host) row.w = host;
  if (u?.logo_url) row.l = u.logo_url;
  // The site icon only matters when no resolved auto logo exists (server/auto-logos.ts).
  if (u?.website_icon_url && !autoLogos[r.id]) row.li = u.website_icon_url;
  if (u?.brand_color) row.b = u.brand_color;
  const rank = bestRank(u);
  if (rank) Object.assign(row, rank);

  // Money: tuition annualised to USD; tuition-free when the source says so.
  const t = f.tuition?.value as { amount: number | null; usd: number | null; period: string; basis: string | null } | undefined;
  if (t) {
    const usd = t.usd == null ? null : t.period === "year" ? t.usd : t.period === "semester" ? t.usd * 2 : null;
    if (usd != null) row.t = Math.round(usd);
    if (usd === 0 || t.amount === 0 || /\bno tuition|tuition[- ]free|free of tuition/i.test(t.basis ?? "")) row.fr = 1;
  }
  const coa = f.cost_of_attendance?.value as { usd: number | null } | undefined;
  if (coa?.usd) row.co = Math.round(coa.usd);

  // English and tests.
  const ielts = f.ielts?.value as { status: string; overall: number | null } | undefined;
  if (ielts?.overall != null) row.ie = ielts.overall;
  else if (ielts && ["not_required", "optional"].includes(ielts.status)) row.ien = 1;
  const toefl = f.toefl?.value as { ibt: number | null } | undefined;
  if (toefl?.ibt != null) row.to = toefl.ibt;
  const sat = (f.sat_act?.value as { policy: string } | undefined)?.policy;
  if (sat === "required") row.sat = "req";
  else if (sat === "optional" || sat === "recommended") row.sat = "opt";
  else if (sat === "not_considered") row.sat = "no";
  else if (r.country_code === "US" && platformData.common_app[r.id]?.test_flexible) row.sat = "opt";
  const ar = (f.acceptance_rate?.value as { percent: number } | undefined)?.percent;
  if (ar != null) row.ar = Math.round(ar * 10) / 10;

  // Platform: curated route, else the routing rules the application practice uses.
  const pv = f.platform?.value as { code: string; label: string } | undefined;
  let platform = pv ? PLATFORM_CODES[pv.code] : undefined;
  if (pv && !platform) platform = parseRouteText(pv.label).primary ?? undefined;
  if (!platform) platform = detectPlatform({ id: r.id, name: r.name, country_code: r.country_code, city: u?.city, website }, platformData).platform.id;
  if (platform !== "direct") row.pl = platform;
  const deadlines = [
    ...new Set([
      ...((f.deadlines?.value as { date: string | null }[] | undefined) ?? []).map(isoDeadline),
      ...(platformData.dates[r.id] ?? []).map((d) => isoDeadline({ date: d.date?.slice(0, 10) })),
    ]),
  ]
    .filter((d): d is string => !!d)
    .sort();
  if (deadlines.length) row.dl = deadlines.slice(0, 6);
  const sc = linked.get(r.id);
  if (sc?.size) row.sc = [...sc];

  // Programmes (official names) and subject areas (Scorecard bachelor fields, THE subjects).
  const progs = new Set<number>();
  for (const p of (f.programmes?.value as { name: string; degree: string | null }[] | undefined) ?? []) {
    if (!p.name || junkProgramme.test(p.name)) continue;
    const name = p.name.replace(/\s+/g, " ").trim();
    progs.add(programmeId(p.degree && !name.startsWith(p.degree) ? p.degree + " " + name : name));
  }
  const subjects = new Set<number>();
  for (const name of (f.bachelor_fields?.value as string[] | undefined) ?? []) subjects.add(programmeId(cleanField(name)));
  for (const name of u?.publisher_students?.subjects ?? []) subjects.add(programmeId(cleanField(name)));
  for (const p of progs) subjects.delete(p);
  if (progs.size) row.p = [...progs];
  if (subjects.size) row.su = [...subjects];
  let mask = 0;
  for (const id of [...progs, ...subjects]) FIELDS.forEach((field, bit) => field.match.test(programmes[id]) && (mask |= 1 << bit));
  if (mask) row.f = mask;
  if (r.is_target) row.g = 1;
  rows.push(row);
}

// ── Write ──
const meta: SearchMeta = {
  version: 1,
  built: new Date().toISOString(),
  programmes,
  scholarships: metaScholarships,
  articles: metaArticles,
  fx,
  counts: { universities: rows.length, programmes: programmes.length, scholarships: metaScholarships.length, articles: metaArticles.length },
};
const shards: IndexUni[][] = Array.from({ length: SEARCH_SHARDS }, () => []);
rows.forEach((row, i) => shards[i % SEARCH_SHARDS].push(row));
const files: [string, string][] = [[SEARCH_META_FILE, JSON.stringify(meta)], ...shards.map((s, n): [string, string] => [searchShardFile(n), JSON.stringify(s)])];
const targets = [join(root, "data/generated", SEARCH_INDEX_DIR)];
if (process.argv.includes("--publish")) {
  if (!existsSync(join(root, "dist/client"))) throw new Error("dist/client is missing; run the framework build first.");
  targets.push(join(root, "dist/client/data", SEARCH_INDEX_DIR));
}
for (const dir of targets) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of files) writeFileSync(join(dir, name), text);
}
const bytes = files.reduce((a, [, t]) => a + Buffer.byteLength(t), 0);
console.log(
  `Search index: ${rows.length} universities, ${programmes.length} programme names, ${metaScholarships.length} scholarships, ${metaArticles.length} articles; ${(bytes / 1048576).toFixed(2)} MB in ${files.length} files → ${targets.map((t) => t.replace(root, "")).join(", ")} (${Date.now() - started} ms)`,
);
