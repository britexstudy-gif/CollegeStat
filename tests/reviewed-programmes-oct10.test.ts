import test from "node:test";
import assert from "node:assert/strict";
import reviewed from "../data/published/reviewed-programmes-oct10.json";
import { normalizeUniversity } from "../lib/domain";
import { programListings } from "../lib/program-discovery";

test("five verified programme offers attach only to exact identities with null unknown fields", () => {
  assert.equal(reviewed.status, "published_verified");
  assert.equal(reviewed.records.length, 5);
  const waterloo = normalizeUniversity({id: "808b96a5-0e59-5215-a2f5-e7c3c5d2785a"});
  const wiut = normalizeUniversity({id: "66666666-6666-4666-8666-666666666666"});
  assert.equal(waterloo.university_programs.length, 3);
  assert.equal(wiut.university_programs.length, 2);
  assert.equal(normalizeUniversity({id: "11111111-1111-4111-8111-111111111111"}).university_programs.length, 0);
  for(const row of [...waterloo.university_programs, ...wiut.university_programs]) {
    assert.equal(row.year, null);
    assert.equal(row.reporting_year, null);
    assert.equal(row.programs.language, null);
    assert.ok(row.source_id && row.verified_at && row.evidence?.population);
    assert.ok(row.evidence?.source_sha256 && row.evidence?.retrieved_at);
  }
  assert.ok(!wiut.university_programs.some(r=>r.programs.name==='BSc (Hons) in Economics'));
});

test("hosted programme receipt is deduplicated and exact award/intake facts survive display normalization", () => {
  const wiut = normalizeUniversity({id: "66666666-6666-4666-8666-666666666666"});
  const again=normalizeUniversity(wiut);
  assert.equal(again.university_programs.length, 2);
  const listings=programListings(again);
  assert.equal(listings[0].qualification, "Bachelor of Arts (Hons)");
  assert.equal(listings[0].durationMonths, 36);
  assert.deepEqual(listings[0].intakes, ["September"]);
  assert.equal(listings[0].language, null);
  const waterloo=programListings(normalizeUniversity({id:"808b96a5-0e59-5215-a2f5-e7c3c5d2785a"}));
  assert.ok(waterloo.every(r=>r.durationMonths===null && !r.intakes?.length));
});
