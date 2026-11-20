import { test } from "node:test";
import assert from "node:assert/strict";
import type { University } from "../lib/domain";
import {
  tuitionGroups,
  admissionComparison,
  enrollmentComparison,
  rankingGroups,
  parseBandLabel,
  costBreakdown,
} from "../lib/comparison-charts";

const sourced = (overrides: Record<string, unknown> = {}) => ({
  id: "rec-1",
  year: 2025,
  source_id: "src-1",
  verification_status: "verified",
  verified_at: "2026-01-01T00:00:00Z",
  notes: null,
  ...overrides,
});

const cost = (overrides: Record<string, unknown>) =>
  ({
    ...sourced(),
    university_id: "u",
    category: "tuition",
    amount: 1000,
    currency: "USD",
    period: "year",
    student_category: "international",
    program_id: null,
    ...overrides,
  }) as unknown as University["costs"][number];

const uni = (overrides: Record<string, unknown>) =>
  ({
    id: "u",
    slug: "uni",
    name: "Uni",
    short_name: null,
    country_code: "US",
    website: "https://example.edu",
    data_points: [],
    costs: [],
    admissions: [],
    imported_records: [],
    ranking_entries: [],
    rankings: [],
    ...overrides,
  }) as unknown as University;

const mit = () =>
  uni({
    id: "mit",
    name: "Massachusetts Institute of Technology",
    short_name: "MIT",
    costs: [
      cost({ id: "c1", university_id: "mit", category: "tuition", amount: 64310 }),
      cost({ id: "c2", university_id: "mit", category: "fees", amount: 420 }),
      cost({ id: "c3", university_id: "mit", category: "housing", amount: 13614 }),
      cost({ id: "c4", university_id: "mit", category: "food", amount: 7650 }),
      cost({ id: "c5", university_id: "mit", category: "books", amount: 910 }),
      cost({ id: "c6", university_id: "mit", category: "personal", amount: 2436 }),
      cost({ id: "c7", university_id: "mit", category: "total", amount: 89340 }),
    ],
    admissions: [
      {
        ...sourced({
          id: "a1",
          notes: "First-year Class of 2029",
          source_url: "https://mitadmissions.org/apply/process/stats/",
        }),
        university_id: "mit",
        program_id: null,
        acceptance_rate: 4.6,
        applicants: 29281,
        admitted: 1334,
      },
    ],
    data_points: [
      {
        ...sourced({ id: "d1", metric: "enrollment", value: 11816, unit: "students" }),
        university_id: "mit",
        metric: "enrollment",
        value: 11816,
        unit: "students",
      },
    ],
    rankings: [
      { domain: "", provider: "qs", year: 2026, rank: 1, tied: false, url: "https://example.edu/qs" },
    ],
  });

const stanford = () =>
  uni({
    id: "stanford",
    name: "Stanford University",
    short_name: "Stanford",
    data_points: [
      {
        ...sourced({ id: "d2", metric: "enrollment", value: 17314, unit: "students" }),
        university_id: "stanford",
        metric: "enrollment",
        value: 17314,
        unit: "students",
      },
    ],
  });

test("tuition only groups matching currency, population, period and year", () => {
  const oxford = uni({
    id: "oxford",
    name: "University of Oxford",
    costs: [
      cost({
        id: "c8",
        university_id: "oxford",
        amount: 9250,
        currency: "GBP",
        student_category: "home",
        year: 2024,
      }),
    ],
  });
  const groups = tuitionGroups([mit(), oxford]);
  const costGroups = groups.filter((g) => g.kind === "cost-tuition");
  assert.equal(costGroups.length, 2);
  for (const g of costGroups) {
    const currencies = new Set(
      g.rows.filter((r) => r.amount != null).map((r) => r.currency),
    );
    assert.equal(currencies.size, 1);
  }
  const mitGroup = costGroups.find((g) => g.currency === "USD")!;
  assert.equal(
    mitGroup.rows.find((r) => r.universityId === "mit")?.amount,
    64310,
  );
  assert.equal(
    mitGroup.rows.find((r) => r.universityId === "oxford")?.amount,
    null,
  );
});

test("tuition never merges mismatched reporting years", () => {
  const anaheim = uni({
    id: "anaheim",
    name: "Anaheim University",
    costs: [
      cost({ id: "c9", university_id: "anaheim", amount: 50000, year: 2024 }),
    ],
  });
  const groups = tuitionGroups([mit(), anaheim]).filter(
    (g) => g.kind === "cost-tuition",
  );
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.year).sort(),
    [2024, 2025],
  );
});

test("IPEDS out-of-state tuition forms its own labelled scope", () => {
  const imported = (id: string, value: number) => ({
    id,
    university_id: id.startsWith("mit") ? "mit" : "stanford",
    source: "ipeds",
    source_name: "IPEDS NCES",
    source_record_id: "x",
    source_url: "https://nces.ed.gov/ipeds/",
    release: "2023 annual survey",
    reporting_year: 2023,
    period: "academic year 2023–24",
    cohort: "full-time undergraduate",
    retrieved_at: "2026-09-26",
    last_verified_at: "2026-09-26",
    license_note: "US government public data",
    metric: "tuition_out_of_state",
    value,
    unit: "USD",
    notes: null,
    verification_status: "verified",
    publication_status: "published",
  });
  const a = mit();
  const b = stanford();
  (a as unknown as { imported_records: unknown[] }).imported_records = [
    imported("mit-t", 59750),
  ];
  (b as unknown as { imported_records: unknown[] }).imported_records = [
    imported("st-t", 61731),
  ];
  const groups = tuitionGroups([a, b]);
  const ipeds = groups.filter((g) => g.kind === "ipeds-out-of-state");
  assert.equal(ipeds.length, 1);
  assert.equal(ipeds[0].reportedCount, 2);
  assert.match(ipeds[0].label, /IPEDS/);
  assert.match(ipeds[0].detail, /international-student price/);
});

test("unknown admission is unknown, never zero, with scope attached", () => {
  const result = admissionComparison([mit(), stanford()]);
  assert.equal(result.reportedCount, 1);
  const missing = result.rows.find((r) => r.universityId === "stanford")!;
  assert.equal(missing.rate, null);
  assert.notEqual(missing.rate, 0);
  const reported = result.rows.find((r) => r.universityId === "mit")!;
  assert.equal(reported.rate, 4.6);
  assert.equal(reported.year, 2025);
  assert.match(reported.sourceUrl || "", /mitadmissions/);
  assert.equal(reported.applicants, 29281);
  assert.equal(reported.admitted, 1334);
  assert.equal(result.yearsDiffer, false);
});

test("admission flags differing reporting years", () => {
  const other = uni({
    id: "other",
    name: "Other University",
    admissions: [
      {
        ...sourced({ id: "a2", year: 2023 }),
        university_id: "other",
        program_id: null,
        acceptance_rate: 12,
      },
    ],
  });
  const result = admissionComparison([mit(), other]);
  assert.equal(result.yearsDiffer, true);
});

test("enrollment keeps per-university years and missing states", () => {
  const result = enrollmentComparison([mit(), stanford()]);
  assert.equal(result.reportedCount, 2);
  assert.equal(result.yearsDiffer, false);
  const empty = enrollmentComparison([uni({ id: "x", name: "X" })]);
  assert.equal(empty.reportedCount, 0);
  assert.equal(empty.rows[0].value, null);
});

test("band labels parse without inventing point estimates", () => {
  assert.deepEqual(parseBandLabel("501–600"), { lo: 501, hi: 600 });
  assert.deepEqual(parseBandLabel("501-600"), { lo: 501, hi: 600 });
  assert.deepEqual(parseBandLabel("801+"), { lo: 801, hi: null });
  assert.equal(parseBandLabel("=22"), null);
  assert.equal(parseBandLabel("#5"), null);
});

test("rankings preserve tie and band labels and separate editions", () => {
  const tied = uni({
    id: "tum",
    name: "Technical University of Munich",
    rankings: [
      { domain: "", provider: "qs", year: 2026, rank: 22, tied: true, url: "https://example.edu/qs" },
      {
        domain: "",
        provider: "the",
        year: 2026,
        rank: 27,
        tied: false,
        rank_label: "501–600",
        band: true,
        url: "https://example.edu/the",
      },
    ],
  });
  const groups = rankingGroups([mit(), tied]);
  const qs = groups.find((g) => g.provider === "qs")!;
  const the = groups.find((g) => g.provider === "the")!;
  assert.ok(qs && the && qs.id !== the.id);
  const tumQs = qs.rows.find((r) => r.universityId === "tum")!;
  assert.equal(tumQs.label, "=22");
  assert.equal(tumQs.tied, true);
  const tumThe = the.rows.find((r) => r.universityId === "tum")!;
  assert.equal(tumThe.label, "501–600");
  assert.equal(tumThe.band, true);
  const missing = the.rows.find((r) => r.universityId === "mit")!;
  assert.equal(missing.rank, null);
  assert.equal(missing.label, "Not reported");
});

test("invented Leiden overall ranks never appear", () => {
  const fake = uni({
    id: "fake",
    name: "Fake University",
    ranking_entries: [
      {
        ...sourced({ id: "r1" }),
        university_id: "fake",
        edition_id: "e1",
        rank: 5,
        rank_label: "5",
        ranking_editions: {
          id: "e1",
          provider_id: "p1",
          year: 2025,
          subject: "Overall",
          region: "Global",
          permitted: true,
          ranking_providers: { id: "p1", name: "Leiden", slug: "leiden" },
        },
      },
    ],
  });
  const groups = rankingGroups([fake]);
  assert.equal(groups.length, 0);
});

test("duplicate cost reports do not create duplicate bars or slices, conflicts stay unknown", () => {
  const u = mit();
  u.costs.push({...u.costs[0], id: "duplicate"});
  assert.equal(tuitionGroups([u])[0].rows.length, 1);
  assert.equal(costBreakdown(u)?.knownSum, 89340);
  u.costs.push({...u.costs[0], id: "conflict", amount: 70000});
  assert.equal(tuitionGroups([u])[0].rows[0].amount, null);
  assert.equal(costBreakdown(u), null);
});

test("pending, negative and unknown-year costs cannot form a sourced breakdown", () => {
  const u = mit();
  u.costs = u.costs.map(c => ({...c, verification_status: "needs_review"}));
  assert.equal(tuitionGroups([u]).length, 0);
  assert.equal(costBreakdown(u), null);
  const invalid = uni({costs: [cost({category: "tuition", amount: -1}), cost({category: "fees", amount: 25})]});
  assert.equal(costBreakdown(invalid), null);
  u.costs = mit().costs.map(c => ({...c, year: null}));
  assert.equal(costBreakdown(u), null);
});

test("bundled room and board is not added to separate housing and food", () => {
  const u = mit();
  u.costs.push(cost({category: "room_board", amount: 21264}));
  assert.equal(costBreakdown(u), null);
});

test("coherent breakdown distinguishes accounted total from parts", () => {
  const full = costBreakdown(mit())!;
  assert.ok(full);
  assert.equal(full.components.length, 6);
  assert.equal(full.total, 89340);
  assert.equal(full.knownSum, 89340);
  assert.equal(full.isPartial, false);
  assert.equal(full.remainder, null);
  assert.equal(full.components[0].label, "Tuition");
});

test("partial breakdown never hardens into a total", () => {
  const partial = uni({
    id: "partial",
    name: "Partial University",
    costs: [
      cost({ id: "p1", university_id: "partial", category: "tuition", amount: 20000 }),
      cost({ id: "p2", university_id: "partial", category: "fees", amount: 500 }),
    ],
  });
  const result = costBreakdown(partial)!;
  assert.ok(result);
  assert.equal(result.total, null);
  assert.equal(result.isPartial, true);
  assert.equal(result.knownSum, 20500);
  assert.match(result.coverageNote, /unknown total/);
});

test("no donut is manufactured from a single figure or thin air", () => {
  const single = uni({
    id: "single",
    name: "Single University",
    costs: [cost({ id: "s1", university_id: "single", amount: 20000 })],
  });
  assert.equal(costBreakdown(single), null);
  assert.equal(costBreakdown(uni({ id: "empty", name: "Empty" })), null);
});

test("breakdown exposes remainder and discrepancy honestly", () => {
  const remainder = uni({
    id: "rem",
    name: "Remainder University",
    costs: [
      cost({ id: "r1", university_id: "rem", category: "tuition", amount: 20000 }),
      cost({ id: "r2", university_id: "rem", category: "fees", amount: 1000 }),
      cost({ id: "r3", university_id: "rem", category: "total", amount: 25000 }),
    ],
  });
  const withGap = costBreakdown(remainder)!;
  assert.equal(withGap.remainder, 4000);
  assert.equal(withGap.isPartial, true);
  const inflated = uni({
    id: "inf",
    name: "Inflated University",
    costs: [
      cost({ id: "i1", university_id: "inf", category: "tuition", amount: 30000 }),
      cost({ id: "i2", university_id: "inf", category: "fees", amount: 1000 }),
      cost({ id: "i3", university_id: "inf", category: "total", amount: 25000 }),
    ],
  });
  const over = costBreakdown(inflated)!;
  assert.equal(over.discrepancy, true);
  assert.equal(over.remainder, null);
});
