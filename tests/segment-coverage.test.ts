import assert from "node:assert/strict";
import { test } from "node:test";
import type { Cost, Deadline, Requirement } from "../lib/domain";
import {
  classifyProfile,
  currencyInText,
  factAmounts,
  graduateOnly,
  lookupPage,
  missingForReport,
  parseAcademicYear,
  reportReadyCurrent,
  type ProfileInput,
} from "../scripts/segment/coverage-rules";
import { stratifiedPick } from "../scripts/segment/select-targets";

const ctx = { today: "2026-11-14" };
const src = "https://uni.example/fees";
const base: ProfileInput = { id: "u1", slug: "u1", name: "Example University", country_code: "GB", website: "https://uni.example/" };
const verified = { source_id: "s", verification_status: "verified" as const, verified_at: "2026-10-01", notes: null };

const cost = (over: Partial<Cost>): Cost => ({
  ...verified,
  id: "c",
  university_id: "u1",
  category: "tuition",
  amount: 20000,
  currency: "GBP",
  period: "year",
  student_category: "international",
  program_id: null,
  year: 2026,
  source_url: src,
  ...over,
});
const deadline = (over: Partial<Deadline>): Deadline => ({
  ...verified,
  id: "d",
  university_id: "u1",
  title: "Undergraduate application",
  student_category: "Undergraduate first-year",
  cycle: "2027 entry",
  due_at: "2027-01-15",
  timezone: "UTC",
  application_url: "https://uni.example/apply",
  year: 2027,
  source_url: "https://uni.example/dates",
  ...over,
});
const ielts = (over: Partial<Requirement>): Requirement => ({
  ...verified,
  id: "r",
  university_id: "u1",
  kind: "IELTS",
  label: "IELTS Academic",
  minimum: 6.5,
  maximum: null,
  student_category: "Undergraduate",
  required: null,
  year: null,
  source_url: "https://uni.example/english",
  ...over,
});
type Web = NonNullable<ProfileInput["official_web"]>;
const web = (admissions: string | null): Web => ({
  source_url: "https://uni.example/",
  checked_at: "2026-09-28",
  links: admissions ? { admissions: { url: admissions, label: "Apply" } } : {},
});

test("academic years come from period/cycle text, not from guesses", () => {
  assert.equal(parseAcademicYear("2026–27 academic year").start, 2026);
  assert.equal(parseAcademicYear("2027–2028 intake").start, 2027);
  assert.equal(parseAcademicYear("2026/27").start, 2026);
  assert.equal(parseAcademicYear("2027 entry").start, 2027);
  assert.equal(parseAcademicYear("Autumn semester 2027").start, 2027);
  assert.equal(parseAcademicYear("Spring 2027 intake").start, 2026, "a spring intake sits in the 2026–27 year");
  // A month alone is not read as a spring intake; the lone-year fallback labels it so the report shows why.
  assert.deepEqual(parseAcademicYear("Applicants testing from January 2026"), { start: 2026, label: "2026 (only year stated)" });
  assert.equal(parseAcademicYear("2025–2027").start, null, "a two-year span is not one academic year");
  assert.equal(parseAcademicYear("Undergraduate first-year").start, null);
  assert.equal(parseAcademicYear(null).start, null);
});

test("currency is read only when the text names it unambiguously", () => {
  assert.equal(currencyInText("UZS 38,820,000 per undergraduate academic year"), "UZS");
  assert.equal(currencyInText("£9,535 a year"), "GBP");
  assert.equal(currencyInText("RMB 26,000"), "CNY");
  assert.equal(currencyInText("$40,000 per year"), null, "$ could be USD, CAD, SGD, HKD…");
});

test("text facts count only when they state an amount", () => {
  assert.deepEqual(factAmounts("Home and Overseas fees differ", "Living costs are additional.", /living/i), []);
  assert.equal(factAmounts("Living-cost estimate", "Expect GBP 1,546 per month.", /living/i).length, 1);
  assert.deepEqual(factAmounts("Housing", "Figures refer to fall 2026.", /housing/i), [], "a year is not an amount");
});

test("graduate-only records are excluded, undergraduate ones are not", () => {
  assert.equal(graduateOnly("Executive MBA applicants"), true);
  assert.equal(graduateOnly("Undergraduate first-year"), false);
  assert.equal(graduateOnly("Knight-Hennessy scholarship application", "Graduate applicants"), true);
});

test("present / sourced / current are separate decisions", () => {
  const v = classifyProfile(
    {
      ...base,
      costs: [cost({ id: "old", year: 2023 }), cost({ id: "nosrc", year: 2026, source_url: undefined, data_sources: null })],
    },
    ctx,
  );
  assert.equal(v.tuition.present, true);
  assert.equal(v.tuition.sourced, true, "the 2023 row has a source");
  assert.equal(v.tuition.current, false, "the only current row has no source, so it cannot make the field current");
  assert.equal(v.tuition.year, "year 2023");

  const unsourced = classifyProfile({ ...base, costs: [cost({ source_url: undefined })] }, ctx);
  assert.deepEqual([unsourced.tuition.present, unsourced.tuition.sourced, unsourced.tuition.current], [true, false, false]);
});

test("unknown is never counted as zero; a stated zero is a value", () => {
  const empty = classifyProfile(base, ctx);
  assert.equal(empty.application_fee.present, false);
  assert.equal(empty.tuition.present, false);

  const feeUnknown = classifyProfile(
    {
      ...base,
      admissions: [
        { ...verified, id: "a", university_id: "u1", program_id: null, acceptance_rate: null, sat_min: null, sat_max: null, ielts_min: null, toefl_min: null, requirements: null, language: null, deadline: null, application_fee: null, year: 2026, source_url: src },
      ],
      common_app: { url: "https://www.commonapp.org/explore/x", charges_fee: true } as ProfileInput["common_app"],
    },
    ctx,
  );
  assert.equal(feeUnknown.application_fee.present, false, "null fee and 'charges a fee' without an amount are both unknown");
  assert.equal(feeUnknown.english_minimum.present, false, "null IELTS is not a minimum of 0");

  const feeZero = classifyProfile({ ...base, common_app: { url: "https://www.commonapp.org/explore/x", charges_fee: false } as ProfileInput["common_app"] }, ctx);
  assert.equal(feeZero.application_fee.present, true);
  assert.equal(feeZero.application_fee.current, false, "season not stated");

  const zeroCost = classifyProfile({ ...base, costs: [cost({ category: "application_fee", amount: 0, year: 2027 })] }, ctx);
  assert.equal(zeroCost.application_fee.present, true);
  assert.equal(zeroCost.application_fee.current, true);
});

test("deadlines and fees must be the 2027-entry round; tuition may be 2026–27 or 2027–28", () => {
  const v = classifyProfile(
    {
      ...base,
      deadlines: [deadline({ cycle: "2026 entry", year: 2026 })],
      costs: [cost({ year: 2026 })],
    },
    ctx,
  );
  assert.equal(v.deadline.sourced, true);
  assert.equal(v.deadline.current, false, "a 2026-entry deadline has passed for this segment");
  assert.equal(v.tuition.current, true);
  const next = classifyProfile({ ...base, deadlines: [deadline({})] }, ctx);
  assert.equal(next.deadline.current, true);
  const mba = classifyProfile({ ...base, deadlines: [deadline({ title: "Executive MBA registration", student_category: "Executive MBA applicants" })] }, ctx);
  assert.equal(mba.deadline.present, false);
});

test("US in-state tuition is ignored; out-of-state counts but stays historical", () => {
  const v = classifyProfile(
    { ...base, country_code: "US", costs: [cost({ student_category: "in_state", currency: "USD", year: 2023 }), cost({ student_category: "out_of_state", currency: "USD", year: 2023 })] },
    ctx,
  );
  assert.equal(v.tuition.evidence.length, 1);
  assert.match(v.tuition.detail, /out-of-state/);
  assert.equal(v.tuition.current, false);
});

test("report-ready needs tuition with currency and year, English, deadline and admissions link, all sourced", () => {
  const ready: ProfileInput = {
    ...base,
    costs: [cost({ year: 2027 })],
    requirements: [ielts({ year: 2027 })],
    deadlines: [deadline({})],
    official_web: web("https://uni.example/apply"),
  };
  const v = classifyProfile(ready, ctx);
  assert.deepEqual(missingForReport(v), []);
  assert.equal(reportReadyCurrent(v, ctx), true);

  const noYear = classifyProfile({ ...ready, costs: [cost({ year: null })] }, ctx);
  assert.deepEqual(missingForReport(noYear).map((m) => m.why), ["tuition lacks a stated currency or year"]);

  const textNoCurrency = classifyProfile(
    {
      ...ready,
      costs: [],
      enrichment: { checked_at: "2026-10-15", admissions: [], resources: [], costs: [{ title: "Tuition", body: "Tuition is 40,000 per year.", scope: "UG", reporting_period: "2026–27", source_url: src, checked_at: "2026-10-15", verification_status: "verified" }] },
    },
    ctx,
  );
  assert.equal(textNoCurrency.tuition.present, true);
  assert.equal(missingForReport(textNoCurrency)[0]?.part, "tuition", "no currency named → not report-ready");

  const oldEnglish = classifyProfile({ ...ready, requirements: [ielts({ year: null })] }, ctx);
  assert.deepEqual(missingForReport(oldEnglish), [], "an English minimum without a year still satisfies report-ready");
  assert.equal(reportReadyCurrent(oldEnglish, ctx), false, "…but not report-ready-current");

  const noLink = classifyProfile({ ...ready, official_web: null }, ctx);
  assert.deepEqual(missingForReport(noLink).map((m) => m.part), ["admissions_link"]);
});

test("links are current when checked within a year and sourced only with provenance", () => {
  const fresh = classifyProfile({ ...base, official_web: web("https://uni.example/apply") }, ctx);
  assert.equal(fresh.admissions_link.current, true);
  const stale = classifyProfile({ ...base, official_web: { ...web("https://uni.example/apply"), checked_at: "2024-01-01" } }, ctx);
  assert.equal(stale.admissions_link.sourced, true);
  assert.equal(stale.admissions_link.current, false);
  const bare = classifyProfile({ ...base, admissions_url: "https://uni.example/apply", reference_url: undefined }, ctx);
  assert.deepEqual([bare.admissions_link.present, bare.admissions_link.sourced], [true, false]);
});

test("international page detection ignores research links", () => {
  const v = classifyProfile(
    {
      ...base,
      official_web: {
        source_url: "https://uni.example/",
        checked_at: "2026-09-28",
        links: { research: { url: "https://uni.example/international-conference", label: "International conference" } },
      },
    },
    ctx,
  );
  assert.equal(v.international_link.present, false);
});

test("lookup pages are only ever stored URLs", () => {
  assert.equal(lookupPage(base, "tuition"), null);
  assert.equal(lookupPage({ ...base, official_web: web("https://uni.example/apply") }, "deadline"), "https://uni.example/apply");
});

test("stratified target pick keeps the top half and spreads the rest", () => {
  const ranked = Array.from({ length: 20 }, (_, i) => i);
  assert.deepEqual(stratifiedPick(ranked, 4).map((p) => p.item), [0, 1, 6, 15]);
  assert.equal(stratifiedPick([1, 2], 4).length, 2);
});
