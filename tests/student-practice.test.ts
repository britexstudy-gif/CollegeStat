import { test } from "node:test";
import assert from "node:assert/strict";
import { practiceResult, practiceSets } from "../lib/student-practice";

test("practice results distinguish unanswered, invalid and correct responses without a test-score conversion", () => {
  const questions = practiceSets.math.questions;
  assert.deepEqual(practiceResult(questions, {}), { answered: 0, correct: 0, total: 4 });
  assert.deepEqual(practiceResult(questions, { m1: 1, m2: 0, m3: 99, m4: -1 }), { answered: 2, correct: 1, total: 4 });
  assert.deepEqual(practiceResult(questions, { m1: 1, m2: 2, m3: 2, m4: 1 }), { answered: 4, correct: 4, total: 4 });
});

test("original practice questions have unique identities, valid options and explanations", () => {
  const questions = Object.values(practiceSets).flatMap(set => set.questions);
  assert.equal(questions.length, 12);
  assert.equal(new Set(questions.map(q => q.id)).size, questions.length);
  for (const q of questions) {
    assert.ok(q.answer >= 0 && q.answer < q.options.length && Number.isInteger(q.answer));
    assert.ok(q.prompt && q.explanation);
    assert.equal(new Set(q.options).size, q.options.length);
  }
});
