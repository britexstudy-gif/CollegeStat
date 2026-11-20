import test from "node:test";
import assert from "node:assert/strict";
import { staffSections } from "../lib/staff-route";
import {
  STAFF_AREAS,
  STAFF_SECTIONS,
  staffSectionHref,
} from "../lib/staff-sections";

test("staff section registry matches the routable slug allowlist", () => {
  const registry = STAFF_SECTIONS.map((s) => s.name.toLowerCase()).sort();
  assert.deepEqual(registry, [...staffSections].sort());
  assert.equal(new Set(registry).size, registry.length, "no duplicate names");
});

test("every staff area opens on a section that belongs to it", () => {
  for (const { area, entry } of STAFF_AREAS) {
    const section = STAFF_SECTIONS.find((s) => s.name === entry);
    assert.equal(section?.area, area, `${entry} belongs to ${area}`);
  }
  assert.equal(staffSectionHref("Overview"), "/staff/college-console");
  assert.equal(staffSectionHref("Mcp"), "/staff/college-console/mcp");
});

test("sidebar categories are contiguous so each heading renders once", () => {
  for (const { area } of STAFF_AREAS) {
    const seen: string[] = [];
    for (const { category } of STAFF_SECTIONS.filter((s) => s.area === area)) {
      if (!category || seen.at(-1) === category) continue;
      assert.ok(!seen.includes(category), `${category} split in ${area}`);
      seen.push(category);
    }
  }
});
