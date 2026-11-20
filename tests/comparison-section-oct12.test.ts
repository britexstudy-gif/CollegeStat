import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPARISON_GROUPS,
  comparisonSection,
  comparisonSectionKey,
} from "../lib/comparison";

test("Costs and all comparison categories are bookmarkable without losing the intended view", () => {
  assert.equal(comparisonSection("costs"), "Costs");
  assert.equal(comparisonSection(" Financial aid "), "Financial aid");
  for (const group of ["Essentials", ...COMPARISON_GROUPS])
    assert.equal(comparisonSection(comparisonSectionKey(group)), group);
});
test("unsupported comparison deep links safely retain Essentials", () => {
  for (const value of [
    null,
    "",
    "unknown",
    "__proto__",
    "<script>",
    "costs&rankings",
  ])
    assert.equal(comparisonSection(value), "Essentials");
});
