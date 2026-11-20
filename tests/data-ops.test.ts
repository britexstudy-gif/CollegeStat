import test from "node:test";
import assert from "node:assert/strict";
import {
  deadlinesOf, duolingoOf, ieltsOf, methodOf, moneyOf, platformValueOf, splitEnglishText, toeflOf, toUsd, tuitionOf, yearStatus,
} from "../scripts/data-ops/normalise";
import { compare, compatible, resolveField, resolveScalar } from "../scripts/data-ops/resolve";
import { rejectReasons } from "../scripts/data-ops/gates";
import { duplicateGroups, type Identity } from "../scripts/data-ops/identity";
import { scorecardObservations, splitCsvLine, statusExclusion, usHistoryObservations } from "../scripts/data-ops/scorecard";
import { ocShards, nov14Merged } from "../scripts/data-ops/adapters";
import { jumpsBetween } from "../scripts/data-ops/check";
import { buildQueue } from "../scripts/data-ops/queue";
import { toLatestShape } from "../scripts/data-ops/feed";
import { academicYearOfDate } from "../scripts/data-ops/merge";
import type { CuratedRecord, FieldName, Observation } from "../scripts/data-ops/model";

const obs = <F extends FieldName>(field: F, value: unknown, over: Partial<Observation> = {}) =>
  ({ university_id: "u1", field, value, source_url: "https://uni.example/page", retrieved_at: "2026-11-15", method: "fetched", collector: "c1",
    verified: false, academic_year: null, flags: [], note: null, input: "test", ...over }) as Observation & { university_id: string; source_url: string; retrieved_at: string };

test("normalisers: currency → USD with the dated table, semester annualised", () => {
  const fx = { GBP: { usd_per_unit: 1.32, date: "2026-11-13", source: "ECB" } };
  assert.deepEqual(toUsd(1000, "GBP", fx), { usd: 1320, fx: fx.GBP });
  assert.equal(toUsd(1000, "XYZ", fx).usd, null);
  const t = tuitionOf({ amount: 2190, currency: "CHF", academic_year: "2026/27 (CHF 2,190 per semester)" })!;
  assert.equal(t.value.period, "semester");
  assert.ok(t.flags.includes("annualised-from-semester"));
  assert.equal(t.academic_year, "2026/27");
  assert.ok(t.value.usd! > 4000, "two semesters converted");
  const parsed = tuitionOf({ value: "USD 6,400–12,592 per year" })!;
  assert.equal(parsed.value.range_min, 6400);
  assert.equal(moneyOf({ value: 1862, note: "USD per year, fees" })?.amount, 1862);
});

test("normalisers: dates → ISO with inferred-year flag; out-of-cycle dates kept as text", () => {
  const prov = { source_url: "https://x.example", retrieved_at: "2026-11-15", method: "fetched" as const, collector: "c" };
  const d = deadlinesOf([{ round: "Early Action", date: "November 1", cycle: "Fall 2027 entry" }, { round: "Regular", date: "2027-01-05", cycle: "Class of 2031" }], prov);
  assert.equal(d[0].date, "2026-11-01");
  assert.equal(d[0].date_inferred, true);
  assert.equal(d[1].intake_year, 2027, "'Class of 2031' is not the entry year");
  const old = deadlinesOf([{ round: "Regular", date: "2024-01-05", cycle: "2027 entry" }], prov);
  assert.equal(old[0].date, null);
});

test("normalisers: IELTS, TOEFL (incl. 2026 1–6 band), Duolingo, platforms, methods", () => {
  assert.deepEqual(ieltsOf("6.5 overall, 6.0 each"), { status: "required", overall: 6.5, component: 6, text: "6.5 overall, 6.0 each" });
  assert.equal(ieltsOf("Not required (optional)")?.status, "optional");
  assert.equal(ieltsOf("Not required (optional)")?.overall, null);
  const t = toeflOf("102 overall, subscores 25+ (exams before 21 Jan 2026); 5 overall, subscores 5+ (exams on/after 21 Jan 2026)")!;
  assert.equal(t.ibt, 102);
  assert.equal(t.band_2026, 5);
  assert.equal(toeflOf({ minimum: 90, scale_note: "tests on/after 2026-01-21 minimum 5 on new 1-6 scale" })?.band_2026, 5);
  assert.equal(toeflOf(4.5)?.band_2026, 4.5);
  assert.equal(duolingoOf("135 overall (subscores 135+)")?.minimum, 135);
  const parts = splitEnglishText("TOEFL iBT 4.0 (taken on/after 21 Jan 2026; 70 before); IELTS 6.0; Duolingo 105");
  assert.equal(ieltsOf(parts.ielts)?.overall, 6);
  assert.equal(toeflOf(parts.toefl)?.band_2026, 4);
  assert.equal(toeflOf(parts.toefl)?.ibt, 70);
  assert.equal(platformValueOf("UCAS")?.code, "ucas");
  assert.equal(methodOf("search snippet - verify"), "snippet");
  assert.equal(methodOf("search-index extract of official page (not fetched directly)"), "snippet");
  assert.equal(methodOf(undefined), "fetched");
});

test("latest-data rule: 2026/27 preferred, 2025/26 accepted, older stale", () => {
  assert.equal(yearStatus("2026/27"), "preferred");
  assert.equal(yearStatus("2025/26"), "accepted");
  assert.equal(yearStatus("2024/25"), "stale");
  assert.equal(academicYearOfDate("2026-11-16"), "2026/27");
  assert.equal(academicYearOfDate("2026-03-01"), "2025/26");
});

test("conflict rules: fetched > snippet, newer year, verified dataset > research, else tie", () => {
  assert.deepEqual(compare({ method: "snippet", verified: false, academic_year: "2026/27" }, { method: "fetched", verified: false, academic_year: "2025/26" }), { winner: "b", rule: "fetched>snippet" });
  assert.deepEqual(compare({ method: "dataset", verified: true, academic_year: "2025/26" }, { method: "fetched", verified: false, academic_year: "2026/27" }), { winner: "b", rule: "newer-academic-year" });
  assert.deepEqual(compare({ method: "dataset", verified: true, academic_year: null }, { method: "snippet", verified: false, academic_year: null }), { winner: "a", rule: "verified-dataset>research" });
  assert.equal(compare({ method: "fetched", verified: false, academic_year: null }, { method: "fetched", verified: false, academic_year: null }), null);

  const usd = (n: number) => ({ amount: n, range_min: null, range_max: null, currency: "USD", period: "year" as const, usd: n, fx: null, basis: null });
  // Snippet that conflicts with an official fetched value is demoted to history.
  const r = resolveScalar("tuition", "tuition", [obs("tuition", usd(30000), { method: "snippet", collector: "a", academic_year: "2026/27" }), obs("tuition", usd(40000), { collector: "b", academic_year: "2026/27" })]);
  assert.equal((r.fact!.value as { usd: number }).usd, 40000);
  assert.equal(r.history[0].reason.includes("fetched>snippet"), true);
  // Tie → both kept and flagged.
  const tie = resolveScalar("tuition", "tuition", [obs("tuition", usd(30000), { collector: "a" }), obs("tuition", usd(40000), { collector: "b", source_url: "https://other.example" })]);
  assert.equal(tie.alternatives.length, 1);
  assert.ok(tie.fact!.flags.includes("conflict-tie"));
  // Agreement within 2% corroborates, no conflict.
  const agree = resolveScalar("tuition", "tuition", [obs("tuition", usd(30000), { collector: "a" }), obs("tuition", usd(30300), { collector: "b", source_url: "https://other.example" })]);
  assert.equal(agree.conflicts.length, 0);
  assert.ok(agree.fact!.flags.includes("corroborated:2"));
  // A more specific compatible value is agreement.
  assert.ok(compatible("ielts", { status: "required", overall: 6.5, component: null }, { status: "required", overall: null, component: null }));
});

test("history: older academic years never enter the current view", () => {
  const usd = (n: number) => ({ amount: n, range_min: null, range_max: null, currency: "USD", period: "year" as const, usd: n, fx: null, basis: null });
  const r = resolveField("tuition", [obs("tuition", usd(37700), { method: "dataset", verified: true, academic_year: "2023/24", collector: "ipeds" }), obs("tuition", usd(39490), { method: "dataset", verified: true, academic_year: "2025/26", collector: "scorecard" })]);
  assert.equal((r.fact!.value as { usd: number }).usd, 39490);
  assert.equal(r.fact!.academic_year, "2025/26");
  assert.equal(r.history.length, 1);
  assert.equal(r.history[0].academic_year, "2023/24");
  const onlyOld = resolveField("acceptance_rate", [obs("acceptance_rate", { percent: 50, year: 2023 }, { academic_year: "2023/24" })]);
  assert.equal(onlyOld.fact, null);
  assert.equal(onlyOld.history.length, 1);
});

test("deadlines resolve per round and union keeps documents/programmes", () => {
  const prov = { source_url: "https://x.example", retrieved_at: "2026-11-15", method: "fetched" as const, collector: "a" };
  const a = deadlinesOf([{ round: "Early Action", date: "2026-11-01", cycle: "2027 entry" }], prov);
  const b = deadlinesOf([{ round: "Regular Decision", date: "2027-01-05", cycle: "2027 entry" }], { ...prov, collector: "b" });
  const r = resolveField("deadlines", [obs("deadlines", a, { academic_year: "2026/27" }), obs("deadlines", b, { collector: "b", academic_year: "2026/27" })]);
  assert.equal((r.fact!.value as unknown[]).length, 2);
  const u = resolveField("documents", [obs("documents", ["Passport", "Transcript"]), obs("documents", ["transcript", "Essay"], { collector: "b" })]);
  assert.deepEqual(u.fact!.value, ["Passport", "Transcript", "Essay"]);
});

test("gates: missing source and impossible values are rejected", () => {
  assert.ok(rejectReasons({ field: "platform", value: { code: "ucas", label: "UCAS" }, source_url: null, retrieved_at: "2026-11-15" }).some((r) => r.startsWith("missing-source")));
  assert.ok(rejectReasons({ field: "acceptance_rate", value: { percent: 0, year: 2025 }, source_url: "https://x", retrieved_at: "2026-11-15" }).length > 0);
  assert.ok(rejectReasons({ field: "ielts", value: { status: "required", overall: 9.5, component: null, text: null }, source_url: "https://x", retrieved_at: "2026-11-15" }).length > 0);
  const t = { amount: 200000, range_min: null, range_max: null, currency: "USD", period: "year" as const, usd: 200000, fx: null, basis: null };
  assert.ok(rejectReasons({ field: "tuition", value: t, source_url: "https://x", retrieved_at: "2026-11-15" }).some((r) => r.includes("120k")));
  assert.deepEqual(rejectReasons({ field: "tuition", value: { ...t, amount: 30000, usd: 30000 }, source_url: "https://x", retrieved_at: "2026-11-15" }), []);
});

test("scorecard adapter: 2025/26 facts with provenance; history adapter labels 2023/24", () => {
  const o = scorecardObservations({ id: "u1", name: "A", unitid: "1", academic_year: "2025/26", retrieved_at: "2026-11-16", tuition_fees_in_state: 10558, tuition_fees_out_of_state: 19318,
    cost_of_attendance: 27732, acceptance_rate: 57.95, sat_reading_25: 420, sat_reading_75: 530, sat_math_25: 390, sat_math_75: 510, sat_avg: 938, act_25: 14, act_75: 19,
    undergrads: 6124, international_share: 0.0238, grad_rate: 0.2771, median_earnings_10y: 41266, net_price_private: null, bachelor_fields: ["Biology, General"] }, "f", null);
  const by = Object.fromEntries(o.map((x) => [x.field, x]));
  assert.equal((by.tuition.value as { usd: number }).usd, 19318, "international students pay the out-of-state rate");
  assert.equal(by.tuition.academic_year, "2025/26");
  assert.equal(by.tuition.method, "dataset");
  assert.equal(by.tuition.verified, true);
  assert.deepEqual(by.act_scores.value, { p25: 14, p75: 19 });
  assert.deepEqual(by.bachelor_fields.value, ["Biology, General"]);
  assert.equal(by.net_price, undefined);
  for (const x of o) assert.deepEqual(rejectReasons(x), [], x.field);
  const h = usHistoryObservations({ id: "u1", values: { tuition_out_of_state: 37700, acceptance_rate: 83.71, act_25: 21, act_75: 26 } }, "f", "2026-11-16");
  assert.ok(h.every((x) => x.academic_year === "2023/24"));
});

test("exclusion rules: closed / non-bachelor US, true duplicates vs campuses", () => {
  assert.equal(statusExclusion({ unitid: "1", name: "x", curroper: 0, preddeg: 3, highdeg: 4, control: 1, url: null }), "closed");
  assert.equal(statusExclusion({ unitid: "1", name: "x", curroper: 1, preddeg: 2, highdeg: 2, control: 1, url: null }), "no-bachelors");
  assert.equal(statusExclusion({ unitid: "1", name: "x", curroper: 1, preddeg: 1, highdeg: 1, control: 1, url: null }), "no-bachelors");
  assert.equal(statusExclusion({ unitid: "1", name: "x", curroper: 1, preddeg: 3, highdeg: 4, control: 1, url: null }), null);
  assert.equal(statusExclusion(undefined), null);
  assert.deepEqual(splitCsvLine('1,"A, B",,"x ""q"""'), ["1", "A, B", "", 'x "q"']);
  const id = (o: Partial<Identity>): Identity => ({ id: "", slug: null, name: "Uni", country_code: "US", city: null, website: null, aliases: [], rankings: 0, unitid: null, ror: null, domains: [], ...o });
  const ids = new Map<string, Identity>([
    ["a", id({ id: "a", unitid: "100", domains: ["uni.edu"] })],
    ["b", id({ id: "b", unitid: "100", domains: ["uni2.edu"] })], // same unitid → duplicate
    ["c", id({ id: "c", name: "College", city: "Annapolis", unitid: "1", domains: ["col.edu"] })],
    ["d", id({ id: "d", name: "College", city: "Santa Fe", unitid: "2", domains: ["col.edu"] })], // other campus
    ["e", id({ id: "e", name: "Miami", domains: ["miami.edu"] })],
    ["f", id({ id: "f", name: "Miami", website: "https://www.miami.edu/" })], // same name+domain, no conflicting ids
  ]);
  assert.deepEqual(duplicateGroups(ids), [["a", "b"], ["e", "f"]]);
});

test("adapters read every present input (oc-shards PROMPT.md shape, nov14 merged)", () => {
  const shard = ocShards.read({ scope: null });
  assert.ok(shard.length > 0);
  assert.ok(shard.every((o) => o.collector.startsWith("oc-shard-")));
  assert.ok(nov14Merged.read({ scope: null }).some((o) => o.field === "platform" && o.verified));
});

const rec = (facts: Record<string, unknown>, over: Partial<CuratedRecord> = {}): CuratedRecord => ({
  id: "00000000-0000-4000-8000-000000000001", slug: "u", name: "U", country_code: "GB", website: "https://u.example", is_target: true, target_rank: 1,
  facts: facts as CuratedRecord["facts"], alternatives: {}, aliases: [], merged_ids: [], collectors: ["oc-shard-1"], ...over,
});
const fact = (value: unknown, over: Record<string, unknown> = {}) => ({ value, source_url: "https://u.example/fees", retrieved_at: "2026-11-15", method: "fetched", collector: "c", confidence: 0.8, verified: false, academic_year: "2026/27", flags: [], note: null, ...over });

test("check + queue + feed", () => {
  const tu = (usd: number) => fact({ amount: usd, range_min: null, range_max: null, currency: "USD", period: "year", usd, fx: null, basis: null });
  assert.equal(jumpsBetween([rec({ tuition: tu(20000) })], [rec({ tuition: tu(40000) })]).length, 1);
  assert.equal(jumpsBetween([rec({ tuition: tu(20000) })], [rec({ tuition: tu(21000) })]).length, 0);
  const q = buildQueue([rec({ platform: fact({ code: "ucas", label: "UCAS" }, { method: "snippet" }) })]);
  assert.equal(q[0].tier, "A");
  assert.ok(q[0].missing.includes("tuition"));
  assert.equal(q[0].verify[0].field, "platform");
  const shape = toLatestShape(rec({ tuition: tu(30000), toefl: fact({ status: "required", ibt: 90, ibt_component: null, band_2026: 5, text: null }) }));
  assert.equal(shape.tuition.usd, 30000);
  assert.match(shape.english.toefl_ibt.scale_note, /minimum 5/);
});
