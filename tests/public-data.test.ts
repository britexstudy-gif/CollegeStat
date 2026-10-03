import assert from "node:assert/strict";
import { test } from "node:test";
import installed from "../data/published/imported.json";

test("published public-data pilot retains source and observation context", () => {
  assert.equal(installed.records.length, 548);

  const counts = installed.records.reduce<Record<string, number>>((result, record) => {
    result[record.source] = (result[record.source] || 0) + 1;
    return result;
  }, {});

  assert.deepEqual(counts, {
    ipeds: 395,
    leiden: 15,
    openalex: 72,
    ror: 24,
    scorecard: 30,
    wikidata: 12,
  });
  assert.ok(installed.records.every((record) => record.source_url.startsWith("https://")));
  assert.ok(installed.records.every((record) => record.verification_status === "verified"));
  assert.ok(installed.records.every((record) => record.publication_status === "published"));
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
