import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseResearchQuery,
  filterSchema,
  filterUniversities,
  defaultFilters,
  fitScore,
  median,
  convertCurrency,
  observationSchema,
  qualityWarnings,
} from "../lib/research";
import { safeNext, normalizeUniversity, University } from "../lib/domain";
import reference from "../supabase/reference-catalogue.json";
const universities = (reference as unknown as University[]).map(
  normalizeUniversity,
);
test("natural language becomes bounded structured filters", () => {
  const r = parseResearchQuery(
    "English-taught AI bachelors in Germany under $20k",
  );
  assert.equal(r.filters.country, "DE");
  assert.equal(r.filters.cost_max, 20000);
  assert.equal(r.filters.field, "Artificial Intelligence");
  assert.equal(r.filters.language, "English");
  assert.equal(r.filters.degree, "Bachelor");
  assert.equal(filterSchema.safeParse({ admission_min: 120 }).success, false);
});
test("missing costs do not pass budget filters; actual zero is preserved", () => {
  assert.equal(
    filterUniversities(universities, { ...defaultFilters, cost_max: 20000 })
      .length,
    0,
  );
  assert.equal(median([null, 0, 10]), 5);
});
test("fit excludes missing dimensions instead of counting them as zero", () => {
  const f = fitScore(universities[0], {
    countries: ["US"],
    budget: 20000,
    currency: "USD",
  });
  assert.equal(f.score, 100);
  assert.equal(f.components.find((c) => c.key === "budget")?.value, null);
  assert.equal(fitScore(universities[0], {}).score, null);
  assert.equal(
    fitScore(universities[0], { countries: ["US"], weights: { location: 0 } })
      .score,
    null,
  );
});
test("currency requires directional sourced rate; zero amount remains zero", () => {
  assert.equal(convertCurrency(100, "USD", "EUR", []), null);
  assert.equal(convertCurrency(0, "USD", "USD", [])?.amount, 0);
  assert.equal(
    convertCurrency(100, "USD", "EUR", [
      {
        base_currency: "USD",
        quote_currency: "EUR",
        rate: 0.9,
        observed_at: "2026-01-01",
      },
    ])?.amount,
    90,
  );
});
test("validators reject malformed observations and flag large changes", () => {
  const row = {
    university_id: universities[0].id,
    metric: "admission",
    year: 2025,
    value: 101,
    unit: "%",
    source_url: "https://example.edu",
  };
  assert.equal(observationSchema.safeParse(row).success, false);
  assert.equal(
    observationSchema.safeParse({ ...row, value: 4.6 }).success,
    true,
  );
  assert.equal(qualityWarnings(6500, 65000).length, 1);
});
test("callback only restores safe local destinations", () => {
  assert.equal(safeNext("//evil.example"), "/dashboard");
  assert.equal(safeNext("https://evil.example"), "/dashboard");
  assert.equal(safeNext("/\\evil.example"), "/dashboard");
  assert.equal(safeNext("/saved"), "/saved");
});

test("smart search keeps university names and recognizes whole country words", () => {
  const oxford = parseResearchQuery("Oxford in UK");
  assert.equal(oxford.filters.country, "GB");
  assert.equal(oxford.filters.q, "oxford");
  assert.equal(parseResearchQuery("American University").filters.country, "");
  assert.equal(
    parseResearchQuery("Physics masters in Japan").filters.field,
    "Physics",
  );
});
test("historical programs never imply a language qualification", () => {
  const u = {
    ...universities[0],
    university_programs: [],
    reported_programs: [
      {
        cip: "11.0701",
        name: "Computer Science",
        award: "Master",
        level: "Master",
        completions: 15,
        year: 2025,
      },
    ],
  };
  assert.equal(
    filterUniversities([u], {
      ...defaultFilters,
      field: "Computer Science",
      degree: "Master",
    }).length,
    1,
  );
  assert.equal(
    filterUniversities([u], {
      ...defaultFilters,
      field: "Computer Science",
      degree: "Master",
      language: "English",
    }).length,
    0,
  );
});
test("acceptance percentages do not become a tuition budget", () => {
  const r = parseResearchQuery("universities in Canada acceptance below 25%");
  assert.equal(r.filters.admission_max, 25);
  assert.equal(r.filters.cost_max, undefined);
  assert.equal(r.filters.q, "");
});
