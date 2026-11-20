import assert from "node:assert/strict";
import { test } from "node:test";
import installed from "../data/published/imported.json";

test("published public-data expansion retains historical source and observation context", () => {
  assert.equal(installed.records.length, 7701);

  const counts = installed.records.reduce<Record<string, number>>((result, record) => {
    result[record.source] = (result[record.source] || 0) + 1;
    return result;
  }, {});

  assert.deepEqual(counts, {
    ipeds: 395,
    leiden: 7168,
    openalex: 72,
    ror: 24,
    scorecard: 30,
    wikidata: 12,
  });
  assert.ok(installed.records.every((record) => record.source_url.startsWith("https://")));
  const held = installed.records.filter(record => record.verification_status !== "verified" || record.publication_status !== "published");
  assert.equal(held.length, 10);
  assert.ok(held.every(record => record.source === "leiden" && record.verification_status === "needs_review" && record.publication_status === "review" && ["international_collaboration_publications", "international_collaboration_share"].includes(record.metric)));
  const impact = installed.records.filter(record => record.source === "leiden" && record.verification_status === "verified" && record.publication_status === "published");
  assert.equal(impact.length, 7158);
  assert.equal(new Set(impact.map(record => record.university_id)).size, 2386);
  assert.deepEqual(new Set(impact.map(record => record.metric)), new Set(["publications_fractional_core", "top_5_percent_publications_fractional_core", "top_5_percent_publications_share_fractional_core"]));
  assert.ok(installed.records.some((record) => record.value === 0));
  assert.ok(!installed.records.some((record) => record.source === "carnegie"));
  assert.ok(
    installed.records
      .filter((record) => record.source === "scorecard")
      .every((record) => record.reporting_year === 2023 && Boolean(record.cohort)),
  );
  assert.ok(
    installed.records
      .filter((record) => record.source === "openalex")
      .every((record) => record.reporting_year === null || record.reporting_year < 3000),
  );
});
