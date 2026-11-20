import { test } from "node:test";
import assert from "node:assert/strict";
import {
  admissionComparison,
  costBreakdown,
  enrollmentComparison,
  parseBandLabel,
  rankingGroups,
  scopedMetricGroups,
  tuitionGroups,
} from "../lib/comparison-charts";
import type { University } from "../lib/domain";

const source = (id: string, year = 2025) => ({
  id,
  year,
  source_id: "synthetic-source",
  source_url: "https://example.edu/report",
  verification_status: "verified",
  verified_at: "2026-10-12T00:00:00Z",
  notes: null,
  evidence: {
    population: "First-time first-year undergraduate applicants",
    reporting_period: `Fall ${year}`,
  },
});
const university = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    slug: id,
    name: `Synthetic ${id}`,
    short_name: id,
    country_code: "US",
    website: "https://example.edu",
    data_points: [],
    costs: [],
    admissions: [],
    imported_records: [],
    rankings: [],
    ranking_entries: [],
    ...extra,
  }) as unknown as University;
const admissions = (
  id: string,
  year: number,
  rate: number,
  evidence?: Record<string, unknown>,
) => ({
  ...source(id, year),
  university_id: id,
  program_id: null,
  acceptance_rate: rate,
  ...(evidence ? { evidence } : {}),
});
const imported = (
  id: string,
  year: number,
  value: number,
  metric = "enrollment_12_month",
  cohort = "All enrolled students",
) => ({
  id,
  university_id: id,
  source: "ipeds",
  source_name: "IPEDS NCES",
  source_record_id: id,
  source_url: "https://nces.ed.gov/ipeds/",
  release: "Synthetic fixture",
  reporting_year: year,
  period: `Academic year ${year}`,
  cohort,
  retrieved_at: "2026-10-12",
  last_verified_at: "2026-10-12",
  license_note: "Synthetic fixture only",
  metric,
  value,
  unit: metric === "tuition_out_of_state" ? "USD" : "students",
  notes: null,
  verification_status: "verified",
  publication_status: "published",
});
const cost = (
  id: string,
  category: string,
  amount: number,
  extra: Record<string, unknown> = {},
) => ({
  ...source(id),
  university_id: id,
  category,
  amount,
  currency: "USD",
  student_category: "international",
  period: "year",
  program_id: null,
  ...extra,
});

test("admission charts keep years and populations apart and retain a shared historical cohort", () => {
  const a = university("A", {
    admissions: [admissions("a-new", 2025, 8), admissions("a-old", 2024, 9)],
  });
  const b = university("B", { admissions: [admissions("b-old", 2024, 12)] });
  const groups = scopedMetricGroups([a, b], "admission");
  const shared = groups.find((group) => group.year === 2024)!;
  assert.equal(shared.reportedCount, 2);
  assert.equal(shared.comparable, true);
  assert.deepEqual(
    shared.rows.map((row) => row.value),
    [9, 12],
  );
  assert.equal(groups.find((group) => group.year === 2025)?.reportedCount, 1);
  b.admissions[0].evidence!.population = "Transfer applicants";
  assert.ok(
    scopedMetricGroups([a, b], "admission").every(
      (group) => group.reportedCount === 1,
    ),
  );
  assert.equal(
    a.admissions.length,
    2,
    "Historical observations remain untouched",
  );
});

test("unknown applicant scopes and reporting years never become a shared chart", () => {
  const a = university("A", { admissions: [admissions("a", 2025, 10, {})] });
  const b = university("B", { admissions: [admissions("b", 2025, 20, {})] });
  const unknown = scopedMetricGroups([a, b], "admission");
  assert.equal(unknown.length, 2);
  assert.ok(
    unknown.every((group) => !group.comparable && group.reportedCount === 1),
  );
  a.admissions[0].year = null;
  a.admissions[0].evidence = {
    population: "First-year",
    reporting_period: "Fall",
  };
  assert.equal(scopedMetricGroups([a], "admission")[0].comparable, false);
});

test("duplicate observations are not extra bars and conflicting scoped values stay unknown", () => {
  const a = university("A", {
    admissions: [
      admissions("a", 2025, 10),
      admissions("a-duplicate", 2025, 10),
    ],
  });
  const b = university("B", { admissions: [admissions("b", 2025, 20)] });
  let group = scopedMetricGroups([a, b], "admission")[0];
  assert.equal(group.rows.length, 2);
  assert.equal(group.reportedCount, 2);
  a.admissions.push(
    admissions("a-conflict", 2025, 15) as University["admissions"][number],
  );
  group = scopedMetricGroups([a, b], "admission")[0];
  assert.equal(group.reportedCount, 1);
  assert.equal(group.rows[0].value, null);
  assert.match(group.rows[0].note || "", /Conflicting/);
});

test("imported enrollment carries its original period, population, retrieval and historical year", () => {
  const a = university("A", {
    imported_records: [imported("a", 2025, 500), imported("a-old", 2024, 450)],
  });
  const b = university("B", {
    imported_records: [imported("b", 2025, 1000), imported("b-old", 2024, 900)],
  });
  const groups = scopedMetricGroups([a, b], "enrollment");
  assert.equal(groups.length, 2);
  assert.ok(
    groups.every((group) => group.comparable && group.reportedCount === 2),
  );
  assert.match(groups[0].label, /All enrolled students/);
  assert.match(groups[0].label, /Academic year 2025/);
  assert.equal(groups[0].rows[0].checkedAt, "2026-10-12");
  assert.match(
    enrollmentComparison([a]).rows[0].scope,
    /All enrolled students/,
  );
  b.imported_records![0].cohort = "Undergraduate students only";
  assert.equal(
    scopedMetricGroups([a, b], "enrollment").filter(
      (group) => group.year === 2025,
    ).length,
    2,
  );
});

test("pending, non-finite and impossible admission/enrollment figures cannot create bars", () => {
  const a = university("A", { admissions: [admissions("a", 2025, 101)] });
  assert.equal(admissionComparison([a]).rows[0].rate, null);
  assert.equal(scopedMetricGroups([a], "admission").length, 0);
  a.admissions[0].acceptance_rate = 10;
  a.admissions[0].verification_status = "needs_review";
  assert.equal(admissionComparison([a]).rows[0].rate, null);
  const b = university("B", {
    data_points: [
      { ...source("b"), metric: "enrollment", value: -1 },
      { ...source("b-new", 2026), metric: "enrollment", value: Infinity },
    ],
  });
  assert.equal(enrollmentComparison([b]).rows[0].value, null);
  assert.equal(scopedMetricGroups([b], "enrollment").length, 0);
});

test("tuition and cost components retain additional campus/population scopes", () => {
  const a = university("A", {
    costs: [
      cost("a-t", "tuition", 20000, { evidence: { scope: "Main campus" } }),
      cost("a-f", "fees", 1000, { evidence: { scope: "Branch campus" } }),
    ],
  });
  const b = university("B", {
    costs: [
      cost("b-t", "tuition", 15000, { evidence: { scope: "Branch campus" } }),
    ],
  });
  assert.equal(tuitionGroups([a, b]).length, 2);
  assert.equal(
    costBreakdown(a),
    null,
    "Different campus expenses never become slices of one budget",
  );
  assert.ok(tuitionGroups([a, b]).every((group) => /campus/.test(group.label)));
  const foreign = university("C", {
    country_code: "CA",
    data_points: [
      {
        ...source("c"),
        metric: "tuition_out_of_state",
        value: 10000,
        unit: "CAD",
      },
    ],
  });
  assert.equal(
    tuitionGroups([foreign]).length,
    0,
    "A non-IPEDS number is not labelled as US government tuition",
  );
});

test("IPEDS tuition groups preserve actual population and period", () => {
  const a = university("A", {
    imported_records: [
      imported(
        "a",
        2025,
        20000,
        "tuition_out_of_state",
        "Full-time undergraduate",
      ),
    ],
  });
  const b = university("B", {
    imported_records: [
      imported(
        "b",
        2025,
        25000,
        "tuition_out_of_state",
        "Part-time undergraduate",
      ),
    ],
  });
  const groups = tuitionGroups([a, b]);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((group) => group.reportedCount === 1));
  assert.match(groups[0].label, /Academic year 2025/);
});

test("invalid or reversed bands do not become point estimates, open bands retain their endpoint", () => {
  for (const label of [
    "0–10",
    "600–501",
    "THE 2026 501–600",
    "801+ extra",
    "0+",
  ])
    assert.equal(parseBandLabel(label), null);
  const a = university("A", {
    rankings: [
      {
        provider: "the",
        year: 2026,
        rank: 27,
        rank_label: "501–600",
        band: true,
        tied: false,
        url: "https://example.edu/ranking",
      },
      {
        provider: "qs",
        year: 2027,
        rank: 801,
        rank_label: "801+",
        band: true,
        tied: false,
        url: "https://example.edu/ranking",
      },
    ],
  });
  const groups = rankingGroups([a]);
  assert.equal(
    groups.find((group) => group.provider === "the")?.rows[0].rank,
    501,
  );
  assert.equal(
    groups.find((group) => group.provider === "qs")?.rows[0].bandHi,
    null,
  );
});

test("a contradictory cost total produces source figures, never a misleading pie", () => {
  const a = university("A", {
    costs: [
      cost("a-t", "tuition", 30000),
      cost("a-f", "fees", 1000),
      cost("a-total", "total", 25000),
    ],
  });
  assert.equal(costBreakdown(a)?.discrepancy, true);
  assert.equal(costBreakdown(a)?.knownSum, 31000);
});
