import { test } from "node:test";
import assert from "node:assert/strict";
import type { RankingEntry } from "../lib/domain";
import {
  rankLabel,
  universityRanks,
  type RankHighlight,
} from "../lib/ranking-highlights";

const source = "https://www.topuniversities.com/published-observation";
const snapshot = (patch: Partial<RankHighlight> = {}): RankHighlight => ({
  domain: "mit.edu",
  provider: "qs",
  year: 2026,
  rank: 1,
  tied: false,
  rank_label: "1",
  url: source,
  ...patch,
});
const entry = (patch: Partial<RankingEntry> = {}): RankingEntry => ({
  id: "ranking-entry",
  university_id: "university",
  edition_id: "edition",
  year: 2028,
  source_id: "publisher-source",
  source_url: "https://www.topuniversities.com/new-edition-observation",
  verification_status: "verified",
  verified_at: "2026-10-10T00:00:00Z",
  notes: null,
  rank: 22,
  rank_label: "=22",
  score: null,
  ranking_editions: {
    id: "edition",
    provider_id: "publisher",
    year: 2028,
    subject: "Overall",
    region: "Global",
    permitted: true,
    ranking_providers: {
      id: "publisher",
      name: "QS",
      slug: "qs",
      website: "https://www.topuniversities.com/",
      license_status: "permitted",
      methodology: null,
    },
  },
  ...patch,
});

test("recognizable university websites do not manufacture missing sourced rankings", () => {
  for (const host of [
    "mit.edu",
    "www.harvard.edu",
    "stanford.edu",
    "ox.ac.uk",
    "nus.edu",
    "nus.edu.sg",
  ]) {
    for (const rankings of [undefined, []]) {
      assert.deepEqual(
        universityRanks({ website: "https://" + host, rankings }),
        [],
      );
    }
  }
});

test("sourced historical observations retain their edition, labels, values and URLs", () => {
  const rankings = [
    snapshot({ year: 2026, rank: 2, tied: true, rank_label: "=2" }),
    snapshot({
      provider: "arwu",
      year: 2025,
      rank: 101,
      tied: false,
      band: true,
      rank_label: "101–150",
      url: "https://www.shanghairanking.com/rankings/arwu/2025",
    }),
  ];
  const before = structuredClone(rankings);
  const result = universityRanks({ website: "https://mit.edu", rankings });
  assert.strictEqual(result[0], rankings[0]);
  assert.strictEqual(result[1], rankings[1]);
  assert.equal(result[0].year, 2026);
  assert.equal(result[1].year, 2025);
  assert.deepEqual(result.map(rankLabel), ["=2", "101–150"]);
  assert.deepEqual(rankings, before);
});

test("newest verified world-overall relational observation takes precedence and preserves ties", () => {
  const historical = snapshot();
  const live = entry();
  const before = structuredClone(live);
  const result = universityRanks({
    website: "https://mit.edu",
    rankings: [historical],
    ranking_entries: [live],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].year, 2028);
  assert.equal(result[0].rank, 22);
  assert.equal(result[0].tied, true);
  assert.equal(rankLabel(result[0]), "=22");
  assert.equal(result[0].url, live.source_url);
  assert.deepEqual(live, before);
  assert.equal(historical.year, 2026);
});

test("verified band labels stay bands when their numeric sort key is absent", () => {
  for (const [label, rank] of [
    ["101–150", 101],
    ["801+", 801],
  ] as const) {
    const result = universityRanks({
      website: null,
      rankings: [snapshot()],
      ranking_entries: [entry({ rank: null, rank_label: label })],
    });
    assert.equal(result[0].year, 2028);
    assert.equal(result[0].rank, rank);
    assert.equal(result[0].band, true);
    assert.equal(rankLabel(result[0]), label);
  }
});

test("unverified or out-of-scope entries cannot replace a dated sourced observation", () => {
  const verified = entry();
  const edition = verified.ranking_editions!;
  const invalid = [
    entry({ verification_status: "needs_review" }),
    entry({ ranking_editions: { ...edition, permitted: false } }),
    entry({ ranking_editions: { ...edition, subject: "Medicine" } }),
    entry({ ranking_editions: { ...edition, region: "Asia" } }),
  ];
  for (const row of invalid) {
    const observed = snapshot({ year: 2023 });
    assert.deepEqual(
      universityRanks({
        website: "https://mit.edu",
        rankings: [observed],
        ranking_entries: [row],
      }),
      [observed],
    );
    assert.deepEqual(
      universityRanks({ website: "https://mit.edu", ranking_entries: [row] }),
      [],
    );
  }
});

test("selection is by actual observation year, with relational precedence only within the same edition", () => {
  const historical = entry({
    year: 2024,
    ranking_editions: { ...entry().ranking_editions!, year: 2024 },
  });
  const newerSnapshot = snapshot({ year: 2027, rank: 3, rank_label: "3" });
  assert.strictEqual(
    universityRanks({
      website: "https://mit.edu",
      rankings: [newerSnapshot],
      ranking_entries: [historical],
    })[0],
    newerSnapshot,
  );
  const sameEdition = entry({
    year: 2027,
    ranking_editions: { ...entry().ranking_editions!, year: 2027 },
  });
  const result = universityRanks({
    website: "https://mit.edu",
    rankings: [newerSnapshot],
    ranking_entries: [sameEdition],
  });
  assert.equal(result[0].year, 2027);
  assert.equal(rankLabel(result[0]), "=22");
  assert.equal(newerSnapshot.rank, 3);
});
