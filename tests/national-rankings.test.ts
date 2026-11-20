import test from "node:test";
import assert from "node:assert/strict";
import snapshot from "../data/published/reviewed-national-rankings.json";
import search from "../data/published/national-ranking-search.json";
import { nationalRankingTable, type NationalRankingSnapshot } from "../lib/national-rankings";
const reviewed = snapshot as unknown as NationalRankingSnapshot;

test("official national tables retain every source position and evidence", () => {
  assert.equal(reviewed.providers.find(p => p.provider === "herd")!.records.length, 925);
  assert.equal(reviewed.providers.find(p => p.provider === "nirf")!.records.length, 114);
  for (const source of reviewed.providers) for (const row of source.records) {
    assert.equal(row.publication_status, "review");
    assert.equal(row.verification_status, "verified");
    assert.match(row.source_url, /^https:\/\//);
    assert.ok(row.reporting_period && row.retrieved_at && row.scope);
  }
});
test("NIRF categories cannot be collapsed into one fabricated rank", () => {
  const overall = nationalRankingTable(reviewed, new URLSearchParams("provider=nirf"));
  assert.equal(overall.category, "Overall");
  assert.equal(overall.total, 10);
  assert.equal(overall.categories.length, 17);
  assert.equal(overall.complete, false);
  const engineering = nationalRankingTable(reviewed, new URLSearchParams("provider=nirf&category=Engineering"));
  assert.ok(engineering.rows.every(r => r.category === "Engineering"));
  assert.equal(nationalRankingTable(reviewed, new URLSearchParams("provider=nirf&category=Invented" )).category, "Overall");
});
test("combined HERD reporting units remain visible without fabricated university links", () => {
  const table = nationalRankingTable(reviewed, new URLSearchParams("provider=herd"));
  const johnsHopkins = table.rows[0];
  assert.equal(johnsHopkins.identity_status, "aggregate_reporting_unit");
  assert.equal(johnsHopkins.university_id, null);
  assert.equal(johnsHopkins.total_rd_thousand_usd, 4129264);
  assert.equal(johnsHopkins.rank_label, "1");
});
test("search and pagination retain original positions and do not mutate source receipt", () => {
  const filtered = nationalRankingTable(reviewed, new URLSearchParams("provider=herd&q=harvard"));
  assert.equal(filtered.rows[0].name.toLowerCase().includes("harvard"), true);
  assert.equal(filtered.rows[0].rank, reviewed.providers[0].records.find(r => r.name === filtered.rows[0].name)!.rank);
  const table = nationalRankingTable(reviewed, new URLSearchParams("provider=herd&page=999999"));
  assert.equal(table.page, table.pages);
  const original = reviewed.providers[0].records[0];
  nationalRankingTable(reviewed, new URLSearchParams()).rows[0].name = "changed in response only";
  assert.equal(original.name, "Johns Hopkins U.a");
});
test("canonical identity names find abbreviated publisher entries without changing their position", () => {
  const table = nationalRankingTable(reviewed, new URLSearchParams("provider=herd&q=University+of+Pennsylvania"), search.names);
  const entry = table.rows.find(row => row.name === "U. Pennsylvania");
  assert.ok(entry);
  assert.equal(table.total, 1);
  assert.equal(entry.rank_label, "2");
  assert.equal(entry.name, "U. Pennsylvania");
  assert.equal(nationalRankingTable(reviewed, new URLSearchParams("provider=herd&q=unlisted-fictitious-university"), search.names).total, 0);
  const engineering = nationalRankingTable(reviewed, new URLSearchParams("provider=nirf&category=Engineering&q=Indian+Institute"), search.names);
  assert.ok(engineering.rows.length > 0);
  assert.ok(engineering.rows.every(row => row.category === "Engineering"));
});
test("reviewed new profile links preserve immutable positions and never link aggregate units", () => {
  const source = reviewed.providers.find(p => p.provider === "nirf")!;
  const record = source.records.find(r => r.id === "cdc00cf0-dc81-5c47-bc00-2bc41d27fc6f")!;
  assert.equal(record.university_id, null);
  const table = nationalRankingTable(reviewed, new URLSearchParams("provider=nirf&category=Law&q=Nalsar+University+of+Law"), search.names, search.identity_links);
  assert.equal(table.total, 1);
  assert.equal(table.rows[0].university_id, "f72407ef-ba7a-5b73-b194-56de14b58c7a");
  assert.equal(table.rows[0].rank_label, record.rank_label);
  assert.equal(table.profileMatches, 62);
  assert.equal(record.university_id, null);
  const aggregate = reviewed.providers[0].records[0];
  const herd = nationalRankingTable(reviewed, new URLSearchParams("provider=herd"), {}, { [aggregate.id]: "forbidden" });
  assert.equal(herd.rows[0].university_id, null);
});
