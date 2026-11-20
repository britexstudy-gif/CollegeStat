import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFeed } from "../scripts/ingestion/adapters";
const id = "11111111-1111-4111-8111-111111111111",
  url = "https://api.data.gov/ed/collegescorecard/v1/schools?year=2024";
const normalize = (rows: Record<string, unknown>[], endpoint = url) =>
  normalizeFeed(
    "scorecard",
    { metadata: { total: rows.length }, results: rows },
    endpoint,
    new Map([["166683", id]]),
  );
test("Scorecard cohorts keep net price, tuition and graduation population distinct", () => {
  const r = normalize([
    {
      id: 166683,
      "2024.cost.avg_net_price.private": 20400,
      "2024.cost.tuition.out_of_state": 65400,
      "2024.completion.completion_rate_4yr_150nt": 0.9,
      "2024.admissions.sat_scores.25th_percentile.math": 750,
      "2024.aid.pell_grant_rate": "PrivacySuppressed",
    },
  ]);
  assert.equal(r.length, 4);
  assert.match(
    r.find((x) => x.metric === "average_net_price_private")!.evidence!
      .population!,
    /2023-24/,
  );
  assert.match(
    r.find((x) => x.metric === "tuition_out_of_state")!.evidence!.population!,
    /2024-25/,
  );
  assert.match(
    r.find((x) => x.metric === "graduation_rate")!.evidence!.population!,
    /2018/,
  );
  assert.equal(r.find((x) => x.metric === "sat_math_lower_quartile")!.value, 750);
  assert.match(r[0].notes!, /not entry requirements/);
});
test("Scorecard rejects insecure sources, duplicate identities, impossible fractions and fake section scores", () => {
  assert.throws(
    () => normalize([{ id: 166683 }], url.replace("https:", "http:")),
    /endpoint/,
  );
  assert.throws(() => normalize([{ id: 166683 }, { id: 166683 }]), /duplicate/);
  assert.throws(
    () => normalize([{ id: 166683, "2024.aid.pell_grant_rate": 10 }]),
    /value/,
  );
  assert.throws(
    () =>
      normalize([
        { id: 166683, "2024.admissions.sat_scores.25th_percentile.math": 1600 },
      ]),
    /section/,
  );
  assert.throws(
    () => normalize([{ id: 166683, "2024.student.size": Infinity }]),
    /value/,
  );
});
