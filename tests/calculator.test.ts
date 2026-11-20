import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, formatResult } from "../lib/calculator";
import { estimateSatSection } from "../lib/exam-score";

test("calculator follows operator precedence", () => {
  assert.equal(evaluate("2+3*4"), 14);
  assert.equal(evaluate("(2+3)*4"), 20);
  assert.equal(evaluate("2^3^2"), 512);
  assert.equal(evaluate("-2^2"), -4);
  assert.equal(evaluate("10/4"), 2.5);
  assert.equal(evaluate("3 × 4 ÷ 2"), 6);
});

test("calculator handles functions, constants and implicit multiplication", () => {
  assert.equal(evaluate("sqrt(16)"), 4);
  assert.equal(evaluate("√(9)+1"), 4);
  assert.equal(formatResult(evaluate("2pi")), formatResult(2 * Math.PI));
  assert.equal(evaluate("3(4)"), 12);
  assert.equal(formatResult(evaluate("sin(30)", { degrees: true })), "0.5");
  assert.equal(evaluate("50%"), 0.5);
  assert.equal(formatResult(0.1 + 0.2), "0.3");
});

test("calculator rejects invalid input instead of guessing", () => {
  for (const bad of ["", "2+", "(1+2", "1+2)", "alert(1)", "2**"])
    assert.throws(() => evaluate(bad));
});

test("SAT estimate stays within the section scale", () => {
  assert.equal(estimateSatSection(0, 54), 200);
  assert.equal(estimateSatSection(54, 54), 800);
  const mid = estimateSatSection(27, 54)!;
  assert.ok(mid > 450 && mid < 560);
  assert.equal(estimateSatSection(0, 0), null);
});
