import { test } from "node:test";
import assert from "node:assert/strict";
import { autoLogoURL } from "../lib/auto-logo";
import { establishedYear, institutionType } from "../lib/institution-facts";
import { mergeHeavyProfile, viewNeedsHeavyProfile } from "../lib/profile-defer";
import { profileSectionSummaries } from "../lib/university-profile-structure";
import { universityEnrichment } from "../lib/university-enrichment";
import { parseResearchQuery } from "../lib/research";
import { attachAutoLogos, withAutoLogo } from "../server/auto-logos";
import { cardPreview } from "../server/discovery-preview";
import { splitProfile } from "../server/profile-split";
import { topFilterMatches } from "../server/bundled-search";
import { universityBySlug, catalogueList } from "../server/catalogue-store";
import type { University } from "../lib/domain";

test("auto logo URLs follow the stored format code and are resolved on the server", () => {
  assert.equal(autoLogoURL("x", "s"), "/logos/auto/x.svg");
  assert.equal(autoLogoURL("x", "i"), "/logos/auto/x.ico");
  assert.equal(autoLogoURL("x", "p"), "/logos/auto/x.png");
  assert.equal(autoLogoURL("x", undefined), null);
  // An explicit null tells the client not to download the id-to-icon map.
  assert.equal(withAutoLogo({ id: "no-such-university" }).auto_logo, null);
  const row = { id: "no-such-university", slug: "n" };
  assert.deepEqual(attachAutoLogos([row]), [{ ...row, auto_logo: null }]);
  assert.deepEqual(attachAutoLogos({ universities: [row], total: 1 }), {
    universities: [{ ...row, auto_logo: null }],
    total: 1,
  });
  // Non-university payloads (e.g. the deferred profile lists) pass through.
  const heavy = { university_programs: [], research_metrics: [], papers: [] };
  assert.equal(attachAutoLogos(heavy), heavy);
});

test("Compare reads type and founding year in the profile's order", () => {
  const base = { university_type: null, history: undefined, reviewed_identity: undefined, founded_year: null };
  assert.equal(institutionType({ ...base, university_type: " Private " }), "Private");
  assert.equal(
    institutionType({ ...base, history: { type: "public" } as University["history"] }),
    "Public",
  );
  assert.equal(institutionType(base), null);
  assert.equal(
    establishedYear({
      ...base,
      reviewed_identity: { founded_year: 1868 },
      founded_year: 1870,
      history: { founded_year: 1900 } as University["history"],
    }),
    1868,
  );
  assert.equal(establishedYear({ ...base, history: { founded_year: 1096 } as University["history"] }), 1096);
  assert.equal(establishedYear(base), null);
});

test("only views that list programmes, research, rankings or sources wait for the deferred lists", () => {
  assert.ok(viewNeedsHeavyProfile("Academics", "programs"));
  assert.ok(viewNeedsHeavyProfile("Academics", "research"));
  assert.ok(viewNeedsHeavyProfile("Rankings", ""));
  assert.ok(viewNeedsHeavyProfile("Sources", ""));
  for (const tab of ["Overview", "Admissions", "Costs", "Campus", "People"])
    assert.ok(!viewNeedsHeavyProfile(tab, "summary"), tab);
});

test("a lite profile keeps every summary count and merges back to the full record", async () => {
  const full = await universityBySlug("tum");
  assert.ok(full && full.university_programs.length > 0);
  const { lite, heavy } = splitProfile(full);
  assert.equal(lite.university_programs.length, 0);
  assert.ok(lite.deferred);
  assert.ok(JSON.stringify(lite).length < JSON.stringify(full).length / 2);
  // The Overview summaries read the precomputed counts instead of the list.
  assert.deepEqual(
    profileSectionSummaries(lite, universityEnrichment(lite)),
    profileSectionSummaries(full, universityEnrichment(full)),
  );
  const merged = mergeHeavyProfile(lite, heavy);
  assert.equal(merged.deferred, undefined);
  assert.deepEqual(merged.university_programs, full.university_programs);
  assert.deepEqual(merged.research_metrics, full.research_metrics ?? []);
  assert.deepEqual(merged.research_identity?.papers, full.research_identity?.papers ?? []);
});

test("bundled search finds 'computer science germany' and returns card rows", async () => {
  const parsed = parseResearchQuery("computer science germany");
  assert.ok(parsed.recognized);
  const rows = topFilterMatches(await catalogueList(), parsed.filters);
  assert.ok(rows.length > 0 && rows.length <= 8);
  assert.ok(rows.every((u) => u.country_code === "DE"));
  const cards = rows.map(cardPreview);
  assert.ok(cards.every((u) => u.university_programs.length === 0 && "auto_logo" in u));
  // The card photo credit still links to its source.
  for (const [i, card] of cards.entries()) {
    const campus = rows[i].media.find((m) => m.kind === "campus");
    assert.equal(card.media[0]?.data_sources?.url, campus?.data_sources?.url);
  }
});
