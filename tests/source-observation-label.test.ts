import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  Admission,
  Cost,
  DataPoint,
  Deadline,
  Media,
  Program,
  ProgramOffer,
  RankingEntry,
  Requirement,
  Sourced,
} from "../lib/domain";
import { sourceObservationLabel } from "../lib/source-observation-label";

const sourced: Sourced = {
  id: "observation",
  year: null,
  source_id: null,
  verification_status: "missing_source",
  verified_at: null,
  notes: null,
};

const requirement: Requirement = {
  ...sourced,
  university_id: "university",
  kind: "ielts",
  label: "IELTS Academic",
  minimum: 6.5,
  maximum: null,
  student_category: "International undergraduate",
  required: true,
};

const media: Media = {
  ...sourced,
  university_id: "university",
  professor_id: null,
  kind: "campus",
  url: "https://example.edu/campus.jpg",
  alt: "University campus entrance",
  creator: "University",
  license: "CC BY 4.0",
  license_url: "https://creativecommons.org/licenses/by/4.0/",
  reuse_permitted: true,
  width: null,
  height: null,
};

test("requirements and media retain their source identity", () => {
  assert.equal(sourceObservationLabel(requirement), "IELTS Academic");
  assert.equal(sourceObservationLabel(media), "University campus entrance");
});

test("missing requirement and media labels do not invent measurement values", () => {
  assert.equal(
    sourceObservationLabel({ ...requirement, label: "  ", minimum: 0 }),
    "Requirement",
  );
  assert.equal(sourceObservationLabel({ ...media, alt: "" }), "Campus media");
  assert.equal(
    sourceObservationLabel({ ...media, alt: "", kind: "logo" }),
    "University mark",
  );
  assert.equal(
    sourceObservationLabel({ ...media, alt: "", kind: "faculty" }),
    "Faculty media",
  );
});

test("the other sourced observation types preserve labels even with null or zero values", () => {
  const metric: DataPoint = {
    ...sourced,
    university_id: "university",
    metric: "Student population",
    value: 0,
    text_value: null,
    unit: null,
  };
  const cost: Cost = {
    ...sourced,
    university_id: "university",
    category: "Tuition",
    amount: 0,
    currency: "USD",
    period: "year",
    student_category: "Undergraduate",
    program_id: null,
  };
  const admission: Admission = {
    ...sourced,
    university_id: "university",
    program_id: null,
    acceptance_rate: null,
    sat_min: null,
    sat_max: null,
    ielts_min: null,
    toefl_min: null,
    requirements: null,
    language: null,
    deadline: null,
    application_fee: null,
  };
  const ranking: RankingEntry = {
    ...sourced,
    university_id: "university",
    edition_id: "edition",
    rank: null,
    rank_label: null,
    score: null,
  };
  const program: Program = {
    id: "program",
    name: "Computer Science",
    subject: "Computer Science",
    degree_level: "Bachelor",
    language: null,
  };
  const offer: ProgramOffer = { programs: program };
  const deadline: Deadline = {
    ...sourced,
    university_id: "university",
    title: "Undergraduate application deadline",
    student_category: "Undergraduate",
    cycle: "2026",
    due_at: "2026-12-01",
    timezone: "UTC",
    application_url: "https://example.edu/apply",
  };

  assert.equal(sourceObservationLabel(metric), "Student population");
  assert.equal(sourceObservationLabel(cost), "Tuition");
  assert.equal(sourceObservationLabel(admission), "Admissions");
  assert.equal(sourceObservationLabel(ranking), "Ranking");
  assert.equal(sourceObservationLabel(program), "Computer Science");
  assert.equal(sourceObservationLabel(offer), "Computer Science");
  assert.equal(
    sourceObservationLabel(deadline),
    "Undergraduate application deadline",
  );
  assert.equal(sourceObservationLabel({ ...metric, metric: "" }), "Metric");
  assert.equal(sourceObservationLabel({ ...cost, category: "" }), "Cost");
  assert.equal(sourceObservationLabel({ ...program, name: "" }), "Program");
  assert.equal(sourceObservationLabel({ ...deadline, title: "" }), "Deadline");
});

test("unrecognized sourced records have an honest fallback", () => {
  assert.equal(sourceObservationLabel(sourced), "Source observation");
});
