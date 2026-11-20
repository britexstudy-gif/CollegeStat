import test from "node:test";
import assert from "node:assert/strict";
import { discoverPrograms, programListings } from "../lib/program-discovery";
import type { University } from "../lib/domain";
import type { UniversityEnrichment } from "../lib/university-enrichment";

type Programme = UniversityEnrichment["programmes"][number];
const empty = { university_programs: [], reported_programs: [] };
const programme = (overrides: Partial<Programme> = {}): Programme => ({
  name: "Computer Science",
  level: "Bachelor of Science",
  url: "https://university.example/courses/computer-science",
  source_url: "https://university.example/courses",
  verification_status: "verified",
  checked_at: "2026-10-16",
  scope:
    "Undergraduate course; confirm the current intake with the university.",
  ...overrides,
});
const canonical: University["university_programs"][number] = {
  programs: {
    id: "computer-science-bachelor",
    name: "Computer Science",
    subject: "Computer Science",
    degree_level: "Bachelor",
    language: null,
  },
  source_url: "https://university.example/courses/computer-science",
  source_id: "official-course-source",
  verified_at: "2026-10-15T12:00:00Z",
  verification_status: "verified",
  duration_months: 36,
  intakes: ["September"],
  year: null,
  evidence: { qualification: "Bachelor of Science" },
};

test("reviewed overlay programmes participate in the same official search, degree and alphabet filters", () => {
  const rows = programListings(empty, [
    programme(),
    programme({
      name: "Applied Mathematics",
      level: "Master of Science",
      url: "https://university.example/courses/applied-mathematics",
      duration: "1 or 2 years, depending on study mode",
    }),
  ]);
  assert.equal(rows.filter((p) => p.origin === "official").length, 2);
  const filtered = discoverPrograms(rows, {
    query: "mathematics",
    degree: "Master’s",
    origin: "official",
    letter: "A",
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].duration, "1 or 2 years, depending on study mode");
  assert.equal(filtered[0].durationMonths, undefined);
  assert.equal(filtered[0].year, undefined);
  assert.equal(filtered[0].checked, "2026-10-16");
  assert.equal(filtered[0].scope, programme().scope);
});

test("canonical offers merge reviewed duplicates by exact course URL or normalized name and level", () => {
  const u = { ...empty, university_programs: [canonical] };
  for (const duplicate of [
    programme({ name: "Computing and Computer Science" }),
    programme({
      name: "COMPUTER SCIENCE",
      url: "https://university.example/study/computing",
    }),
  ]) {
    const rows = programListings(u, [duplicate]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "Computer Science");
    assert.equal(rows[0].qualification, "Bachelor of Science");
    assert.equal(rows[0].durationMonths, 36);
    assert.equal(rows[0].language, null);
    assert.deepEqual(rows[0].intakes, ["September"]);
    assert.equal(rows[0].checked, "2026-10-15");
    assert.equal(rows[0].scope, duplicate.scope);
    assert.equal(rows[0].sourceURL, duplicate.source_url);
  }
});

test("distinct named courses sharing a directory URL are retained, and degree levels stay distinct", () => {
  const directory = "https://university.example/undergraduate-programmes";
  const rows = programListings(empty, [
    programme({
      name: "Civil Engineering",
      url: directory,
      source_url: directory,
    }),
    programme({
      name: "Computer Engineering",
      url: directory,
      source_url: directory,
    }),
    programme({
      name: "Computer Engineering",
      level: "Master of Science",
      url: "https://university.example/postgraduate/computer-engineering",
    }),
  ]);
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map((p) => p.id)).size, 3);
  assert.deepEqual(
    rows.map((p) => p.level),
    ["Bachelor’s", "Bachelor’s", "Master’s"],
  );
});

test("historical completion records remain separate from reviewed degree counts and current listings", () => {
  const u = {
    ...empty,
    reported_programs: [
      {
        name: "Computer Science",
        cip: "11.0701",
        award: "Bachelor",
        level: "Bachelor",
        year: 2025,
        completions: 12,
      },
    ] as University["reported_programs"],
  };
  const rows = programListings(u, [programme()]);
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((p) => p.origin === "official").length, 1);
  assert.equal(rows.filter((p) => p.origin === "reported").length, 1);
  const history = discoverPrograms(rows, {
    query: "",
    degree: "",
    origin: "reported",
    letter: "",
  });
  assert.equal(history[0].year, 2025);
  assert.equal(history[0].completions, 12);
  assert.equal(history[0].url, undefined);
  assert.match(history[0].sourceURL!, /nces\.ed\.gov/);
});

test("unverified or unsourced canonical offers cannot inflate the reviewed official count", () => {
  const rows = programListings({
    ...empty,
    university_programs: [
      { ...canonical, verification_status: "needs_review" },
      { ...canonical, source_id: null },
      { ...canonical, verified_at: null },
    ],
  });
  assert.equal(rows.filter((p) => p.origin === "official").length, 0);
  assert.equal(
    programListings({ ...empty, university_programs: [canonical] }).length,
    1,
  );
  const withOverlay = programListings(
    {
      ...empty,
      university_programs: [
        { ...canonical, verification_status: "needs_review" },
      ],
    },
    [programme()],
  );
  assert.equal(withOverlay.length, 1);
  assert.equal(withOverlay[0].checked, "2026-10-16");
  assert.equal(withOverlay[0].durationMonths, undefined);
});
