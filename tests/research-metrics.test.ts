import assert from "node:assert/strict";
import test from "node:test";
import type { ResearchMetric } from "../lib/domain";
import {
  latestResearchMetrics,
  latestResearchTopics,
  researchYears,
} from "../lib/research-metrics";

const metric = (patch: Partial<ResearchMetric> = {}): ResearchMetric => ({
  id: "yearly-work-old",
  university_id: "institution",
  metric: "yearly_indexed_works",
  value: 200,
  unit: "works",
  period: "2025",
  field: null,
  edition: "2026-09-25",
  source_url: "https://api.openalex.org/institutions/I1",
  retrieved_at: "2026-09-25T08:00:00Z",
  verification_status: "verified",
  ...patch,
});

test("research display selects latest edition for each metric, period and field without changing history", () => {
  const rows = [
    metric(),
    metric({
      id: "yearly-work-current",
      value: 240,
      edition: "2026-10-05",
      retrieved_at: "2026-10-05T08:00:00Z",
    }),
    metric({ id: "older-year", period: "2024", value: 180 }),
    metric({ id: "field-specific", field: "Medicine", value: 90 }),
    metric({
      id: "different-institution",
      university_id: "other-institution",
      value: 500,
    }),
  ];
  const original = JSON.stringify(rows);
  const latest = latestResearchMetrics(rows);
  assert.equal(latest.length, 4);
  assert.equal(
    latest.find(
      (row) =>
        row.period === "2025" &&
        !row.field &&
        row.university_id === "institution",
    )?.value,
    240,
  );
  assert.equal(latest.find((row) => row.field === "Medicine")?.value, 90);
  assert.equal(JSON.stringify(rows), original);
});

test("yearly research preserves zero, missing values, partial years and the citation provider rollup", () => {
  const rows = [
    metric({ id: "current-year", period: "2026", value: 100 }),
    metric({
      id: "zero-open-access",
      period: "2026",
      metric: "yearly_open_access_works",
      value: 0,
    }),
    metric({
      id: "citation-bucket",
      period: "2026",
      metric: "yearly_citation_rollup",
      value: 900,
    }),
    metric({ id: "previous-year", period: "2025", value: 200 }),
    metric({ id: "future", period: "2027" }),
    metric({
      id: "unverified",
      period: "2024",
      verification_status: "needs_review",
    }),
    metric({ id: "negative", period: "2023", value: -2 }),
    metric({
      id: "unsafe-source",
      period: "2022",
      source_url: "http://example.com",
    }),
    metric({ id: "invalid-date", period: "2021", retrieved_at: "unknown" }),
  ];
  const years = researchYears(rows);
  assert.deepEqual(
    years.map((row) => row.year),
    [2025, 2026],
  );
  assert.equal(years[0].partial, false);
  assert.equal(years[0].openAccess, undefined);
  assert.equal(years[1].partial, true);
  assert.equal(years[1].works?.value, 100);
  assert.equal(years[1].openAccess?.value, 0);
  assert.equal(years[1].citationRollup?.value, 900);
});

test("research topic display uses one dated snapshot and does not mix removed historical topics", () => {
  const rows = [
    metric({
      id: "old-topic",
      metric: "topic_indexed_works",
      field: "Historical topic",
      period: "All years · snapshot 2026-09-25",
      value: 1000,
    }),
    metric({
      id: "current-topic",
      metric: "topic_indexed_works",
      field: "Current topic",
      period: "All years · snapshot 2026-10-05",
      edition: "2026-10-05",
      retrieved_at: "2026-10-05T08:00:00Z",
      value: 30,
    }),
    metric({
      id: "current-topic-2",
      metric: "topic_indexed_works",
      field: "Another current topic",
      period: "All years · snapshot 2026-10-05",
      edition: "2026-10-05",
      retrieved_at: "2026-10-05T08:00:00Z",
      value: 60,
    }),
  ];
  assert.deepEqual(
    latestResearchTopics(rows).map((row) => row.id),
    ["current-topic-2", "current-topic"],
  );
  assert.equal(
    latestResearchTopics(rows.filter((row) => row.edition === "2026-09-25"))[0]
      .id,
    "old-topic",
  );
});
