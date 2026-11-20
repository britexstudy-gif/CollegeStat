// Nov 2026 additions: CDS / CRICOS-DUO / round-2 dataset adapters, confidence + basis, cross-source gates, value-ranked queue.
import test from "node:test";
import assert from "node:assert/strict";
import { c7Of, cdsDeadlines, cdsObservations, countryStatsOf, courseObservations, coursesOf, firstUrl, nov16bObservations } from "../scripts/data-ops/datasets";
import { basisOf, collectorFamily, scoreConfidence, trustOf, DERIVED_CAP } from "../scripts/data-ops/confidence";
import { resolveScalar } from "../scripts/data-ops/resolve";
import { crossChecks, fxErrors, rejectReasons } from "../scripts/data-ops/gates";
import { buildQueue, popularityOf } from "../scripts/data-ops/queue";
import { CuratedRecord, type FieldName, type Observation } from "../scripts/data-ops/model";

const obs = <F extends FieldName>(field: F, value: unknown, over: Partial<Observation> = {}) =>
  ({ university_id: "u1", field, value, source_url: "https://uni.example/page", retrieved_at: "2026-11-15", method: "fetched", collector: "c1",
    verified: false, academic_year: "2026/27", flags: [], note: null, input: "test", ...over }) as Observation & { university_id: string; source_url: string; retrieved_at: string };
const usd = (n: number, basis: string | null = null) => ({ amount: n, range_min: null, range_max: null, currency: "USD", period: "year" as const, usd: n, fx: null, basis });

test("CDS adapter: both record shapes, missing fields skipped, all values pass the gates", () => {
  const full = cdsObservations({
    university_id: "u1", cds_year: "2025-2026", source_url: "https://ir.uni.edu/cds.pdf (page 4)", retrieved_at: "2026-11-16",
    applicants: 1000, admitted: 100, admit_rate: 0.1, sat_ebrw_25: 700, sat_ebrw_75: 760, sat_math_25: 720, sat_math_75: 790, sat_composite_25: 1430, sat_composite_75: 1540,
    act_composite_25: 32, act_composite_75: 35, test_policy: "test_optional", gpa_avg: 3.9, c7_factors: { "Rigor of secondary school record": "Very Important", Interview: "Not Considered", Bogus: "maybe" },
    application_fee: 75, deadlines: { ED: "11/1", ED2: "1/2", RD: "1/5", ea_notify: "12/15" }, tuition: 60000, required_fees: 1500, room_board: 18000, intl_aid: { count: 200, avg: 55000, available: true },
  }, "f", null);
  const by = Object.fromEntries(full.map((o) => [o.field, o]));
  assert.equal(by.acceptance_rate.value && (by.acceptance_rate.value as { percent: number }).percent, 10, "fraction admit rate → percent");
  assert.equal(by.tuition.academic_year, "2025/26");
  assert.equal((by.tuition.value as { amount: number }).amount, 60000, "tuition only; fees separate");
  assert.equal((by.mandatory_fees.value as { amount: number }).amount, 1500);
  assert.equal(by.sat_act.value && (by.sat_act.value as { policy: string }).policy, "optional");
  assert.deepEqual(by.c7_factors.value, { rigor_of_secondary_school_record: "very_important", interview: "not_considered" });
  assert.deepEqual(by.intl_aid.value, { available: true, count: 200, avg_usd: 55000, text: "CDS H6: aid to non-resident (international) first-years" });
  assert.equal(by.tuition.source_url, "https://ir.uni.edu/cds.pdf");
  const dl = by.deadlines.value as { label: string; date: string | null; date_inferred: boolean; intake_year: number }[];
  assert.equal(dl.length, 3, "notification dates skipped");
  assert.ok(dl.some((d) => d.date === "2025-11-01" && d.intake_year === 2026 && d.date_inferred));
  for (const o of full) assert.deepEqual(rejectReasons(o), [], o.field);
  // Actual collector shape (sat_ebrw_*, nonresident_aided, ea_close) with mostly nulls.
  const sparse = cdsObservations({ university_id: "u2", cds_year: "2024-2025", source_url: "https://x.edu/cds.pdf", retrieved_at: "2026-11-16", applicants: null, admit_rate: 3.6,
    sat_ebrw_25: null, sat_math_25: 770, sat_math_75: 800, deadlines: { ea_close: "11/1", ea_notify: "12/16" }, tuition: null, intl_aid: { nonresident_aided: 741, avg_award: 81046 }, c7_factors: null }, "f", null);
  const fields = sparse.map((o) => o.field).sort();
  assert.deepEqual(fields, ["acceptance_rate", "deadlines", "intl_aid", "sat_scores"]);
  assert.ok(sparse.every((o) => o.academic_year === "2024/25" || o.field === "deadlines"));
  assert.equal(c7Of([{ factor: "Essay", importance: "important" }])?.essay, "important");
  assert.deepEqual(cdsDeadlines(null, 2026, { source_url: "", retrieved_at: "" }), []);
});

test("CRICOS/DUO: courses grouped (repeat metric = next campus), programmes + derived AUD tuition min–median–max", () => {
  const base = { source: "cricos", matched_university_id: "u1", institution_name: "Uni", retrieved_at: "2026-11-16T00:00:00Z", academic_year: "2026-27 snapshot", source_url: "https://data.gov.au/data/dataset/cricos (CRICOS Courses.csv)", currency: null };
  const rows = [
    { ...base, course_name: "Bachelor of Arts", metric: "course_total_cost", value: 90000, currency: "AUD" }, { ...base, course_name: "Bachelor of Arts", metric: "duration_years", value: 3 },
    { ...base, course_name: "Bachelor of Arts", metric: "course_total_cost", value: 120000, currency: "AUD" }, { ...base, course_name: "Bachelor of Arts", metric: "duration_years", value: 3 },
    { ...base, course_name: "Bachelor of Engineering (Honours)", metric: "course_total_cost", value: 200000, currency: "AUD" }, { ...base, course_name: "Bachelor of Engineering (Honours)", metric: "duration_years", value: 4 },
    { ...base, source: "duo-rio", matched_university_id: "u2", course_name: "Global Management", metric: "duration_years", value: 4, niveau: "HBO-BA", source_url: "https://onderwijsdata.duo.nl/x (csv)" },
    { ...base, matched_university_id: null, course_name: "Orphan", metric: "duration_years", value: 3 },
  ];
  const courses = coursesOf(rows);
  assert.equal(courses.length, 4, "same-name course at a second campus kept apart; unmatched dropped");
  const o = courseObservations(courses, "f");
  const tu = o.find((x) => x.field === "tuition" && x.university_id === "u1")!;
  const v = tu.value as { amount: number; range_min: number; range_max: number; currency: string; usd: number };
  assert.deepEqual([v.range_min, v.amount, v.range_max, v.currency], [30000, 40000, 50000, "AUD"]);
  assert.ok(v.usd > 0 && v.usd < v.amount, "converted to USD with the dated table");
  assert.equal(tu.derived, true);
  assert.equal(tu.method, "dataset");
  assert.equal(tu.academic_year, "2026/27");
  assert.deepEqual(rejectReasons(tu), []);
  assert.equal(o.filter((x) => x.field === "programmes" && x.university_id === "u1").length, 1);
  const nl = o.find((x) => x.university_id === "u2")!;
  assert.equal(nl.collector, "duo");
  assert.equal((nl.value as { degree: string }[])[0].degree, "HBO-BA");
  assert.equal(o.some((x) => x.university_id === "u2" && x.field === "tuition"), false, "DUO has no fees");
  assert.equal(firstUrl("https://a.example/x (note)"), "https://a.example/x");
});

test("round-2 datasets: university metrics → fields; origin stats (KZ/UZ/KG/TJ) → country stats", () => {
  const b = { retrieved_at: "2026-11-16T00:00:00Z", source_url: "https://www.data.go.kr/data/3071171/fileData.do", country_code: "KR", origin_country: null };
  const rows = [
    { ...b, source: "kcue", matched_university_id: "u1", metric: "tuition_undergrad_year", value: 4_000_000, currency: "KRW", academic_year: "2026 disclosure" },
    { ...b, source: "ucas", matched_university_id: "u2", metric: "applicants_by_provider", value: 500, academic_year: "2025 cycle" },
    { ...b, source: "ucas", matched_university_id: "u2", metric: "accepted_by_provider", value: 200, academic_year: "2025 cycle" },
    { ...b, source: "ucas", matched_university_id: null, country_code: "GB", origin_country: "KZ", metric: "applicants_by_domicile", value: 560, academic_year: "2025 cycle" },
    { ...b, source: "ho", matched_university_id: null, country_code: "GB", origin_country: "Uzbekistan", metric: "study_visas_granted", value: 300, academic_year: "2025 calendar year" },
    { ...b, source: "ho", matched_university_id: null, country_code: "GB", origin_country: "India", metric: "study_visas_granted", value: 9999, academic_year: "2025" },
  ];
  const o = nov16bObservations(rows, "f");
  const tu = o.find((x) => x.field === "tuition")!;
  assert.equal((tu.value as { currency: string }).currency, "KRW");
  assert.equal(tu.academic_year, "2026/27");
  assert.deepEqual(o.filter((x) => x.university_id === "u2").map((x) => x.field).sort(), ["admitted", "applicants"]);
  for (const x of o) assert.deepEqual(rejectReasons(x), [], x.field);
  const cs = countryStatsOf(rows);
  assert.deepEqual(Object.keys(cs.GB).sort(), ["KZ", "UZ"], "only Central Asian origins");
  assert.equal(cs.GB.KZ[0].value, 560);
  assert.equal(cs.GB.UZ[0].period, "2025 calendar year");
});

test("confidence: tier × freshness, agreement, disagreement, derived cap; basis text", () => {
  const ds = { method: "dataset" as const, verified: true, collector: "scorecard" };
  assert.equal(scoreConfidence({ head: { ...ds, academic_year: "2026/27" }, agreeing: [], tie: false, disagreeingResolved: 0 }), 1);
  assert.equal(scoreConfidence({ head: { ...ds, academic_year: "2025/26" }, agreeing: [], tie: false, disagreeingResolved: 0 }), 0.9);
  assert.equal(scoreConfidence({ head: { method: "fetched", verified: false, collector: "oc-shard-1", academic_year: "2026/27" }, agreeing: [], tie: false, disagreeingResolved: 0 }), 0.85);
  assert.equal(scoreConfidence({ head: { method: "snippet", verified: false, collector: "oc-shard-1", academic_year: "2026/27" }, agreeing: [], tie: false, disagreeingResolved: 0 }), 0.4);
  // No year → year of retrieval.
  assert.equal(scoreConfidence({ head: { method: "fetched", verified: false, collector: "x", academic_year: null, retrieved_at: "2026-03-01" }, agreeing: [], tie: false, disagreeingResolved: 0 }), 0.77);
  const cds = { ...ds, collector: "cds", academic_year: "2025/26" };
  assert.equal(scoreConfidence({ head: { ...ds, academic_year: "2025/26" }, agreeing: [cds], tie: false, disagreeingResolved: 0 }), 1, "independent agreement");
  assert.equal(scoreConfidence({ head: { ...ds, academic_year: "2025/26" }, agreeing: [cds], tie: true, disagreeingResolved: 0 }), 0.8, "tie costs 0.2");
  // Two shards of one collector family are not independent.
  assert.equal(collectorFamily("oc-shard-3"), collectorFamily("oc-shard-12"));
  const sh = { method: "fetched" as const, verified: false, academic_year: "2026/27" };
  assert.equal(scoreConfidence({ head: { ...sh, collector: "oc-shard-1" }, agreeing: [{ ...sh, collector: "oc-shard-2" }], tie: false, disagreeingResolved: 0 }), 0.85);
  assert.equal(scoreConfidence({ head: { ...ds, collector: "cricos", academic_year: "2026/27", derived: true }, agreeing: [], tie: false, disagreeingResolved: 0 }), DERIVED_CAP);
  assert.equal(basisOf({ head: { ...ds, academic_year: "2025/26" }, agreeing: [cds], tie: false, disagreeingResolved: 0 }), "College Scorecard 2025/26 + Common Data Set 2025-26 agree");
  assert.match(basisOf({ head: { method: "snippet", verified: false, collector: "c", academic_year: "2026/27" }, agreeing: [], tie: false, disagreeingResolved: 0 }), /check official site/);
  assert.deepEqual([trustOf(0.9), trustOf(0.7), trustOf(0.4)], ["verified", "likely", "check"]);
});

test("resolve: facts carry confidence + basis; an official source backing a snippet becomes the shown value", () => {
  const r = resolveScalar("tuition", "tuition", [
    obs("tuition", usd(48180), { method: "snippet", collector: "oc-shard-1" }),
    obs("tuition", usd(48000), { method: "dataset", verified: true, collector: "scorecard", academic_year: "2025/26", source_url: "https://collegescorecard.ed.gov/data/" }),
  ]);
  assert.equal(r.fact!.collector, "scorecard");
  assert.equal(r.fact!.confidence, 0.95);
  assert.equal(r.fact!.basis, "College Scorecard 2025/26 + search snippet 2026/27 agree");
  // CDS tuition-only agrees with Scorecard tuition + fees.
  const fees = resolveScalar("tuition", "tuition", [
    obs("tuition", usd(60000, "CDS G1: tuition 60000; required fees 1500 (tuition + fees 61500)"), { method: "dataset", verified: true, collector: "cds", academic_year: "2025/26" }),
    obs("tuition", usd(61500), { method: "dataset", verified: true, collector: "scorecard", academic_year: "2025/26", source_url: "https://collegescorecard.ed.gov/data/" }),
  ]);
  assert.equal(fees.conflicts.length, 0);
  const derived = resolveScalar("tuition", "tuition", [obs("tuition", usd(30000), { method: "dataset", verified: true, collector: "cricos", derived: true })]);
  assert.equal(derived.fact!.derived, true);
  assert.equal(derived.fact!.confidence, 0.7);
  assert.ok(CuratedRecord.shape.facts.safeParse({ tuition: derived.fact }).success);
});

test("cross-source gates: SAT gap, admit gap, impossible counts, tuition jump, FX sanity", () => {
  const sat = (r: number, m: number) => ({ reading_25: r, reading_75: r + 60, math_25: m, math_75: m + 60, average: null });
  const issues = crossChecks(
    { tuition: { value: usd(40000), collector: "scorecard", academic_year: "2025/26" }, applicants: { value: { value: 100, year: 2025 }, collector: "cds", academic_year: "2025/26" }, admitted: { value: { value: 150, year: 2025 }, collector: "cds", academic_year: "2025/26" } },
    [obs("sat_scores", sat(600, 600), { collector: "scorecard" }), obs("sat_scores", sat(640, 600), { collector: "cds" }),
      obs("acceptance_rate", { percent: 50, year: 2025 }, { collector: "scorecard" }), obs("acceptance_rate", { percent: 58, year: 2025 }, { collector: "cds" })],
    [{ field: "tuition", value: usd(30000), academic_year: "2023/24" }],
  );
  const kinds = issues.map((i) => i.kind).sort();
  assert.deepEqual(kinds, ["admit-gap", "impossible", "sat-gap", "tuition-jump"]);
  assert.deepEqual(issues.find((i) => i.kind === "impossible")!.drop, ["applicants", "admitted"]);
  assert.equal(crossChecks({}, [obs("sat_scores", sat(600, 600), { collector: "scorecard" }), obs("sat_scores", sat(620, 610), { collector: "cds" })], []).length, 0, "within 30 pts");
  // FX: USD value must equal amount × dated rate (×2 for annualised semesters).
  const fx = { GBP: { usd_per_unit: 1.3, date: "2026-11-13", source: "t" } };
  assert.deepEqual(fxErrors("tuition", { amount: 10000, range_min: null, currency: "GBP", usd: 13000, period: "year", fx: null }, fx), []);
  assert.deepEqual(fxErrors("tuition", { amount: 10000, range_min: null, currency: "GBP", usd: 26000, period: "semester", fx: null }, fx), []);
  assert.equal(fxErrors("tuition", { amount: 10000, range_min: null, currency: "GBP", usd: 10000, period: "year", fx: null }, fx).length, 1, "GBP amount copied as USD");
  assert.ok(rejectReasons(obs("sat_scores", { reading_25: 700, reading_75: 650, math_25: null, math_75: null, average: null })).some((r) => r.startsWith("impossible")));
  assert.ok(rejectReasons(obs("gpa_avg", 7)).length > 0);
});

test("queue: value ranking (target × missing weight × verify × popularity) and exact fetch lists", () => {
  const rec = (id: string, facts: Record<string, unknown>, over: Partial<CuratedRecord> = {}): CuratedRecord => ({
    id, slug: id, name: id, country_code: "GB", website: null, is_target: true, target_rank: 10, facts: facts as CuratedRecord["facts"], alternatives: {}, aliases: [], merged_ids: [], collectors: ["oc-shard-1"], ...over,
  });
  const f = (over: Record<string, unknown> = {}) => ({ value: {}, source_url: "https://u.example", retrieved_at: "2026-11-15", method: "fetched", collector: "c", confidence: 0.85, verified: false, academic_year: "2026/27", flags: [], note: null, basis: "official page", ...over });
  const all = { tuition: f(), deadlines: f(), platform: f(), ielts: f(), documents: f(), programmes: f(), intl_aid: f() };
  const q = buildQueue([
    rec("complete", all),
    rec("snippet", { ...all, tuition: f({ method: "snippet", confidence: 0.4 }) }),
    rec("missing-tuition", { ...all, tuition: undefined }),
    rec("other", { platform: f() }, { is_target: false, target_rank: null }),
    rec("us", { ...all }, { country_code: "US" }),
  ].map((r) => ({ ...r, facts: Object.fromEntries(Object.entries(r.facts).filter(([, v]) => v)) as CuratedRecord["facts"] })), new Map([["missing-tuition", 8]]));
  const ids = q.map((i) => i.id);
  assert.ok(!ids.includes("complete"));
  assert.equal(ids[0], "missing-tuition", "target missing a heavy field and popular comes first");
  const mt = q[0];
  assert.deepEqual(mt.missing, ["tuition"]);
  assert.deepEqual(mt.fetch.map((x) => [x.field, x.action]), [["tuition", "collect"]]);
  assert.equal(mt.value, 3 * 3 * popularityOf({ target_rank: 10 }, 8));
  const sn = q.find((i) => i.id === "snippet")!;
  assert.deepEqual(sn.fetch.map((x) => x.action), ["verify"]);
  const us = q.find((i) => i.id === "us")!;
  assert.deepEqual(us.missing_extra, ["sat_scores", "acceptance_rate"], "US also needs CDS fields");
  assert.ok(q.find((i) => i.id === "other")!.value < mt.value, "a target missing tuition outranks a non-target missing everything");
});
