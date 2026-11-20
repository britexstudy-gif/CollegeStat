import { test } from "node:test";
import assert from "node:assert/strict";
import { globalCatalogue } from "../server/global-catalogue";
import programmes from "../data/published/official-programs.json";
import applicationReceipt from "../data/published/reviewed-application-rounds-oct05.json";

test("programme-specific fees and requirements join the same canonical offering", () => {
  const nu = globalCatalogue.find(u => u.website?.includes("nu.edu.kz"))!;
  const programme = applicationReceipt.programs[0];
  const offering = nu.university_programs.find(p => p.programs.id === programme.id);
  assert.ok(offering, "The EMBA offering must retain the programme UUID used by its costs and deadlines");
  assert.deepEqual(offering.programs, programme);
  const published = programmes["nu.edu.kz"][0];
  assert.equal(offering.id, published.university_program_id);
  assert.equal(offering.source_id, published.source_id);
  assert.equal(offering.source_url, published.source_url);
  assert.equal(offering.year, 2027);
  assert.deepEqual(offering.evidence, published.evidence);
  assert.equal(offering.notes, published.notes);
  const metadata = offering as typeof offering & { university_program_id?: string; reporting_year?: number; availability?: string };
  assert.equal(metadata.university_program_id, published.university_program_id);
  assert.equal(metadata.reporting_year, published.reporting_year);
  assert.equal(metadata.availability, "current");
  assert.equal(nu.costs.filter(c => c.program_id === programme.id).length, 2);
  assert.equal(nu.deadlines.filter(d => (d as typeof d & { program_id?: string }).program_id === programme.id).length, 2);

  const wiut = globalCatalogue.find(u => u.website?.includes("wiut.uz"))!;
  const courseID = programmes["wiut.uz"][0].id;
  assert.ok(wiut.university_programs.some(p => p.programs.id === courseID));
  assert.ok(wiut.requirements.some(r => r.program_id === courseID && r.evidence?.university_wide === false));
});

test("legacy scraped course identities and direct course links remain stable", () => {
  const tum = globalCatalogue.find(u => u.website?.includes("tum.de"))!;
  const legacy = programmes["tum.de"][0];
  const offering = tum.university_programs.find(p => p.programs.id === "tum.de:" + legacy.id);
  assert.ok(offering);
  assert.equal(offering.source_url, legacy.url);
  assert.equal(offering.source_id, "official-course-tum.de");
  assert.equal(offering.year, 2026);
  assert.equal(offering.verified_at, legacy.checked_at);
});
