import { test } from "node:test";
import assert from "node:assert/strict";
import type { Cost, Scholarship } from "../lib/domain";
import {
  latestReportedCosts,
  profileNavigation,
  profileSection,
} from "../lib/profile-navigation";
import {
  filterScholarships,
  scholarshipDeadline,
} from "../lib/scholarship-discovery";
import { usesHostedCatalogue } from "../lib/catalogue-mode";
import { selectLocalResearch } from "../lib/research-selection";
import { parseResearchQuery, defaultFilters } from "../lib/research";
import { globalCatalogue } from "../server/global-catalogue";
import { applicationRoute } from "../lib/application-routes";

test("public catalogue activation is explicit and independent of account credentials", () => {
  assert.equal(usesHostedCatalogue("bundled"), false);
  assert.equal(usesHostedCatalogue(""), false);
  assert.equal(usesHostedCatalogue("misspelled"), false);
  assert.equal(usesHostedCatalogue("supabase"), true);
});

test("platform identity distinguishes country guidance from a university's own portal", () => {
  const mit = applicationRoute(globalCatalogue.find((u) => u.slug === "mit")!);
  assert.equal(mit?.platform, "university");
  assert.equal(mit?.kind, "institution");
  const harvard = applicationRoute(
    globalCatalogue.find((u) => u.name === "Harvard University")!,
  );
  assert.equal(harvard?.platform, "common-app");
  assert.equal(harvard?.kind, "country-guide");
  assert.match(harvard!.steps[0], /Check.*listed/);
  const oxford = applicationRoute(
    globalCatalogue.find((u) => u.slug === "oxford")!,
  );
  assert.equal(oxford?.platform, "ucas");
  assert.equal(oxford?.kind, "country-guide");
});

test("local research finds institutions outside the pilot, preserves filters, and bounds evidence retrieval", () => {
  const question = "What does Harvard University report about tuition?";
  const harvard = selectLocalResearch(
    globalCatalogue,
    { question, ids: [] },
    parseResearchQuery(question),
  );
  assert.ok(harvard.rows.some((u) => u.name === "Harvard University"));
  const impossible =
    "Computer science universities in Europe under $20k with scholarships and IELTS 7.0 or lower";
  const constrained = selectLocalResearch(
    globalCatalogue,
    { question: impossible, ids: [] },
    parseResearchQuery(impossible),
  );
  assert.equal(constrained.total, 0);
  assert.deepEqual(constrained.rows, []);
  const broad = selectLocalResearch(
    globalCatalogue,
    { question: "universities", ids: [] },
    { recognized: true, filters: defaultFilters },
  );
  assert.equal(broad.total, globalCatalogue.length);
  assert.equal(broad.rows.length, 24);
  const selected = selectLocalResearch(
    globalCatalogue,
    { question: "Costs?", ids: [globalCatalogue[0].id] },
    { recognized: false, filters: defaultFilters },
  );
  assert.equal(selected.rows.length, 1);
  assert.equal(selected.rows[0].id, globalCatalogue[0].id);
});

test("old profile links resolve to the consolidated sections without losing content categories", () => {
  for (const [legacy, current] of Object.entries({
    "How to apply": "Admissions",
    Deadlines: "Admissions",
    Scholarships: "Costs",
    "Financial Aid": "Costs",
    Students: "Sources",
    Outcomes: "Sources",
    People: "People",
  }))
    assert.equal(profileSection(legacy), current);
  assert.equal(profileSection(null), "Overview");
  assert.equal(profileSection("Unknown"), "Overview");
  assert.equal(
    new Set(profileNavigation.flatMap((s) => [...s.categories])).size,
    8,
  );
});

const cost = (
  id: string,
  year: number | null,
  extra: Partial<Cost> = {},
): Cost => ({
  id,
  university_id: "u",
  year,
  category: "tuition",
  student_category: "international",
  currency: "USD",
  period: "year",
  program_id: null,
  amount: 10000,
  source_id: null,
  verification_status: "verified",
  verified_at: null,
  notes: null,
  ...extra,
});
test("latest costs retain older-only categories and separate program, population, currency and period", () => {
  const rows = [
    cost("old", 2023),
    cost("latest", 2025),
    cost("undated", null),
    cost("housing", 2022, { category: "housing" }),
    cost("domestic", 2024, { student_category: "domestic" }),
    cost("euro", 2024, { currency: "EUR" }),
    cost("semester", 2024, { period: "semester" }),
    cost("program", 2021, { program_id: "p1" }),
    cost("no-year", null, { category: "books" }),
  ];
  assert.deepEqual(
    latestReportedCosts(rows)
      .map((c) => c.id)
      .sort(),
    [
      "latest",
      "undated",
      "housing",
      "domestic",
      "euro",
      "semester",
      "program",
      "no-year",
    ].sort(),
  );
  assert.equal(rows.length, 9);
});

test("newer costs do not hide independent evidence scopes or populations", () => {
  const rows = [
    cost("undergraduate-old", 2023, {
      evidence: { scope: "Undergraduate", population: "Full-time" },
    }),
    cost("undergraduate-latest", 2024, {
      amount: 12500,
      source_url: "https://example.edu/undergraduate-fees",
      evidence: { scope: "Undergraduate", population: "Full-time" },
    }),
    cost("part-time", 2022, {
      evidence: { scope: "Undergraduate", population: "Part-time" },
    }),
    cost("postgraduate", 2025, {
      evidence: { scope: "Postgraduate", population: "Full-time" },
    }),
    cost("population-only", 2021, {
      evidence: { population: "Full-time" },
    }),
    cost("unscoped", 2026),
  ];
  const before = structuredClone(rows);
  const selected = latestReportedCosts(rows);
  assert.deepEqual(
    selected.map((row) => row.id),
    [
      "undergraduate-latest",
      "part-time",
      "postgraduate",
      "population-only",
      "unscoped",
    ],
  );
  assert.strictEqual(selected[0], rows[1]);
  assert.equal(selected[0].amount, 12500);
  assert.equal(
    selected[0].source_url,
    "https://example.edu/undergraduate-fees",
  );
  assert.deepEqual(rows, before);
});

test("same-year cost sources are retained within a scope without altering historical rows", () => {
  const evidence = { scope: "Bachelor", population: "New entrants" };
  const rows = [
    cost("historical", 2024, { amount: 11200, evidence }),
    cost("published-fees", 2025, {
      amount: 12000,
      source_id: "fees-source",
      evidence,
    }),
    cost("published-budget", 2025, {
      amount: 12100,
      source_id: "budget-source",
      evidence,
    }),
  ];
  const before = structuredClone(rows);
  assert.deepEqual(latestReportedCosts(rows), rows.slice(1));
  assert.deepEqual(rows, before);
});

test("undated costs retain unknown reporting years beside the latest dated cost", () => {
  const evidence = { scope: "Bachelor", population: "New entrants" };
  const rows = [
    cost("historical", 2023, { amount: 11000, evidence }),
    cost("latest-dated", 2024, { amount: 12000, evidence }),
    cost("undated-current-page", null, {
      amount: 13250,
      source_id: "current-fees",
      source_url: "https://example.edu/current-fees",
      evidence: {
        ...evidence,
        retrieved_at: "2026-10-10T00:00:00Z",
        publication_year: 2025,
      },
    }),
    cost("undated-other-source", null, {
      amount: 13000,
      source_id: "budget",
      evidence,
    }),
  ];
  const before = structuredClone(rows);
  const selected = latestReportedCosts(rows);
  assert.deepEqual(
    selected.map((row) => row.id),
    ["latest-dated", "undated-current-page", "undated-other-source"],
  );
  assert.strictEqual(selected[1], rows[2]);
  assert.equal(selected[1].year, null);
  assert.equal(selected[1].amount, 13250);
  assert.equal(selected[1].evidence?.publication_year, 2025);
  assert.equal(selected[1].source_url, "https://example.edu/current-fees");
  assert.deepEqual(rows, before);
});

const award = (
  id: string,
  deadline: string | null,
  extra: Partial<Scholarship> = {},
): Scholarship => ({
  id,
  slug: id,
  name: "Award " + id,
  description: "Tuition scholarship",
  deadline,
  country_code: "GB",
  level: "Master",
  funding_type: "full",
  amount: null,
  currency: "GBP",
  application_url: "https://example.org/award",
  published: true,
  year: 2026,
  international: null,
  university_scholarships: [],
  source_id: null,
  verification_status: "verified",
  verified_at: null,
  notes: null,
  ...extra,
});
const filters = {
  query: "",
  funding: "all",
  level: "all",
  includeClosed: false,
  today: "2026-10-01",
};
test("scholarships distinguish expired, unknown, impossible and same-day deadlines", () => {
  assert.equal(
    scholarshipDeadline(award("closed", "2026-09-30"), filters.today),
    "closed",
  );
  assert.equal(
    scholarshipDeadline(award("today", "2026-10-01"), filters.today),
    "upcoming",
  );
  for (const date of [null, "not a date", "2026-02-30"]) {
    assert.equal(
      scholarshipDeadline(award("unknown", date), filters.today),
      "unknown",
    );
  }
});
test("award search respects publication, eligibility filters, closed-cycle opt-in and exact slug", () => {
  const rows = [
    award("expired", "2026-09-01"),
    award("first", "2026-10-02"),
    award("second", "2026-10-03", {
      description: "Travel allowance",
      funding_type: "partial",
    }),
    award("undated", null),
    award("draft", null, { published: false }),
    award("review", null, { verification_status: "needs_review" }),
  ];
  assert.deepEqual(
    filterScholarships(rows, filters).map((a) => a.id),
    ["first", "second", "undated"],
  );
  assert.deepEqual(
    filterScholarships(rows, {
      ...filters,
      query: "travel",
      funding: "partial",
      level: "Master",
    }).map((a) => a.id),
    ["second"],
  );
  assert.deepEqual(
    filterScholarships(rows, {
      ...filters,
      includeClosed: true,
      slug: "expired",
    }).map((a) => a.id),
    ["expired"],
  );
  assert.equal(
    filterScholarships(rows, { ...filters, slug: "missing" }).length,
    0,
  );
  assert.equal(
    filterScholarships(rows, { ...filters, level: "Bachelor" }).length,
    0,
  );
  assert.equal(rows[0].id, "expired");
});
