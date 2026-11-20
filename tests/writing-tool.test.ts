import { test } from "node:test";
import assert from "node:assert/strict";
import { diffWords } from "../lib/text-diff";
import { countText, essayType, joinSections, splitSections } from "../lib/essay-types";

test("diff keeps unchanged words and marks edits", () => {
  const parts = diffWords("I built a small robot", "I built a fast robot");
  assert.deepEqual(
    parts.filter((p) => p.type !== "same").map((p) => [p.type, p.text]),
    [
      ["del", "small"],
      ["add", "fast"],
    ],
  );
  assert.equal(
    parts.filter((p) => p.type !== "del").map((p) => p.text).join(""),
    "I built a fast robot",
  );
});

test("sectioned drafts round-trip and count like portals", () => {
  const ucas = essayType("ucas");
  const parts = ["Because maths.", "A-levels helped.", "I read books."];
  assert.deepEqual(splitSections(ucas, joinSections(ucas, parts)), parts);
  assert.equal(countText("hello world", "chars"), 11);
  assert.equal(countText("  hello   world ", "words"), 2);
});
