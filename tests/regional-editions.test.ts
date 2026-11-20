import { test } from "node:test";
import assert from "node:assert/strict";
import {
  latestRegionalEditions,
  regionalRanksForUniversity,
  resolveRegionalScope,
} from "../lib/regional-rankings";
import { rankingTable } from "../server/ranking-table";
import type { University } from "../lib/domain";
import rankingRows from "../data/published/ranking-all.json";
import linkedRows from "../data/published/ranking-records.json";
import manifest from "../data/published/ranking-manifest.json";
import unmatchedRows from "../data/published/ranking-unmatched.json";

test("available verified editions retain hosted scopes absent from a local selection", async () => {
  const editions = latestRegionalEditions([
    { scope: "Europe", year: 2025 },
    { scope: "Europe", year: 2026 },
    { scope: "Arab Region", year: 2027 },
    { scope: "Latin America & Caribbean", year: 2027 },
    { scope: "Global", year: 2027 },
    { scope: "World", year: 2026 },
    { scope: "Africa", year: 9999 },
  ]);
  assert.equal(editions.length, 3);
  assert.equal(editions.find((e) => e.scope === "Europe")?.year, 2026);
  assert.equal(resolveRegionalScope("Arab Region", editions), "Arab Region");
  assert.equal(resolveRegionalScope("unknown", editions), "Europe");
  assert.equal(
    resolveRegionalScope("unknown", [{ scope: "Asia", year: 2026 }]),
    "Asia",
  );
  const table = await rankingTable(
    new URLSearchParams("scope=regional&edition=Arab Region"),
    [
      {
        domain: "example.edu",
        name: "Verified fixture university",
        scope: "Arab Region",
        year: 2027,
        rank_label: "=2",
        source_url: "https://example.edu/official-ranking",
      },
    ],
    editions,
  );
  assert.equal(table.scopeLabel, "Arab Region");
  assert.equal(table.rows[0].rank, "=2");
  assert.equal(table.complete, false);
  assert.deepEqual(table.regionalEditions, editions);
  const empty = await rankingTable(
    new URLSearchParams("scope=regional&edition=Europe"),
    [],
    editions,
  );
  assert.equal(empty.year, 2026);
  assert.equal(empty.total, 0);
});

test("UUID-linked regional evidence is visible without a bundled host or scope", () => {
  const university = {
    name: "Reviewed institution",
    website: null,
    ranking_entries: [
      {
        rank: 3,
        rank_label: "=3",
        source_id: "reviewed-source",
        verified_at: "2026-10-06",
        verification_status: "verified",
        source_url: "https://example.edu/ranking-source",
        ranking_editions: {
          year: 2027,
          subject: "Overall",
          region: "Latin America & Caribbean",
          permitted: true,
          ranking_providers: { slug: "qs" },
        },
      },
    ],
  } as unknown as University;
  assert.equal(regionalRanksForUniversity(university)[0]?.rank_label, "=3");
  university.ranking_entries![0].ranking_editions!.region = "Global";
  assert.deepEqual(regionalRanksForUniversity(university), []);
  university.ranking_entries![0].ranking_editions!.region = "Europe";
  university.ranking_entries![0].verification_status = "needs_review";
  assert.deepEqual(regionalRanksForUniversity(university), []);
});

test("derived ranking manifests agree with exact installed links and held rows", () => {
  const linked = rankingRows.filter((row) => row.university_id);
  assert.equal(manifest.linked, linked.length);
  assert.equal(linkedRows.length, linked.length);
  assert.equal(manifest.unmatched, rankingRows.length - linked.length);
  assert.equal(unmatchedRows.length, manifest.unmatched);
  const byProvider: Record<string, number> = {};
  for (const row of linked)
    byProvider[row.provider] = (byProvider[row.provider] || 0) + 1;
  assert.deepEqual(manifest.by_provider, byProvider);
});
