import assert from "node:assert/strict";
import test from "node:test";
import { profileSectionSummaries } from "../lib/university-profile-structure";
import type { University } from "../lib/domain";
import { reviewedUniversityEnrichment } from "../lib/university-enrichment";

const empty = {
  id: "22222222-2222-4222-8222-222222222222",
  university_programs: [],
  reported_programs: [],
  admissions_url: null,
  requirements: [],
  deadlines: [],
  costs: [],
  financial_aid_url: null,
  media: [],
};

test("historical degree completions and unverified offerings cannot become reviewed programmes", () => {
  const u = {
    ...empty,
    reported_programs: [
      {
        name: "History",
        year: 2025,
        cip: "54.0101",
        award: "Bachelor",
        level: "Bachelor",
        completions: 12,
      },
    ],
    university_programs: [
      {
        verification_status: "needs_review",
        programs: {
          id: "history",
          name: "History",
          subject: "History",
          degree_level: "Bachelor",
          language: null,
        },
        duration_months: null,
        intakes: [],
        year: null,
        source_id: null,
        verified_at: null,
      },
    ] as University["university_programs"],
  };
  assert.equal(
    profileSectionSummaries(u).Academics,
    "Start with the course catalogue",
  );
  u.university_programs[0].verification_status = "verified";
  u.university_programs[0].verified_at = "2026-10-16";
  assert.equal(
    profileSectionSummaries(u).Academics,
    "Start with the course catalogue",
  );
  u.university_programs[0].source_id = "official-history-course";
  assert.equal(profileSectionSummaries(u).Academics, "1 reviewed programme");
});

test("a course directory never claims that all university programmes have been imported", () => {
  const reviewed = structuredClone(reviewedUniversityEnrichment[0]);
  reviewed.programmes = [];
  assert.ok(reviewed.resources.some((r) => r.kind === "programmes"));
  assert.equal(
    profileSectionSummaries(empty, reviewed).Academics,
    "Official course directory",
  );
});

test("campus summary excludes unlicensed images and deduplicates photos across sources", () => {
  const reviewed = structuredClone(
    reviewedUniversityEnrichment.find((r) => r.gallery.length)!,
  );
  reviewed.videos = [];
  const image = reviewed.gallery[0];
  reviewed.gallery = [image];
  const licensed = {
    ...image,
    id: "campus",
    university_id: empty.id,
    professor_id: null,
    kind: "campus" as const,
    source_id: null,
    year: null,
    verified_at: image.checked_at,
    notes: null,
    width: null,
    height: null,
  };
  const u = {
    ...empty,
    media: [
      licensed,
      { ...licensed, url: "/images/no-license.jpg", reuse_permitted: false },
    ],
  };
  assert.equal(profileSectionSummaries(u, reviewed).Campus, "1 photo");
  reviewed.gallery.push({ ...image, url: image.url + "?second-photo" });
  assert.equal(profileSectionSummaries(u, reviewed).Campus, "2 photos");
});
