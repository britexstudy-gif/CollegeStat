import test from "node:test";
import assert from "node:assert/strict";
import { hydrateNationalRankingProfiles } from "../server/national-ranking-profiles";
import { nationalRankingTable, type NationalRankingSnapshot } from "../lib/national-rankings";
import snapshot from "../data/published/reviewed-national-rankings.json";
import { normalizeUniversity } from "../lib/domain";

function sourceTable() {
  return nationalRankingTable(snapshot as unknown as NationalRankingSnapshot, new URLSearchParams("provider=nirf"));
}
test("optional profile hydration cannot suppress original publisher positions on a deadline", async () => {
  const table = sourceTable();
  const original = structuredClone(table);
  let lookupSignal: AbortSignal | undefined;
  const result = await hydrateNationalRankingProfiles(table, (_ids, signal) => {
    lookupSignal = signal;
    return new Promise(() => {});
  }, new AbortController().signal, 15);
  assert.deepEqual(result, original);
  assert.ok(lookupSignal?.aborted);
});
test("failed and cancelled optional identity reads keep source ranks and evidence", async () => {
  for (const cancel of [false, true]) {
    const table = sourceTable();
    const original = structuredClone(table);
    const controller = new AbortController();
    if (cancel) controller.abort();
    const result = await hydrateNationalRankingProfiles(table, async () => {
      throw new Error("Synthetic lookup unavailable");
    }, controller.signal);
    assert.deepEqual(result, original);
  }
});
test("only exact linked public identities receive profile links, never changed positions", async () => {
  const table = sourceTable();
  const linked = table.rows.find(row => row.university_id)!;
  const original = structuredClone(table);
  const unrelated = normalizeUniversity({ id: "unrelated", name: "Unrelated", slug: "unrelated" });
  const match = normalizeUniversity({ id: linked.university_id!, name: "Linked public institution", slug: "linked-public" });
  const result = await hydrateNationalRankingProfiles(table, async () => [unrelated, match], new AbortController().signal);
  assert.equal(result.rows.find(row => row.id === linked.id)?.university?.slug, "linked-public");
  for (let index = 0; index < result.rows.length; index++) {
    const source = { ...result.rows[index] };
    delete source.university;
    assert.deepEqual(source, original.rows[index]);
  }
});
test("source entries with no reconciled identity skip optional lookup entirely", async () => {
  const table = sourceTable();
  table.rows = table.rows.map(row => ({ ...row, university_id: null }));
  await hydrateNationalRankingProfiles(table, async () => { throw new Error("Must not fetch"); }, new AbortController().signal);
  assert.ok(table.rows.every(row => !row.university));
});
