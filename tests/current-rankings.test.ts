import { test } from "node:test";
import assert from "node:assert/strict";
import { rankingTable } from "../server/ranking-table";
import { regionalStatistics } from "../server/statistics";
import { globalCatalogue } from "../server/global-catalogue";
import { valueOf } from "../lib/research";
import { universityRanks } from "../lib/ranking-highlights";
import { searchRelevance } from "../lib/search-text";
test("complete current publisher tables include unmatched institutions and all pagination boundaries", () => {
  const qs = rankingTable(new URLSearchParams("provider=qs"));
  assert.equal(qs.total, 1504);
  assert.equal(qs.year, 2027);
  assert.equal(qs.rows.length, 24);
  const final = rankingTable(new URLSearchParams("provider=qs&page=99999"));
  assert.equal(final.page, 63);
  assert.equal(final.rows.length, 16);
  const all = Array.from(
    { length: qs.pages },
    (_, i) =>
      rankingTable(new URLSearchParams(`provider=qs&page=${i + 1}`)).rows,
  ).flat();
  assert.equal(new Set(all.map((r) => r.name + "|" + r.country)).size, 1504);
  assert.ok(all.some((r) => !r.university));
  assert.ok(all.every((r) => r.country_code));
  assert.equal(rankingTable(new URLSearchParams("provider=the")).total, 2191);
  const mit = globalCatalogue.find((u) => u.slug === "mit")!;
  const stanford = globalCatalogue.find((u) => u.slug === "stanford")!;
  assert.equal(
    universityRanks(mit).find((r) => r.provider === "qs")?.year,
    2027,
  );
  assert.equal(
    universityRanks(stanford).find((r) => r.provider === "qs")?.rank,
    2,
  );
  assert.equal(
    universityRanks(stanford).find((r) => r.provider === "qs")?.tied,
    true,
  );
});
test("regional counts retain full publisher totals; admissions rates retain year and coverage", () => {
  const stats = regionalStatistics();
  assert.equal(
    stats.countries.reduce((n, c) => n + c.qs, 0),
    1504,
  );
  assert.equal(
    stats.countries.reduce((n, c) => n + c.the, 0),
    2191,
  );
  assert.ok(
    stats.states.every(
      (s) =>
        s.admissionCoverage <= s.institutions &&
        (s.medianAdmission == null ||
          (s.medianAdmission >= 0 && s.medianAdmission <= 100)),
    ),
  );
  const harvard = globalCatalogue.find((u) => u.name === "Harvard University")!;
  const admission = valueOf(harvard, "admission");
  assert.equal(admission.record?.year, 2025);
  assert.equal(admission.value, 100 * 2003 / 47893);
  assert.equal(admission.record?.data_sources?.url, "https://college.harvard.edu/admissions/admissions-statistics");
});
test("search boosts exact official names and abbreviations above broad name matches", () => {
  assert.ok(
    searchRelevance("mit", "Massachusetts Institute of Technology", ["MIT"]) >
      searchRelevance("mit", "Smith College"),
  );
  assert.ok(
    searchRelevance("oxford", "University of Oxford", ["Oxford"]) >
      searchRelevance("oxford", "Oxford Brookes University"),
  );
});
test("reference identity reconciliation keeps current costs and student snapshots on the canonical profile", () => {
  const mit = globalCatalogue.filter((u) => u.identifiers?.ipeds === "166683");
  assert.equal(mit.length, 1);
  assert.equal(mit[0].slug, "mit");
  const harvard = globalCatalogue.find((u) => u.name === "Harvard University")!;
  const price = valueOf(harvard, "tuition_out_of_state");
  assert.equal(price.record?.year, 2024);
  assert.equal(price.currency, "USD");
  assert.ok(price.value! > 0);
  assert.ok(price.record?.data_sources?.url.includes("COST1_2024"));
  const oxford = globalCatalogue.find((u) => u.slug === "oxford")!;
  assert.equal(oxford.publisher_students?.edition, 2026);
  assert.equal(oxford.publisher_students?.international_percent, 43);
});
