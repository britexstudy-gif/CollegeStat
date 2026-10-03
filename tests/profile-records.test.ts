import { test } from "node:test";
import assert from "node:assert/strict";
import { globalCatalogue } from "../server/global-catalogue";
import {
  historicalSeries,
  isCurrentObservation,
  recordsForCategory,
} from "../lib/profile-records";
import { rankLabel, universityRanks } from "../lib/ranking-highlights";
test("reported years, not download dates, determine current and historical observations", () => {
  const u = globalCatalogue.find((u) => u.name === "Harvard University")!;
  const admissions = recordsForCategory(u.imported_records || [], "Admissions");
  assert.ok(admissions.some((r) => r.reporting_year === 2024));
  assert.ok(admissions.every((r) => !isCurrentObservation(r)));
  const series = historicalSeries(admissions).find(
    (g) => g[0].metric === "acceptance_rate",
  );
  assert.deepEqual(
    series?.map((r) => r.reporting_year),
    [2023, 2024],
  );
  assert.ok(
    recordsForCategory(u.imported_records || [], "Students").some(
      (r) => r.reporting_year === 2025 && isCurrentObservation(r),
    ),
  );
  assert.ok(u.application_url?.startsWith("https://"));
  assert.ok(u.financial_aid_url?.startsWith("https://"));
});
test("ranking bands and publisher scores survive profile normalization", () => {
  const ranks = globalCatalogue.flatMap((u) => universityRanks(u));
  const band = ranks.find((r) => r.band)!;
  assert.ok(band && /[-–+]/.test(rankLabel(band)));
  const oxford = globalCatalogue.find((u) => u.slug === "oxford")!;
  const rank = universityRanks(oxford).find((r) => r.provider === "the")!;
  assert.equal(rank.score, "98.2");
  assert.equal(rank.scores?.teaching, "97.2");
});
