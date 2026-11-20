import { test } from "node:test";
import assert from "node:assert/strict";
import { rateWriting, readingEase } from "../lib/writing-rating";

test("rating counts words and scores six criteria", () => {
  const r = rateWriting("Ever since I was a child I really wanted to make a difference. The robot was designed by our team.");
  assert.equal(r.count, 20);
  assert.equal(r.criteria.length, 6);
  assert.ok(r.criteria.find((c) => c.id === "originality")!.note.includes("make a difference"));
  assert.equal(rateWriting("").overall, 0);
});

test("reading ease is higher for short, plain sentences", () => {
  assert.ok(readingEase("I ran. The dog sat. We ate.") > readingEase("Institutional considerations notwithstanding, comprehensive evaluation necessitates multidimensional deliberation."));
});
