import assert from "node:assert/strict";
import test from "node:test";
import directoryManifest from "@/data/published/directory-manifest.json";
import {
  featuredCatalogue,
  referenceScholarships,
} from "@/server/featured-catalogue";
import {
  featuredCatalogue as fullFeatured,
  globalCatalogue,
} from "@/server/global-catalogue";
import { referenceScholarships as fullScholarships } from "@/server/catalogue";
import { metricDefinitions, valueOf } from "@/lib/research";
import { universityRanks } from "@/lib/ranking-highlights";

test("bundled bootstrap retains sourced featured identities, cards and all scholarship evidence", () => {
  assert.equal(featuredCatalogue.length, 12);
  assert.equal(new Set(featuredCatalogue.map((u) => u.id)).size, 12);
  assert.deepEqual(
    featuredCatalogue.slice(0, 11).map((u) => u.id),
    fullFeatured.map((u) => u.id),
  );
  const nus = globalCatalogue.find(
    (u) =>
      new URL(u.website || "https://invalid.example").hostname.replace(
        /^www\./,
        "",
      ) === "nus.edu.sg",
  );
  assert.ok(nus);
  assert.equal(featuredCatalogue[11].id, nus.id);
  assert.equal(
    featuredCatalogue[11].slug,
    "national-university-of-singapore-c66c3755",
  );
  assert.deepEqual(referenceScholarships, fullScholarships);
  for (const card of featuredCatalogue) {
    const full = globalCatalogue.find((u) => u.id === card.id);
    assert.ok(full);
    for (const key of [
      "id",
      "slug",
      "name",
      "short_name",
      "country_code",
      "city",
      "region",
      "website",
      "university_type",
      "brand_color",
      "logo_url",
      "logo_source_url",
      "logo_usage_notes",
      "website_icon_url",
      "media",
      "rankings",
      "ranking_entries",
      "data_points",
      "costs",
      "admissions",
      "financial_aid",
      "campuses",
      "university_scholarships",
      "publisher_students",
      "admission_summary",
      "reference_url",
      "reference_retrieved_at",
    ] as const)
      assert.deepEqual(card[key], full[key], `${card.slug}: ${key}`);
    assert.deepEqual(
      universityRanks(card),
      universityRanks(full),
      card.slug + ": rank scope/source parity",
    );
    for (const metric of metricDefinitions)
      assert.deepEqual(
        valueOf(card, metric.key),
        valueOf(full, metric.key),
        `${card.slug}: ${metric.key}`,
      );
    assert.equal(card.published, true);
    for (const key of [
      "reported_programs",
      "university_programs",
      "research",
      "research_metrics",
      "requirements",
    ] as const)
      assert.deepEqual(
        card[key],
        [],
        `${card.slug}: card projection excludes ${key}`,
      );
  }
  const fullMIT = globalCatalogue.find((u) => u.slug === "mit");
  assert.ok(fullMIT?.reported_programs?.length);
  assert.ok(fullMIT?.research.length);
  assert.equal(globalCatalogue.length, 14003);
  assert.equal(directoryManifest.catalogue_total, globalCatalogue.length);
  assert.equal(
    directoryManifest.countries,
    new Set(globalCatalogue.map((u) => u.country_code)).size,
  );
});
