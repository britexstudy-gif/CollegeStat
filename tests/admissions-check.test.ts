import test from "node:test";
import assert from "node:assert/strict";
import { categoryFor, listBalance, scorePosition, type AdmissionsRow } from "../lib/admissions-check";

const row = (rate: number | null, low: number | null, high: number | null): AdmissionsRow => ({
  id: "x", slug: "x", name: "X", city: null, state: null, applicants: 1000, admitted: 100,
  acceptance_rate: rate, sat_ebrw_25: null, sat_ebrw_75: null, sat_math_25: null, sat_math_75: null,
  sat_total_25: low, sat_total_75: high, act_25: 24, act_75: 30, test_policy: "test_optional",
});

test("score position uses the middle-50% range", () => {
  assert.equal(scorePosition({ sat: 1200 }, row(50, 1250, 1450)).band, "below");
  assert.equal(scorePosition({ sat: 1300 }, row(50, 1250, 1450)).band, "within");
  assert.equal(scorePosition({ sat: 1500 }, row(50, 1250, 1450)).band, "above");
  assert.equal(scorePosition({ act: 31 }, row(50, null, null)).band, "above");
  assert.equal(scorePosition({ sat: 1300 }, row(50, null, null)).band, "unknown");
});

test("very selective universities are always a reach", () => {
  assert.equal(categoryFor({ sat: 1600 }, row(4, 1500, 1580)), "reach");
  assert.equal(categoryFor({ sat: 1500 }, row(55, 1250, 1450)), "likely");
  assert.equal(categoryFor({ sat: 1350 }, row(55, 1250, 1450)), "target");
  assert.equal(categoryFor({ sat: 1100 }, row(55, 1250, 1450)), "reach");
  assert.equal(categoryFor({ sat: 1100 }, row(null, 1250, 1450)), "unknown");
});

test("list balance flags lopsided lists", () => {
  const b = listBalance(["reach", "reach", "reach", "target"]);
  assert.deepEqual([b.reach, b.target, b.likely], [3, 1, 0]);
  assert.ok(b.tips.some((t) => t.includes("likely")));
});
