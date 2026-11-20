import test from "node:test";
import assert from "node:assert/strict";
import { researchNameQuery, selectLocalResearch } from "../lib/research-selection";
import { defaultFilters } from "../lib/research";
import { normalizeUniversity } from "../lib/domain";

test("named evidence questions use a bounded identity query without dropping constrained searches", () => {
  assert.equal(researchNameQuery("What does MIT report about tuition?"), "MIT");
  assert.equal(researchNameQuery("How much does University of Pennsylvania charge?"), "University of Pennsylvania");
  assert.equal(researchNameQuery("Universities in Canada under $20k"), "Universities in Canada under $20k");
  assert.equal(researchNameQuery("What does " + "x".repeat(500)).length, 200);
});

test("fuzzy candidate lookup cannot turn an unrelated institution into named evidence", () => {
  const mit = normalizeUniversity({ id: "a", slug: "mit", name: "Massachusetts Institute of Technology", short_name: "MIT", country_code: "US" } as never);
  const unrelated = normalizeUniversity({ id: "b", slug: "unrelated", name: "Unrelated University", country_code: "US" } as never);
  const input = { question: "What does MIT report about tuition?", ids: [] };
  const interpretation = { recognized: false, filters: defaultFilters };
  assert.deepEqual(selectLocalResearch([mit, unrelated], input, interpretation).rows.map(u => u.id), ["a"]);
  assert.equal(selectLocalResearch([unrelated], input, interpretation).total, 0);
});
