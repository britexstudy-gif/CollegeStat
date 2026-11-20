import { test } from "node:test";
import assert from "node:assert/strict";
import { rankingTable } from "../server/ranking-table";
import { globalCatalogue } from "../server/global-catalogue";
import { universityRanks } from "../lib/ranking-highlights";
import { regionalRanksForUniversity, regionalEditions } from "../lib/regional-rankings";
import { signInHref } from "../lib/auth-navigation";
import { STAFF_SIGN_IN } from "../lib/staff-route";
import type { University } from "../lib/domain";

test("regional positions sort within their published edition, preserving ties and filtered rank numbers", async () => {
  const europe = await rankingTable(new URLSearchParams("scope=regional&edition=Europe&provider=the"));
  assert.equal(europe.provider, "qs");
  assert.equal(europe.complete, false);
  assert.equal(europe.year, 2026);
  assert.equal(europe.rows[0].name, "University of Oxford");
  assert.equal(europe.rows[0].rank, "1");
  const swiss = await rankingTable(new URLSearchParams("scope=regional&edition=Europe&country=CH"));
  assert.equal(swiss.rows[0].rank, "2");
  const asia = await rankingTable(new URLSearchParams("scope=regional&edition=Asia"));
  assert.equal(asia.rows.filter(r => r.rank === "=3").length, 2);
  const arab = await rankingTable(new URLSearchParams("scope=regional&edition=Arab Region"));
  assert.equal(arab.scopeLabel, regionalEditions.some(e => e.scope === "Arab Region") ? "Arab Region" : "Europe");
  assert.equal(arab.rows[0].rank, "1");
  assert.equal((await rankingTable(new URLSearchParams("scope=regional&edition=invalid"))).scopeLabel, "Europe");
  const world = await rankingTable(new URLSearchParams("provider=qs&country=GB"));
  assert.equal(world.scope, "world");
  assert.equal(world.rows[0].name, "Imperial College London");
});

test("verified hosted regional corrections supersede bundled positions and ignore unverified observations", () => {
  const university = globalCatalogue.find(u => u.slug === "oxford")!;
  const entry = {rank: 2, rank_label: "=2", source_id: "reviewed-source", verified_at: "2026-10-05", verification_status: "verified", data_sources: {url:"https://www.qs.com/reviewed-edition"}, ranking_editions: {year:2026, subject:"Overall", region:"Europe", permitted:true, ranking_providers:{slug:"qs"}}};
  const hosted = {...university, ranking_entries:[entry]} as unknown as University;
  assert.equal(regionalRanksForUniversity(hosted).find(r => r.scope === "Europe")?.rank_label, "=2");
  hosted.ranking_entries![0].verification_status = "needs_review";
  assert.equal(regionalRanksForUniversity(hosted).find(r => r.scope === "Europe")?.rank_label, "1");
});

test("staff authentication uses its dedicated entry and retains safe staff destinations", () => {
  const href = signInHref("/staff/college-console/mcp");
  assert.ok(href.startsWith(STAFF_SIGN_IN + "?"));
  assert.equal(new URL(href,"https://collegestat.test").searchParams.get("next"), "/staff/college-console/mcp");
  assert.ok(signInHref("/dashboard").startsWith("/auth/sign-in?"));
});

test("government institution types survive featured-profile defaults", () => {
  for (const slug of ["mit", "stanford"]) {
    assert.equal(globalCatalogue.find(u => u.slug === slug)?.university_type, "Private");
  }
  assert.ok(globalCatalogue.filter(u => u.university_type === "Public").length > 900);
});

test("reviewed publisher aliases link existing profiles without inventing ranks", () => {
  for (const ror of ["https://ror.org/02s376052", "https://ror.org/02e7b5302", "https://ror.org/013cjyk83"]) {
    const matches = globalCatalogue.filter(u => u.identifiers?.ror === ror);
    assert.equal(matches.length, 1);
    assert.ok(universityRanks(matches[0]).some(r => r.provider === "qs" && r.year === 2027));
  }
});
