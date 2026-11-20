import { test } from "node:test";
import assert from "node:assert/strict";
import { examFor, examPercent, examValid, gpaToPct, normalizeGrade, parseALevels, parseAPScores, pctToGpa } from "../lib/grades/convert";

test("five-point school marks: 5 → A, 4 → B, 3 → C", () => {
  assert.deepEqual(normalizeGrade("five", "5"), { pct: 96, gpa: 4 });
  assert.deepEqual(normalizeGrade("five", "4"), { pct: 83, gpa: 3 });
  assert.deepEqual(normalizeGrade("five", "3"), { pct: 73, gpa: 2 });
  assert.equal(normalizeGrade("five", "4,5")?.gpa, 3.5);
  assert.equal(normalizeGrade("five", "5.5"), null);
  assert.equal(normalizeGrade("five", "abc"), null);
});

test("percentages follow the US letter table", () => {
  assert.equal(normalizeGrade("hundred", "95")?.gpa, 4);
  assert.equal(normalizeGrade("hundred", "90")?.gpa, 3.7);
  assert.equal(normalizeGrade("hundred", "83")?.gpa, 3);
  assert.equal(normalizeGrade("hundred", "50")?.gpa, 0.77);
  assert.equal(normalizeGrade("hundred", "101"), null);
});

test("IB points: pct out of 45, GPA bands", () => {
  assert.deepEqual(normalizeGrade("ib", "45"), { pct: 100, gpa: 4 });
  assert.deepEqual(normalizeGrade("ib", "38"), { pct: 84, gpa: 4 });
  assert.equal(normalizeGrade("ib", "30")?.gpa, 3.5);
  assert.equal(normalizeGrade("ib", "24")?.gpa, 3);
  assert.equal(normalizeGrade("ib", "46"), null);
});

test("A-level letters and AP scores are averaged", () => {
  assert.deepEqual(parseALevels("a*, a b"), ["A*", "A", "B"]);
  assert.equal(parseALevels("AX"), null);
  assert.equal(normalizeGrade("alevel", "A*AA")?.gpa, 4);
  assert.equal(normalizeGrade("alevel", "ABC")?.gpa, 3.33);
  assert.deepEqual(parseAPScores("5, 4, 5"), [5, 4, 5]);
  assert.deepEqual(parseAPScores("545"), [5, 4, 5]);
  assert.equal(parseAPScores("6"), null);
  assert.equal(normalizeGrade("ap", "5 5 4")?.gpa, 3.83);
});

test("4.0 GPA is capped and maps back to a percentage", () => {
  assert.deepEqual(normalizeGrade("gpa", "4.3"), { pct: 96, gpa: 4 });
  assert.equal(normalizeGrade("gpa", "3")?.pct, 83);
  for (const pct of [65, 73, 80, 87, 90]) assert.equal(Math.round(gpaToPct(pctToGpa(pct))), pct);
});

test("national exams by home country", () => {
  assert.equal(examFor("KZ"), "unt");
  assert.equal(examFor("KG"), "ort");
  assert.equal(examFor("TJ"), "ntc");
  assert.equal(examFor("UZ"), undefined);
  assert.equal(examPercent("unt", "112"), 80);
  assert.equal(examPercent("unt", "150"), null);
  assert.equal(examPercent("ort", "196"), 80);
  assert.equal(examPercent("ntc", "500"), null);
  assert.ok(examValid("ntc", "500"));
  assert.ok(!examValid("unt", "141"));
});
