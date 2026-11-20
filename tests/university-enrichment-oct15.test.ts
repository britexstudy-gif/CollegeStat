import assert from "node:assert/strict";
import test from "node:test";
import catalogue from "../data/published/global-directory.json";
import published from "../data/published/reviewed-university-enrichment-oct15.json";
import receipts from "../data/review/university-enrichment-oct15/source-receipts.json";
import browserReviews from "../data/review/university-enrichment-oct15/browser-source-reviews.json";
import researchCohort from "../data/review/university-agent-batch-oct15.json";
import {
  parseUniversityEnrichmentBatch,
  reviewedUniversityEnrichment,
  universityEnrichment,
  universityEnrichmentIssues,
  isUniversitySource,
  youtubeEmbedUrl,
} from "../lib/university-enrichment";

test("reviewed enrichment is published only against exact catalogue identities", () => {
  assert.deepEqual(universityEnrichmentIssues, []);
  assert.ok(reviewedUniversityEnrichment.length >= 17);
  assert.equal(
    reviewedUniversityEnrichment.length,
    published.summary.institutions,
  );
  for (const row of reviewedUniversityEnrichment) {
    const identity = catalogue.find((item) => item.id === row.university_id);
    assert.ok(identity, row.university_name);
    assert.equal(row.university_name, identity.name);
    assert.equal(row.country_code, identity.country_code);
    assert.equal(
      universityEnrichment({ id: identity.id, website: identity.website })
        ?.university_id,
      identity.id,
    );
  }
  const trinity = catalogue.find(
    (item) => item.id === "e0068db4-d5d8-5ea0-bd0f-51b82e61c1da",
  )!;
  assert.equal(
    universityEnrichment({ id: trinity.id, website: trinity.website }),
    undefined,
  );
  assert.equal(
    universityEnrichment({
      id: published.records[0].university_id,
      website: "https://elsewhere.edu",
    }),
    undefined,
  );
});

test("source review rejects candidate state, foreign URLs, duplicate IDs and unsafe video IDs", () => {
  const one = structuredClone(published.records[0]);
  one.resources[0].verification_status = "pending_review";
  assert.equal(
    parseUniversityEnrichmentBatch({ schema_version: 1, records: [one] })
      .records.length,
    0,
  );
  const foreign = structuredClone(published.records[0]);
  foreign.resources[0].url = "https://stanford.edu.evil.example/programmes";
  assert.equal(
    parseUniversityEnrichmentBatch({ schema_version: 1, records: [foreign] })
      .records.length,
    0,
  );
  const duplicate = parseUniversityEnrichmentBatch({
    schema_version: 1,
    records: [published.records[0], published.records[0]],
  });
  assert.equal(duplicate.records.length, 1);
  assert.ok(duplicate.issues.some((issue) => issue.includes("duplicate")));
  assert.equal(youtubeEmbedUrl("../not-a-video"), undefined);
  assert.equal(
    youtubeEmbedUrl("-C5NwTjd-bI"),
    "https://www.youtube-nocookie.com/embed/-C5NwTjd-bI?rel=0",
  );
  assert.equal(
    isUniversitySource("https://mitadmissions.org/apply/", "mit.edu"),
    true,
  );
  assert.equal(
    isUniversitySource("https://mitadmissions.org/apply/", "stanford.edu"),
    false,
  );
  assert.equal(
    isUniversitySource("https://user:pass@stanford.edu/", "stanford.edu"),
    false,
  );
});

test("every published resource has an actual HTTP receipt or separate primary-source browser review", () => {
  const successful = new Set(
    receipts
      .filter((row) => row.status === 200 && row.title)
      .map((row) => row.url),
  );
  const reviewed = new Set(browserReviews.map((row) => row.url));
  for (const row of reviewedUniversityEnrichment)
    for (const resource of row.resources) {
      assert.ok(
        successful.has(resource.url) || reviewed.has(resource.url),
        resource.url,
      );
      assert.equal(resource.verification_status, "verified");
    }
});

test("course names, campus films and founding roles remain separately sourced", () => {
  assert.equal(
    published.summary.programmes,
    reviewedUniversityEnrichment.reduce(
      (sum, row) => sum + row.programmes.length,
      0,
    ),
  );
  assert.ok(published.summary.programmes >= 70);
  for (const row of reviewedUniversityEnrichment) {
    for (const programme of row.programmes) {
      assert.ok(isUniversitySource(programme.source_url, row.official_domain));
      assert.ok(programme.scope && programme.level);
      assert.ok(!programme.source_url.includes("ipeds"));
    }
    for (const video of row.videos) {
      const receipt = receipts.find((item) => item.url === video.source_url);
      assert.ok(receipt && "youtube_ids_in_official_page" in receipt);
      const ids = receipt.youtube_ids_in_official_page as string[];
      assert.ok(Array.isArray(ids) && ids.includes(video.youtube_id));
    }
    for (const image of row.gallery)
      assert.ok(
        image.reuse_permitted &&
          image.license &&
          image.creator &&
          image.source_url &&
          image.license_url,
      );
  }
  const founders = reviewedUniversityEnrichment
    .flatMap((row) => row.people)
    .filter((person) => person.category.startsWith("University founder"));
  assert.ok(founders.some((person) => person.name.includes("Stanford")));
  assert.ok(founders.some((person) => person.name.includes("Rogers")));
  assert.ok(
    !founders.some((person) =>
      ["Larry Page", "Sergey Brin"].includes(person.name),
    ),
  );
  for (const fact of reviewedUniversityEnrichment.flatMap((row) => [
    ...row.admissions,
    ...row.costs,
  ]))
    assert.ok(fact.scope && fact.source_url && fact.checked_at);
  const mitStories =
    reviewedUniversityEnrichment.find(
      (row) => row.official_domain === "mit.edu",
    )?.student_stories || [];
  assert.equal(mitStories.length, 4);
  assert.ok(
    mitStories.every(
      (story) => story.author_byline && story.published_at && story.scope,
    ),
  );
  assert.ok(mitStories.some((story) => story.published_at === "2025-04-09"));
});

test("all 100 research identities have useful reviewed resources without treating link coverage as complete facts", () => {
  const ids = new Set(researchCohort.universities.map((row) => row.id));
  assert.equal(ids.size, 100);
  for (const id of ids) {
    const row = reviewedUniversityEnrichment.find(
      (item) => item.university_id === id,
    );
    assert.ok(row, id);
    assert.ok(row.resources.length > 0, row.university_name);
    assert.ok(
      row.resources.every((item) => item.scope),
      row.university_name,
    );
  }
  assert.equal(published.summary.research_cohort_institutions, 100);
  assert.ok(
    reviewedUniversityEnrichment.filter((row) => row.programmes.length > 0)
      .length < 100,
  );
  const legacyAdelaide = reviewedUniversityEnrichment.find(
    (row) => row.university_name === "University of Adelaide",
  )!;
  assert.equal(legacyAdelaide.programmes.length, 0);
  assert.ok(
    legacyAdelaide.resources.some(
      (resource) =>
        resource.kind === "history" &&
        resource.scope?.includes("successor Adelaide University"),
    ),
  );
});

test("founding dates retain institution and historical event scope", () => {
  const mit = reviewedUniversityEnrichment.find(
    (row) => row.official_domain === "mit.edu",
  )!;
  assert.equal(mit.identity?.founded_year, 1861);
  assert.ok(mit.identity?.founded_year_scope?.includes("Incorporation"));
  const oxford = reviewedUniversityEnrichment.find(
    (row) => row.official_domain === "ox.ac.uk",
  )!;
  assert.equal(oxford.identity?.founded_year, undefined);
  assert.ok(
    oxford.resources.some((resource) =>
      resource.scope?.includes("no clear foundation date"),
    ),
  );
  const invalid = structuredClone(mit);
  invalid.identity!.source_url = "https://elsewhere.edu/history";
  assert.equal(
    parseUniversityEnrichmentBatch({ schema_version: 1, records: [invalid] })
      .records.length,
    0,
  );
  assert.equal(
    isUniversitySource(
      "https://prospectus.webspace.durham.ac.uk/my-prospectus/",
      "dur.ac.uk",
    ),
    true,
  );
  assert.equal(
    isUniversitySource("https://durham.ac.uk.evil.example/", "dur.ac.uk"),
    false,
  );
});
