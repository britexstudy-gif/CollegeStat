import { test } from "node:test";
import assert from "node:assert/strict";
import { globalCatalogue } from "../server/global-catalogue";
import { rankingTable } from "../server/ranking-table";
import { universityRanks } from "../lib/ranking-highlights";
test("full ARWU table retains national labels and pagination", () => {
  const table = rankingTable(new URLSearchParams("provider=arwu"));
  assert.equal(table.total, 1000);
  assert.equal(table.year, 2026);
  assert.equal(table.complete, true);
  assert.equal(table.pages, 42);
  assert.equal(table.rows[0].nationalRank, "1");
  assert.equal(
    rankingTable(new URLSearchParams("provider=arwu&page=42")).rows.length,
    16,
  );
});
test("program and research evidence survives university normalization", () => {
  assert.equal(
    globalCatalogue.filter((u) => u.reported_programs?.length).length,
    2731,
  );
  assert.equal(
    globalCatalogue.reduce((n, u) => n + (u.reported_programs?.length || 0), 0),
    148432,
  );
  assert.ok(
    globalCatalogue.filter((u) => u.research_identity?.papers.length).length >=
      847,
  );
  assert.ok(
    globalCatalogue.filter((u) => u.publisher_students?.subjects?.length)
      .length > 1400,
  );
  const tum = globalCatalogue.find((u) => u.website?.includes("tum.de"))!;
  assert.ok(tum.university_programs.length > 100);
  assert.ok(
    globalCatalogue.filter((u) => u.institution_image_url).length > 3600,
  );
});
test("regional position is sourced or preserves global-table bands", () => {
  const u = globalCatalogue.find((u) =>
    universityRanks(u).some((r) => r.provider === "arwu" && r.year === 2026),
  )!;
  assert.ok(
    universityRanks(u).find((r) => r.provider === "arwu")?.national_rank,
  );
  const qs = globalCatalogue
    .flatMap(universityRanks)
    .find(
      (r) =>
        r.provider === "qs" &&
        r.year === 2027 &&
        r.band &&
        r.country_position?.includes("-"),
    );
  assert.ok(qs);
});
