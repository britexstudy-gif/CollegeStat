import test from "node:test";
import assert from "node:assert/strict";
import type { RankingEntry, University } from "../lib/domain";
import { profileRankingPositions } from "../lib/profile-ranking-positions";
import { rankingSystems, rankingSystemHref } from "../lib/ranking-systems";

function entry(
  provider: string,
  patch: Partial<RankingEntry> = {},
): RankingEntry {
  return {
    id: "record",
    university_id: "university",
    edition_id: "edition",
    source_id: "source",
    rank: 12,
    rank_label: "12",
    score: null,
    year: 2025,
    verification_status: "verified",
    verified_at: "2026-10-10T12:00:00Z",
    notes: null,
    source_url: "https://publisher.example/table",
    ranking_editions: {
      id: "edition",
      provider_id: provider,
      year: 2025,
      subject: "Engineering",
      region: "India",
      permitted: true,
      ranking_providers: {
        id: provider,
        slug: provider,
        name: provider,
        website: null,
        methodology: null,
        license_status: "permitted",
      },
    },
    ...patch,
  };
}
function university(entries: RankingEntry[]): University {
  return {
    id: "university",
    name: "Example University",
    website: "https://example.invalid",
    country_code: "IN",
    ranking_entries: entries,
  } as University;
}

test("national profile positions preserve subject, scope, edition and publisher bands", () => {
  const nirf = entry("nirf", { rank_label: "=12" });
  const herd = entry("herd", {
    rank_label: "101–200",
    rank: 101,
    ranking_editions: {
      ...entry("herd").ranking_editions!,
      year: 2024,
      subject: "Total R&D expenditure",
      region: "United States and outlying areas",
    },
  });
  const positions = profileRankingPositions(university([nirf, herd]));
  assert.equal(positions.length, 2);
  assert.equal(
    positions.find((position) => position.provider === "nirf")?.label,
    "=12",
  );
  assert.deepEqual(
    positions.find((position) => position.provider === "herd"),
    {
      provider: "herd",
      year: 2024,
      scope: "United States and outlying areas",
      subject: "Total R&D expenditure",
      label: "101–200",
      url: "https://publisher.example/table",
    },
  );
});

test("only a verified permitted entry for this exact university can add a profile position", () => {
  const valid = entry("nirf");
  for (const patch of [
    { university_id: "another-university" },
    { verification_status: "needs_review" as const },
    { source_id: null },
    { verified_at: null },
    { canonical: false },
    { source_url: "javascript:alert(1)" },
    { rank: 0, rank_label: "0" },
    { ranking_editions: { ...valid.ranking_editions!, permitted: false } },
  ])
    assert.deepEqual(
      profileRankingPositions(university([{ ...valid, ...patch }])),
      [],
    );
  // An external publisher reference and research indicators never invent a rank.
  assert.deepEqual(
    profileRankingPositions(university([entry("time"), entry("leiden")])),
    [],
  );
});

test("the latest edition wins per scope and subject while conflicting values stay hidden", () => {
  const older = entry("nirf", { rank_label: "20", rank: 20 });
  const newer = entry("nirf", {
    ranking_editions: { ...older.ranking_editions!, year: 2026 },
  });
  const differentSubject = entry("nirf", {
    ranking_editions: { ...older.ranking_editions!, subject: "Overall" },
  });
  const positions = profileRankingPositions(
    university([older, newer, differentSubject]),
  );
  assert.equal(positions.length, 2);
  assert.equal(
    positions.find((position) => position.subject === "Engineering")?.year,
    2026,
  );
  assert.equal(
    positions.find((position) => position.subject === "Overall")?.year,
    2025,
  );
  assert.deepEqual(
    profileRankingPositions(university([older, entry("nirf")])),
    [],
  );
});

test("publisher references have direct source URLs and keep their external status", () => {
  const time = rankingSystems.find((system) => system.slug === "time")!;
  assert.equal(time.edition, "2026");
  assert.equal(time.imported, false);
  assert.match(rankingSystemHref(time), /^https:\/\/time\.com\//);
  // CWUR and URAP tables joined the installed systems on 2026-10-21.
  assert.equal(rankingSystems.filter((system) => system.imported).length, 10);
});
