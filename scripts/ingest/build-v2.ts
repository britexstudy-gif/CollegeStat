// Builds v2 rows (supabase/proposals/20261115_data_v2.sql) from the current data files
// into data/v2/<table>.csv (for COPY) + .ndjson, with validation and a coverage report.
// Re-runnable and deterministic: ids are UUID v5 of each row's natural key.
//
//   node --import tsx scripts/ingest/build-v2.ts
//
// Optional inputs are read when present (the DATA worker writes them):
//   data/review/targets-latest-nov15.json, data/review/programmes-latest-nov15.json
// When data/curated/universities.ndjson exists (npm run data:merge), the curated set replaces those
// research files for admissions/costs/requirements/programmes, and excluded universities are unpublished.
import { existsSync, statSync } from "node:fs";
import { CATALOGUE_COLUMNS, LOAD_ORDER, type CatalogueTable } from "../../server/data-v2/schema";
import { idFor, isUuid, isoDay, num, path, readJson, readJsonIfExists, recordsOf, slugify, SourceRegistry, str, writeTable, writeText } from "./lib";
import {
  academicYearOf, currencyOf, deadlinesFromValue, degreeLevelOf, englishOf, intakeYearOf, platformOf,
  requirementKindOf, roundOf, satActPolicyOf, statusOf, tuitionFromText,
} from "./normalise";
import { enforceForeignKey, validateRows, type Reject } from "./validate";
import { loadCuratedFeed } from "../data-ops/feed";

type Row = Record<string, unknown>;
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const OUT = path("data/v2");
const INTAKE = 2027;
// Timestamp of the newest input, so identical inputs give byte-identical output.
const INPUTS = [
  "data/generated/catalogue/list.json", "data/segment/targets.json", "data/review/targets-latest-nov15.json", "data/review/programmes-latest-nov15.json",
  "data/review/segment-admissions-nov14-merged.json", "data/review/programmes-costs-nov14.json", "data/review/scholarships-nov14.json",
  "data/published/scholarships-researched.json", "data/published/scholarships-current.json", "data/published/requirements-current.json",
  "data/curated/universities.ndjson", "data/curated/excluded.ndjson",
];
const NOW = new Date(Math.max(...INPUTS.filter((f) => existsSync(path(f))).map((f) => Math.floor(statSync(path(f)).mtimeMs / 1000) * 1000))).toISOString();

/** First write wins: earlier (newer / better-verified) inputs are added first. */
class Table {
  readonly rows = new Map<string, Row>();
  merged = 0;
  add(row: Row, key = String(row.id)) {
    if (this.rows.has(key)) {
      this.merged++;
      return false;
    }
    this.rows.set(key, row);
    return true;
  }
  get(key: string) {
    return this.rows.get(key);
  }
}

const sources = new SourceRegistry();
const t: Record<Exclude<CatalogueTable, "sources">, Table> = {
  universities: new Table(), programmes: new Table(), university_media: new Table(), rankings: new Table(),
  admissions: new Table(), deadlines: new Table(), costs: new Table(), application_requirements: new Table(),
  programme_requirements: new Table(), scholarships: new Table(), scholarship_universities: new Table(), essay_prompts: new Table(),
};
const prov = (fields: string[], p: { source_id: string | null; retrieved_at?: unknown; method?: unknown; origin?: unknown }) =>
  Object.fromEntries(fields.map((f) => [f, Object.fromEntries(Object.entries({
    source_id: p.source_id, retrieved_at: isoDay(p.retrieved_at), method: str(p.method), origin: str(p.origin),
  }).filter(([, v]) => v != null))]));

// ── Inputs ──
const catalogue = readJson<Any[]>("data/generated/catalogue/list.json");
const targets = readJson<{ universities: Any[] }>("data/segment/targets.json").universities;
const curated = loadCuratedFeed();
const targetsLatest = curated ? curated.latest : recordsOf<Any>(readJsonIfExists("data/review/targets-latest-nov15.json"));
const programmesLatest = curated ? curated.programmes : recordsOf<Any>(readJsonIfExists("data/review/programmes-latest-nov15.json"));
const merged = readJson<Any[]>("data/review/segment-admissions-nov14-merged.json");
const programmesCosts = readJson<Any[]>("data/review/programmes-costs-nov14.json");
const datesPublished = [...readJson<Any[]>("data/published/application-dates-current.json"), ...readJson<Any[]>("data/published/application-dates-segment-nov14.json")];
const feesPublished = [...readJson<Any[]>("data/published/application-fees-current.json"), ...readJson<Any[]>("data/published/application-fees-segment-nov14.json")];
const requirementsPublished = [...readJson<Any[]>("data/published/requirements-segment-nov14.json"), ...readJson<Any[]>("data/published/requirements-current.json")];
const logoProvenance = Object.fromEntries(
  readJson<{ records: Any[] }>("data/published/auto-logos-provenance.json").records.filter((r) => isUuid(r.university_id)).map((r) => [r.university_id, r]),
) as Record<string, Any>;
const videos = readJson<{ records: Record<string, Any[]> }>("data/published/university-videos-oct18.json").records;
const scholarshipsReviewed = readJson<Any[]>("data/review/scholarships-nov14.json");
const scholarshipsCurrent = readJson<Any[]>("data/published/scholarships-current.json");
const scholarshipsResearched = readJson<{ records: Any[]; checked_at: string }>("data/published/scholarships-researched.json");
const scholarshipLinks = readJson<Any[]>("data/review/scholarship-university-links-nov14.json");

const targetRank = new Map<string, number>(targets.map((u, i) => [u.id as string, i + 1]));
const latestById = new Map<string, Any>(targetsLatest.map((r) => [r.id, r]));
const mergedById = new Map<string, Any>(merged.map((r) => [r.university_id, r]));
const universityIds = new Set<string>();

// ── FX (rates the research used, by currency) ──
const fx = new Map<string, { rate: number; date: string | null }>();
for (const r of targetsLatest) {
  const tu = r.tuition;
  const code = currencyOf(tu?.currency).code;
  if (code && num(tu?.fx_rate_usd_per_unit) && !fx.has(code)) fx.set(code, { rate: tu.fx_rate_usd_per_unit, date: isoDay(tu.fx_date) });
}
fx.set("USD", { rate: 1, date: null });

// ── Universities, media, rankings, catalogue costs/admissions/requirements ──
for (const u of catalogue) {
  if (!isUuid(u.id)) continue;
  universityIds.add(u.id);
  const source_id = sources.add({ url: u.reference_url, retrieved_at: u.reference_retrieved_at, source_type: "registry" });
  t.universities.add({
    id: u.id, slug: u.slug, name: u.name, short_name: str(u.short_name), country_code: u.country_code, city: str(u.city),
    region: str(u.region), website: str(u.website),
    university_type: u.university_type === "Public" || u.university_type === "Private" ? u.university_type : null,
    founded_year: num(u.founded_year), latitude: num(u.latitude), longitude: num(u.longitude),
    aliases: (u.aliases ?? []).filter((a: unknown) => typeof a === "string"),
    is_target: targetRank.has(u.id), target_rank: targetRank.get(u.id) ?? null, published: u.published !== false && !curated?.excluded.has(u.id),
    source_id, provenance: prov(["identity"], { source_id, retrieved_at: u.reference_retrieved_at, origin: "catalogue" }), updated_at: NOW,
  });

  // Logos: the curated logo first, then the site icon collected from the official homepage.
  let order = 0;
  if (str(u.logo_url)) {
    const sid = sources.add({ url: u.logo_source_url, retrieved_at: u.reference_retrieved_at, source_type: "official" });
    t.university_media.add({ id: idFor("media", u.id, "logo", u.logo_url), university_id: u.id, kind: "logo", url: u.logo_url,
      sort_order: order++, source_id: sid, provenance: prov(["url"], { source_id: sid, origin: "catalogue logo_url" }) });
  }
  const icon = logoProvenance[u.id];
  if (icon && str(icon.local)) {
    const sid = sources.add({ url: icon.source, retrieved_at: icon.checked_at, source_type: "official", method: icon.kind });
    t.university_media.add({ id: idFor("media", u.id, "logo", icon.local), university_id: u.id, kind: "logo", url: icon.local,
      surface: icon.surface === "dark" ? "dark" : icon.surface === "light" ? "light" : null, sort_order: order++, source_id: sid,
      provenance: prov(["url"], { source_id: sid, retrieved_at: icon.checked_at, method: icon.kind, origin: "auto-logos-provenance" }) });
  }
  for (const m of u.media ?? []) {
    if (!str(m.url)) continue;
    const sid = sources.add({ url: m.source_url, retrieved_at: m.data_sources?.retrieved_at ?? m.verified_at, source_type: "media", licence: m.license, publisher: m.data_sources?.name });
    t.university_media.add({ id: idFor("media", u.id, m.kind === "campus" ? "campus" : "photo", m.url), university_id: u.id,
      kind: m.kind === "campus" ? "campus" : "photo", url: m.url, alt: str(m.alt), creator: str(m.creator), licence: str(m.license),
      licence_url: str(m.license_url), width: num(m.width), height: num(m.height), sort_order: order++, source_id: sid,
      provenance: prov(["url", "licence"], { source_id: sid, retrieved_at: m.verified_at, origin: "catalogue media" }) });
  }
  for (const v of videos[u.id] ?? []) {
    const sid = sources.add({ url: v.source_url, retrieved_at: v.checked_at, source_type: "media", publisher: v.channel });
    t.university_media.add({ id: idFor("media", u.id, "video", v.source_url), university_id: u.id, kind: "video", url: v.source_url,
      youtube_id: str(v.youtube_id), title: str(v.title), creator: str(v.channel), licence: "YouTube Terms of Service (embed)",
      sort_order: order++, source_id: sid, provenance: prov(["url"], { source_id: sid, retrieved_at: v.checked_at, origin: "university-videos-oct18" }) });
  }

  for (const r of u.rankings ?? []) {
    if (!str(r.provider) || !num(r.year)) continue;
    const sid = sources.add({ url: r.url, retrieved_at: `${r.year}-01-01`, source_type: "ranking", publisher: r.provider });
    t.rankings.add({ id: idFor("ranking", u.id, r.provider, r.year, "Overall", "Global"), university_id: u.id,
      publisher: String(r.provider).toLowerCase(), edition_year: r.year, subject: "Overall", region: "Global",
      rank: num(r.rank), rank_label: str(r.rank_label) ?? String(r.rank ?? ""), is_band: !!r.band,
      score: r.score == null ? null : String(r.score), url: str(r.url), source_id: sid });
  }

  // IPEDS and official cost observations already in the catalogue.
  for (const c of u.costs ?? []) {
    if (c.category === "application_fee" || num(c.amount) == null) continue;
    const category = c.category === "fees" ? "mandatory_fees" : c.category;
    const student = ["in_state", "out_of_state", "international"].includes(c.student_category) ? c.student_category : "all";
    const year = academicYearOf(c.year);
    const sid = sources.add({ url: c.data_sources?.url, retrieved_at: c.data_sources?.retrieved_at ?? c.verified_at, source_type: c.data_sources?.source_type === "government" ? "government" : "official", publisher: c.data_sources?.name, licence: c.data_sources?.license_notes });
    if (!year || !sid) continue;
    addCost({ university_id: u.id, academic_year: year, category, student_category: student, amount: c.amount, currency: c.currency,
      period: c.period === "year" ? "year" : "total", source_id: sid, provenance: prov(["amount"], { source_id: sid, retrieved_at: c.verified_at, origin: "catalogue costs" }) });
  }

  for (const a of u.admissions ?? []) {
    const year = num(a.year);
    const sid = sources.add({ url: a.data_sources?.url, retrieved_at: a.data_sources?.retrieved_at ?? a.verified_at, source_type: "government", publisher: a.data_sources?.name });
    if (!year || !sid) continue;
    t.admissions.add({ ...emptyAdmission(u.id, year), acceptance_rate: num(a.acceptance_rate), sat_min: num(a.sat_min), sat_max: num(a.sat_max),
      act_min: num(a.act_min), act_max: num(a.act_max), source_id: sid,
      provenance: prov(["acceptance_rate", "sat_min", "sat_max", "act_min", "act_max"], { source_id: sid, retrieved_at: a.verified_at, method: "IPEDS; SAT/ACT are 25th–75th percentiles of enrolled submitters", origin: "catalogue admissions" }) },
      `${u.id}|${year}|fall`);
  }
  const s = u.admission_summary;
  if (s && num(s.year) && (num(s.applicants) || num(s.admitted))) {
    const sid = sources.add({ url: s.source_url, retrieved_at: s.checked_at });
    const key = `${u.id}|${s.year}|fall`;
    const existing = t.admissions.get(key);
    const stats = { cohort_label: str(s.cohort), applicants: num(s.applicants), admitted: num(s.admitted), enrolled: num(s.enrolled),
      acceptance_rate: s.applicants && s.admitted ? Math.round((s.admitted / s.applicants) * 10000) / 100 : null };
    const p = prov(["applicants", "admitted", "enrolled", "acceptance_rate"], { source_id: sid, retrieved_at: s.checked_at, origin: "official admissions statistics" });
    if (existing) Object.assign(existing, stats, { provenance: { ...(existing.provenance as object), ...p } });
    else if (sid) t.admissions.add({ ...emptyAdmission(u.id, s.year), ...stats, source_id: sid, provenance: p }, key);
  }
  for (const r of u.requirements ?? []) addPublishedRequirement(r);
}

function emptyAdmission(university_id: string, intake_year: number): Row {
  return { id: idFor("admission", university_id, intake_year, "fall"), university_id, intake_year, intake_term: "fall", cohort_label: null,
    applicants: null, admitted: null, enrolled: null, acceptance_rate: null, platform: null, platform_note: null, application_fee: null,
    application_fee_currency: null, sat_act_policy: null, sat_min: null, sat_max: null, act_min: null, act_max: null,
    english_waiver_note: null, foundation_year: null, aid_for_internationals: null, aid_note: null, source_id: null, provenance: {} };
}


function addCost(c: Row & { university_id: string; academic_year: string; category: string; student_category: string; currency: unknown }) {
  const { code, period } = currencyOf(c.currency);
  if (!code) return;
  const amount = num(c.amount);
  const rangeMin = num(c.range_min);
  const rate = num(c.fx_rate_usd) ?? fx.get(code)?.rate ?? null;
  const base = amount ?? rangeMin;
  const usd = num(c.amount_usd) ?? (rate != null && base != null && (c.period ?? period ?? "year") === "year" ? Math.round(base * rate) : null);
  const row: Row = {
    programme_id: null, basis: null, varies_by_programme: null, ...c, range_min: rangeMin, range_max: num(c.range_max), id: idFor("cost", c.university_id, c.programme_id ?? "", c.academic_year, c.category, c.student_category),
    amount, currency: code, period: (c.period as string | undefined) ?? period ?? "year", amount_usd: usd,
    fx_rate_usd: code === "USD" ? 1 : rate, fx_date: c.fx_date ?? (code === "USD" ? null : fx.get(code)?.date ?? null),
  };
  t.costs.add(row);
}

function addPublishedRequirement(r: Any) {
  if (!isUuid(r.university_id) || r.program_id) return;
  const sid = sources.add({ url: r.source_url, retrieved_at: r.verified_at ?? r.evidence?.retrieved_at, publisher: r.data_sources?.name });
  if (!sid) return;
  let kind = requirementKindOf(r.kind, r.label);
  if (kind === "SAT" && (num(r.minimum) ?? 999) <= 36) kind = "ACT"; // "SAT or ACT" rows that state the ACT score
  const label = str(r.label) ?? kind;
  t.application_requirements.add({
    id: idFor("requirement", r.university_id, r.year ?? "", kind, label), university_id: r.university_id, intake_year: num(r.year),
    kind, status: r.required === false ? "optional" : num(r.minimum) != null || r.required ? "required" : statusOf(str(r.notes) ?? ""),
    label, minimum: num(r.minimum), component_minimum: null, note: str(r.notes), source_id: sid,
    provenance: prov(["minimum", "status"], { source_id: sid, retrieved_at: r.verified_at, origin: "published requirements" }),
  });
}

// ── 204 targets: 2027 intake ──
const catalogueIds = new Set(catalogue.map((u) => u.id as string));
const extraCurated = targetsLatest.filter((r) => !targetRank.has(r.id) && catalogueIds.has(r.id)).map((r) => ({ id: r.id }));
for (const target of [...targets, ...extraCurated]) {
  const id = target.id as string;
  const latest = latestById.get(id);
  const m = mergedById.get(id);
  const f = m?.fields ?? {};
  const field = (name: string) => (f[name] && f[name].status !== "empty" && f[name].value != null ? f[name] : null);

  // Admission row for the intake.
  const platform = latest?.platform ?? (field("application_route") && { value: f.application_route.value, source_url: f.application_route.source_url, retrieved_at: f.application_route.checked_at, origin: "nov14-merged" });
  const fee = latest?.application_fee?.value ?? m?.parsed?.fee ?? field("application_fee")?.value;
  const feeSrc = latest?.application_fee ? { ...latest.application_fee, checked_at: latest.application_fee.retrieved_at } : field("application_fee");
  const aid = field("aid")?.value;
  const waiver = field("english_waivers");
  const foundation = field("foundation_year");
  const satAct = latest?.sat_act;
  const fieldSources: [string, Any | null][] = [["platform", platform], ["application_fee", feeSrc ? { source_url: feeSrc.source_url, retrieved_at: feeSrc.checked_at } : null],
    ["aid", field("aid") ? { source_url: f.aid.source_url, retrieved_at: f.aid.checked_at } : null],
    ["english_waiver_note", waiver ? { source_url: waiver.source_url, retrieved_at: waiver.checked_at } : null],
    ["foundation_year", foundation ? { source_url: foundation.source_url, retrieved_at: foundation.checked_at } : null],
    ["sat_act_policy", satAct]];
  const provenance: Row = {};
  let primary: string | null = null;
  for (const [name, src] of fieldSources) {
    if (!src) continue;
    const sid = sources.add({ url: src.source_url, retrieved_at: src.retrieved_at ?? src.checked_at, method: src.method });
    if (!sid) continue;
    primary ??= sid;
    Object.assign(provenance, prov([name], { source_id: sid, retrieved_at: src.retrieved_at ?? src.checked_at, method: src.method, origin: src.origin }));
  }
  if (primary) {
    const feeAmount = fee && typeof fee === "object" ? num(fee.amount) : null;
    t.admissions.add({
      ...emptyAdmission(id, INTAKE), cohort_label: `${INTAKE} entry`,
      platform: platformOf(platform?.value), platform_note: str(platform?.value),
      application_fee: feeAmount, application_fee_currency: feeAmount != null ? currencyOf(fee.currency).code : null,
      sat_act_policy: satAct ? satActPolicyOf(satAct.value) : null,
      english_waiver_note: str(waiver?.value), foundation_year: typeof foundation?.value === "string" ? foundation.value : foundation ? JSON.stringify(foundation.value) : null,
      aid_for_internationals: aid && typeof aid === "object" && typeof aid.available_to_international_students === "boolean" ? aid.available_to_international_students : null,
      aid_note: aid && typeof aid === "object" ? str(aid.note) ?? str(aid.type) : str(aid),
      source_id: primary, provenance,
    }, `${id}|${INTAKE}|fall`);
  }

  // Deadlines: published ISO rows, then nov14 parsed ISO dates, then nov15 research text.
  const deadlineSrc = latest?.deadlines ?? field("deadlines");
  const dsid = deadlineSrc && sources.add({ url: deadlineSrc.source_url, retrieved_at: deadlineSrc.retrieved_at ?? deadlineSrc.checked_at, method: deadlineSrc.method });
  if (dsid) {
    const parsed = (curated ? [] : m?.parsed?.deadlines ?? []) as Any[];
    const candidates = parsed.length
      ? parsed.filter((d) => isoDay(d.date)).map((d) => ({ round: roundOf(d.label), round_label: d.label, due_date: isoDay(d.date), due_date_inferred: false, due_text: null, intake_year: intakeYearOf(d.cycle, INTAKE) }))
      : [];
    const fromText = deadlinesFromValue(deadlineSrc.value, INTAKE);
    for (const d of [...candidates, ...fromText]) addDeadline(id, d, dsid, deadlineSrc);
  }

  // Tuition (+ mandatory fees) for the intake year.
  const tu = latest?.tuition;
  const tsid = tu && sources.add({ url: tu.source_url, retrieved_at: tu.retrieved_at, method: tu.method });
  if (tu && tsid && (num(tu.amount) != null || num(tu.range_min) != null)) {
    const year = academicYearOf(tu.academic_year) ?? "2026/27";
    const p = prov(["amount", "amount_usd"], { source_id: tsid, retrieved_at: tu.retrieved_at, method: tu.method, origin: tu.origin });
    addCost({ university_id: id, academic_year: year, category: "tuition", student_category: "international", amount: tu.amount, range_min: tu.range_min,
      range_max: tu.range_max, currency: tu.currency, amount_usd: num(tu.usd), fx_rate_usd: num(tu.fx_rate_usd_per_unit), fx_date: isoDay(tu.fx_date),
      basis: str(tu.basis), source_id: tsid, provenance: p });
    if (num(tu.mandatory_fees) != null) addCost({ university_id: id, academic_year: year, category: "mandatory_fees", student_category: "international",
      amount: tu.mandatory_fees, currency: tu.currency, source_id: tsid, provenance: p });
  }

  const parsedTuition = tu && tsid && num(tu.amount) == null && num(tu.range_min) == null ? tuitionFromText(tu.value) : null;
  if (parsedTuition && tsid) {
    addCost({ university_id: id, academic_year: academicYearOf(tu.academic_year) ?? academicYearOf(tu.value) ?? "2026/27", category: "tuition",
      student_category: "international", ...parsedTuition, basis: str(tu.value), source_id: tsid,
      provenance: prov(["amount"], { source_id: tsid, retrieved_at: tu.retrieved_at, method: "parsed from research text", origin: tu.origin }) });
  }

  // English and SAT/ACT requirements.
  const en = latest?.english;
  const esid = en && sources.add({ url: en.source_url, retrieved_at: en.retrieved_at, method: en.method });
  if (en && esid) {
    for (const [kind, key] of [["IELTS", "ielts"], ["TOEFL", "toefl_ibt"], ["DUOLINGO", "duolingo"]] as const) {
      const req = englishOf(kind, en[key]);
      if (!req) continue;
      const ks = en.sources?.[key];
      const ksid = (ks && sources.add({ url: ks.source_url, retrieved_at: ks.retrieved_at, method: ks.method })) || esid;
      t.application_requirements.add({ id: idFor("requirement", id, INTAKE, kind, kind), university_id: id, intake_year: INTAKE, kind,
        status: req.status, label: kind, minimum: req.minimum, component_minimum: req.component_minimum, note: req.note ?? str(en.note),
        source_id: ksid, provenance: prov(["minimum", "status"], { source_id: ksid, retrieved_at: ks?.retrieved_at ?? en.retrieved_at, method: ks?.method ?? en.method, origin: ks?.origin ?? en.origin }) });
    }
  } else {
    for (const [kind, key] of [["IELTS", "ielts"], ["TOEFL", "toefl"], ["DUOLINGO", "duolingo"]] as const) {
      const v = field(key);
      const sid = v && sources.add({ url: v.source_url, retrieved_at: v.checked_at });
      const req = v && englishOf(kind, v.value);
      if (!sid || !req) continue;
      t.application_requirements.add({ id: idFor("requirement", id, INTAKE, kind, kind), university_id: id, intake_year: INTAKE, kind,
        status: req.status, label: kind, minimum: req.minimum, component_minimum: req.component_minimum, note: req.note, source_id: sid,
        provenance: prov(["minimum"], { source_id: sid, retrieved_at: v.checked_at, origin: "nov14-merged" }) });
    }
  }
  if (satAct && str(satAct.value)) {
    const sid = sources.add({ url: satAct.source_url, retrieved_at: satAct.retrieved_at, method: satAct.method });
    const policy = satActPolicyOf(satAct.value);
    if (sid) t.application_requirements.add({ id: idFor("requirement", id, INTAKE, "SAT", "SAT or ACT"), university_id: id, intake_year: INTAKE, kind: "SAT",
      status: policy === "not_considered" ? "not_required" : policy === "recommended" ? "optional" : policy, label: "SAT or ACT", minimum: null,
      component_minimum: null, note: satAct.value, source_id: sid, provenance: prov(["status"], { source_id: sid, retrieved_at: satAct.retrieved_at, origin: satAct.origin }) });
  }
}

// Curated acceptance rates (e.g. Scorecard 2025/26) get an admission row for their cohort year.
for (const r of targetsLatest) {
  const a = r.acceptance_rate;
  const year = num(a?.year);
  const sid = a && year && sources.add({ url: a.source_url, retrieved_at: a.retrieved_at, method: a.method });
  if (!sid || !year || !catalogueIds.has(r.id)) continue;
  const key = `${r.id}|${year}|fall`;
  const p = prov(["acceptance_rate"], { source_id: sid, retrieved_at: a.retrieved_at, method: a.method, origin: a.origin });
  const existing = t.admissions.get(key);
  if (existing) { existing.acceptance_rate = num(a.value); existing.provenance = { ...(existing.provenance as object), ...p }; }
  else t.admissions.add({ ...emptyAdmission(r.id, year), acceptance_rate: num(a.value), source_id: sid, provenance: p }, key);
}

function addDeadline(university_id: string, d: { round: string; round_label: string; due_date: string | null; due_date_inferred: boolean; due_text: string | null; intake_year: number }, source_id: string, src: Any, extra: Row = {}) {
  // Same round on the same date from two inputs is one row.
  const dupe = [...t.deadlines.rows.values()].some((r) => r.university_id === university_id && r.intake_year === d.intake_year && d.due_date && r.due_date === d.due_date && r.round === d.round);
  if (dupe) { t.deadlines.merged++; return; }
  t.deadlines.add({ id: idFor("deadline", university_id, d.intake_year, d.round_label.toLowerCase()), university_id, ...d, timezone: null, application_url: null,
    source_id, provenance: prov(["due_date"], { source_id, retrieved_at: src.retrieved_at ?? src.checked_at ?? src.verified_at, method: src.method ?? (d.due_date_inferred ? "year inferred from cycle" : null), origin: src.origin }), ...extra },
    `${university_id}|${d.intake_year}|${d.round_label.toLowerCase()}`);
}

// Published (verified) dates and fees for any university.
for (const d of datesPublished) {
  if (!isUuid(d.university_id)) continue;
  const sid = sources.add({ url: d.source_url, retrieved_at: d.verified_at, publisher: d.data_sources?.name });
  const due = isoDay(d.due_date ?? d.due_at);
  if (!sid || !due) continue;
  const intake = num(d.year) ?? intakeYearOf(d.cycle, INTAKE);
  addDeadline(d.university_id, { round: roundOf(d.title), round_label: d.title, due_date: due, due_date_inferred: false, due_text: null, intake_year: intake }, sid,
    { ...d, origin: "published application dates" }, { timezone: str(d.timezone) === "Not stated" ? null : str(d.timezone), application_url: str(d.application_url) });
}
for (const fee of feesPublished) {
  if (!isUuid(fee.university_id) || fee.category !== "application_fee" || fee.program_id) continue;
  const year = num(fee.year) ?? INTAKE;
  const row = t.admissions.get(`${fee.university_id}|${year}|fall`);
  if (row && row.application_fee == null) {
    const sid = sources.add({ url: fee.source_url, retrieved_at: fee.verified_at });
    row.application_fee = num(fee.amount);
    row.application_fee_currency = currencyOf(fee.currency).code;
    row.provenance = { ...(row.provenance as object), ...prov(["application_fee"], { source_id: sid, retrieved_at: fee.verified_at, origin: "published application fees" }) };
  }
}
for (const r of requirementsPublished) addPublishedRequirement(r);

// ── Programmes (+ their costs) ──
function addProgramme(university_id: string, p: Any, origin: string) {
  const name = str(p.name);
  const sid = sources.add({ url: p.source_url ?? p.url, retrieved_at: p.checked_at ?? p.retrieved_at ?? p.verified_at, method: p.method });
  if (!name || !isUuid(university_id)) return null;
  const degree_level = degreeLevelOf(p.degree_level ?? p.level ?? p.degree ?? p.award);
  const id = idFor("programme", university_id, name.toLowerCase(), degree_level);
  t.programmes.add({ id, university_id, name, field: str(p.field) ?? str(p.subject), degree_level, award: str(p.degree) ?? str(p.award),
    duration_years: num(p.duration_years), language: str(p.language), intake_terms: Array.isArray(p.intakes) ? p.intakes.filter((x: unknown) => typeof x === "string") : [],
    url: str(p.url), verification_status: p.verification_status === "verified" ? "verified" : "staged", source_id: sid,
    provenance: prov(["name"], { source_id: sid, retrieved_at: p.checked_at ?? p.retrieved_at, origin }) });
  for (const req of Array.isArray(p.requirements) ? p.requirements : []) {
    const rsid = sources.add({ url: req.source_url ?? p.source_url, retrieved_at: req.checked_at ?? p.checked_at ?? p.retrieved_at });
    const kind = requirementKindOf(req.kind, req.label);
    const label = str(req.label) ?? kind;
    if (!rsid) continue;
    t.programme_requirements.add({ id: idFor("programme_requirement", id, kind, label), programme_id: id, kind: kind === "ENGLISH_WAIVER" || kind === "TRANSCRIPT" || kind === "RECOMMENDATION" || kind === "ESSAY" || kind === "CV" || kind === "CAMBRIDGE" ? "OTHER" : kind,
      status: req.required === false ? "optional" : "required", label, minimum: num(req.minimum), component_minimum: num(req.component_minimum),
      note: str(req.note) ?? str(req.notes), source_id: rsid, provenance: prov(["minimum"], { source_id: rsid, origin }) });
  }
  return id;
}
for (const r of programmesLatest) {
  const uni = r.university_id ?? r.id;
  if (Array.isArray(r.programmes)) for (const p of r.programmes) addProgramme(uni, p, "programmes-latest-nov15");
  else if (r.name && isUuid(r.university_id)) addProgramme(r.university_id, r, "programmes-latest-nov15");
}
for (const r of programmesCosts) {
  for (const p of r.programmes ?? []) addProgramme(r.university_id, p, "programmes-costs-nov14");
  for (const [category, c] of [["tuition", r.tuition], ["living", r.living_cost]] as const) {
    if (!c || (num(c.amount) == null && num(c.range_min) == null)) continue;
    const sid = sources.add({ url: c.source_url ?? c.url, retrieved_at: c.checked_at });
    if (!sid) continue;
    addCost({ university_id: r.university_id, academic_year: academicYearOf(c.academic_year) ?? "2026/27", category, student_category: "international",
      amount: c.amount, range_min: c.range_min, range_max: c.range_max, currency: c.currency, basis: str(c.basis),
      varies_by_programme: typeof c.varies_by_programme === "boolean" ? c.varies_by_programme : null, source_id: sid,
      provenance: prov(["amount"], { source_id: sid, retrieved_at: c.checked_at, origin: "programmes-costs-nov14" }) });
  }
}
for (const u of catalogue) for (const up of u.university_programs ?? []) {
  const p = up.programs;
  if (p && up.verification_status === "verified") addProgramme(u.id, { ...p, source_url: up.source_url, checked_at: up.verified_at, verification_status: "verified" }, "catalogue university_programs");
}

// ── Scholarships ──
const bySlug = new Map<string, string>();
function addScholarship(s: Any, published: boolean, origin: string) {
  const name = str(s.name);
  const slug = str(s.slug) ?? (name ? slugify(name) : null);
  const sid = sources.add({ url: s.source_url ?? s.application_url, retrieved_at: s.checked_at ?? s.verified_at ?? s.data_sources?.retrieved_at, source_type: "provider", publisher: s.provider ?? s.data_sources?.organization });
  if (!name || !slug || !sid || bySlug.has(slug)) return;
  const id = isUuid(s.id) ? s.id : idFor("scholarship", slug);
  bySlug.set(slug, id);
  const nextDeadline = isoDay(s.deadline) ?? ((s.deadlines ?? []) as Any[]).map((d) => isoDay(d.date)).filter(Boolean).sort()[0] ?? null;
  t.scholarships.add({
    id, slug, name, provider: str(s.provider) ?? str(s.data_sources?.organization), description: str(s.description),
    country_code: /^[A-Z]{2}$/.test(s.country_code ?? "") ? s.country_code : null, level: str(s.level),
    funding_type: ["full", "partial", "tuition", "stipend"].includes(s.funding_type) ? s.funding_type : s.funding_type ? "other" : null,
    amount: num(s.amount), currency: currencyOf(s.currency).code, amount_note: str(s.amount_note),
    coverage: s.coverage && typeof s.coverage === "object" && !Array.isArray(s.coverage) ? s.coverage : {},
    eligible_nationalities: str(s.eligible_nationalities), central_asia_eligible: typeof s.central_asia_eligible === "boolean" ? s.central_asia_eligible : null,
    deadline: nextDeadline, deadline_note: str(s.deadline_note) ?? (((s.deadlines ?? []) as Any[]).map((d) => str(d.label)).filter(Boolean).join("; ") || null),
    application_url: str(s.application_url), intake_year: num(s.year), published, verification_status: s.verification_status === "staged" ? "staged" : "verified",
    source_id: sid, provenance: prov(["description", "deadline", "amount"], { source_id: sid, retrieved_at: s.checked_at ?? s.verified_at, origin }),
  });
  for (const link of s.university_scholarships ?? []) linkScholarship(id, link.university_id, sid);
  for (const uid of s.university_ids ?? []) linkScholarship(id, uid, sid);
}
function linkScholarship(scholarship_id: string, university_id: unknown, source_id: string | null) {
  if (!isUuid(university_id)) return;
  t.scholarship_universities.add({ scholarship_id, university_id, source_id }, `${scholarship_id}|${university_id}`);
}
for (const s of scholarshipsCurrent) addScholarship(s, true, "scholarships-current");
for (const s of scholarshipsReviewed) addScholarship(s, s.verification_status === "verified", "scholarships-nov14");
for (const s of scholarshipsResearched.records) addScholarship({ ...s, checked_at: s.checked_at ?? scholarshipsResearched.checked_at }, true, "scholarships-researched");
const nameIndex = new Map<string, string[]>();
for (const u of catalogue) nameIndex.set(u.name.toLowerCase(), [...(nameIndex.get(u.name.toLowerCase()) ?? []), u.id]);
for (const s of scholarshipsResearched.records) {
  const id = bySlug.get(str(s.slug) ?? slugify(s.name ?? ""));
  for (const n of s.university_names ?? []) {
    const ids = nameIndex.get(String(n).toLowerCase());
    if (id && ids?.length === 1) linkScholarship(id, ids[0], sources.add({ url: s.source_url, retrieved_at: s.checked_at ?? scholarshipsResearched.checked_at }));
  }
}
for (const l of scholarshipLinks) {
  const id = bySlug.get(l.scholarship_slug);
  const sid = sources.add({ url: l.source_url, retrieved_at: "2026-11-14" });
  if (id) for (const uid of l.university_ids ?? []) linkScholarship(id, uid, sid);
}

// ── Validate, enforce FKs, write ──
const rejects: Reject[] = [];
const out: Record<string, Row[]> = {};
const sourceRows = [...sources.rows.values()].map((s) => ({ ...s, created_at: NOW }));
{
  const v = validateRows("sources", sourceRows);
  out.sources = v.ok;
  rejects.push(...v.rejects);
}
const ids = (table: string) => new Set(out[table].map((r) => String(r.id)));
const srcIds = () => ids("sources");
for (const table of LOAD_ORDER.slice(1)) {
  const all = [...t[table as Exclude<CatalogueTable, "sources">].rows.values()];
  const key = table === "scholarship_universities" ? (r: Row) => `${r.scholarship_id}|${r.university_id}` : undefined;
  const validated = validateRows(table, all, key);
  rejects.push(...validated.rejects);
  let ok = validated.ok;
  const sourceNullable = ["universities", "programmes", "university_media", "rankings", "admissions", "scholarship_universities"].includes(table);
  ok = enforceForeignKey(ok, "source_id", srcIds(), sourceNullable, table, rejects);
  if (table === "programme_requirements") ok = enforceForeignKey(ok, "programme_id", ids("programmes"), false, table, rejects);
  else if (table === "scholarship_universities") {
    ok = enforceForeignKey(ok, "scholarship_id", ids("scholarships"), false, table, rejects);
    ok = enforceForeignKey(ok, "university_id", ids("universities"), false, table, rejects);
  } else if (table === "costs") {
    ok = enforceForeignKey(ok, "university_id", ids("universities"), false, table, rejects);
    ok = enforceForeignKey(ok, "programme_id", ids("programmes"), true, table, rejects);
  } else if (!["universities", "scholarships", "essay_prompts"].includes(table)) ok = enforceForeignKey(ok, "university_id", ids("universities"), false, table, rejects);
  out[table] = ok;
}
for (const table of LOAD_ORDER) writeTable(OUT, table, CATALOGUE_COLUMNS[table], out[table]);
writeText("data/v2/rejects.ndjson", rejects.map((r) => JSON.stringify({ table: r.table, id: r.id, reasons: r.reasons })).join("\n") + (rejects.length ? "\n" : ""));

// ── Coverage report for the targets ──
const has = (table: string, pred: (r: Row) => boolean) => new Set(out[table].filter(pred).map((r) => String(r.university_id)));
const checks: [string, Set<string>][] = [
  ["Tuition (international, any year)", has("costs", (r) => r.category === "tuition")],
  ["Tuition in USD", has("costs", (r) => r.category === "tuition" && r.amount_usd != null)],
  ["Deadline with a date (2027 intake)", has("deadlines", (r) => r.intake_year === INTAKE && r.due_date != null)],
  ["Deadline (date or text)", has("deadlines", (r) => r.intake_year === INTAKE)],
  ["Application platform", has("admissions", (r) => r.platform != null)],
  ["Application fee", has("admissions", (r) => r.application_fee != null)],
  ["English test rule (IELTS/TOEFL/Duolingo)", has("application_requirements", (r) => ["IELTS", "TOEFL", "DUOLINGO"].includes(String(r.kind)))],
  ["IELTS minimum (number)", has("application_requirements", (r) => r.kind === "IELTS" && r.minimum != null)],
  ["SAT/ACT policy", has("application_requirements", (r) => r.kind === "SAT")],
  ["Acceptance rate", has("admissions", (r) => r.acceptance_rate != null)],
  ["Programmes (≥1)", has("programmes", () => true)],
  ["Logo", has("university_media", (r) => r.kind === "logo")],
  ["Campus photo", has("university_media", (r) => r.kind === "campus" || r.kind === "photo")],
  ["Video", has("university_media", (r) => r.kind === "video")],
  ["Ranking (QS/THE/ARWU)", has("rankings", () => true)],
  ["Linked scholarship", has("scholarship_universities", () => true)],
  ["Essay prompts", new Set<string>()],
];
const targetIds = targets.map((u) => u.id as string);
const pct = (n: number) => `${Math.round((n / targetIds.length) * 100)}%`;
const lines = [
  "# v2 coverage — 204 Central Asia targets",
  "",
  `Generated by \`scripts/ingest/build-v2.ts\` on ${NOW.slice(0, 10)}. Inputs: catalogue list, nov14 merged admissions, programmes-costs-nov14, published dates/fees/requirements, scholarships` +
    `${targetsLatest.length ? ", targets-latest-nov15" : " (targets-latest-nov15 missing)"}${programmesLatest.length ? ", programmes-latest-nov15" : " (programmes-latest-nov15 not present yet)"}.`,
  "",
  "| Field | Targets covered | Share |",
  "|---|---:|---:|",
  ...checks.map(([label, set]) => `| ${label} | ${targetIds.filter((id) => set.has(id)).length} | ${pct(targetIds.filter((id) => set.has(id)).length)} |`),
  "",
  "## Rows written",
  "",
  "| Table | Rows |",
  "|---|---:|",
  ...LOAD_ORDER.map((table) => `| ${table} | ${out[table].length} |`),
  "",
  `Rejected rows: ${rejects.length} (see \`data/v2/rejects.ndjson\`).` + (rejects.length ? " Top reasons: " + topReasons(rejects) : ""),
  "",
  "## Targets with the most gaps",
  "",
  "| # | University | Country | Missing |",
  "|---:|---|---|---|",
  ...targets
    .map((u, i) => ({ i: i + 1, u, missing: checks.slice(0, 11).filter(([, set]) => !set.has(u.id)).map(([label]) => label.replace(/ \(.*\)$/, "")) }))
    .sort((a, b) => b.missing.length - a.missing.length || a.i - b.i)
    .slice(0, 40)
    .map(({ i, u, missing }) => `| ${i} | ${u.name} | ${u.country_code} | ${missing.join(", ")} |`),
  "",
];
writeText("data/v2/coverage.md", lines.join("\n"));
function topReasons(list: Reject[]) {
  const counts = new Map<string, number>();
  for (const r of list) for (const reason of r.reasons) {
    const k = `${r.table}: ${reason.replace(/=.*? /, "=… ")}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} (${n})`).join("; ");
}
console.log(JSON.stringify({ written: Object.fromEntries(LOAD_ORDER.map((x) => [x, out[x].length])), rejects: rejects.length,
  merged: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.merged])) }));
