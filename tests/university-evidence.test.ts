import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeUniversity,
  type Sourced,
  type University,
} from "../lib/domain";
import {
  filterUniversityEvidence,
  universityEvidence,
} from "../lib/university-evidence";

const base: Sourced = {
  id: "fact",
  year: null,
  source_id: "source",
  verification_status: "verified",
  verified_at: "2026-10-13",
  notes: null,
  data_sources: {
    id: "source",
    name: "Official admissions",
    organization: null,
    url: "https://example.edu",
    source_type: "official",
    license_notes: null,
    retrieved_at: "2026-10-13",
  },
};
function institution(fields: Partial<University> = {}) {
  return normalizeUniversity({
    id: "evidence-fixture",
    name: "Evidence fixture",
    slug: "evidence-fixture",
    ...fields,
  });
}

test("evidence retains historical, undated and zero-valued observations without changing the original", () => {
  const u = institution({
    data_points: [2023, 2025, null].map((year, index) => ({
      ...base,
      id: `point-${index}`,
      year,
      university_id: "evidence-fixture",
      metric: "enrollment",
      value: 0,
      text_value: null,
      unit: "students",
    })),
  });
  const before = JSON.stringify(u);
  const rows = universityEvidence(u);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => row.period),
    ["2023", "2025", "Year not stated"],
  );
  assert.ok(
    rows.every((row) => "value" in row.record && row.record.value === 0),
  );
  assert.equal(JSON.stringify(u), before);
});

test("scope and publication periods remain distinct from retrieval dates and filterable", () => {
  const u = institution({
    requirements: [
      {
        ...base,
        university_id: "evidence-fixture",
        label: "IELTS Academic",
        kind: "ielts",
        minimum: 6.5,
        maximum: null,
        student_category: "international",
        required: null,
        evidence: {
          scope: "Computer Science",
          population: "International first year",
          reporting_period: "2027 entry",
        },
      },
    ],
  });
  const rows = universityEvidence(u);
  assert.equal(rows[0].period, "2027 entry");
  assert.equal(
    rows[0].population,
    "Computer Science · International first year",
  );
  assert.equal(
    filterUniversityEvidence(rows, "international IELTS 2027", "Apply").length,
    1,
  );
  assert.equal(filterUniversityEvidence(rows, "2026", "").length, 0);
  assert.equal(filterUniversityEvidence(rows, "", "Study").length, 0);
});

test("current offers and research metrics enter evidence without manufacturing reporting years", () => {
  const u = institution({
    university_programs: [
      {
        ...base,
        programs: {
          id: "course",
          name: "Physics BSc",
          subject: "Physics",
          degree_level: "Bachelor",
          language: null,
        },
        source_url: "https://example.edu/physics",
      },
    ],
    research_metrics: [
      {
        id: "research",
        university_id: "evidence-fixture",
        metric: "publications_fractional_core",
        value: 123,
        unit: "publications",
        period: "2020–2023",
        field: "All sciences",
        edition: "2025",
        source_url: "https://example.edu/research",
        retrieved_at: "2026-10-13",
        verification_status: "verified",
      },
    ],
  });
  const rows = universityEvidence(u);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].record.verification_status, "verified");
  assert.equal(rows[0].period, "Year not stated");
  assert.equal(rows[1].period, "2020–2023");
  assert.equal(rows[1].record.year, null);
});

test("same ids in different observation families are preserved with unique rendering keys", () => {
  const u = institution({
    costs: [
      {
        ...base,
        university_id: "evidence-fixture",
        category: "tuition_out_of_state",
        amount: 0,
        currency: "USD",
        period: "year",
        student_category: "undergraduate",
        program_id: null,
      },
    ],
    requirements: [
      {
        ...base,
        university_id: "evidence-fixture",
        label: "Essay",
        kind: "essay",
        minimum: null,
        maximum: null,
        required: true,
        student_category: "undergraduate",
      },
    ],
  });
  const rows = universityEvidence(u);
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((row) => row.key)).size, 2);
  assert.equal(
    rows.find((row) => row.group === "Costs & funding")?.label,
    "Undergraduate tuition · out of state",
  );
});
