import { test } from "node:test";
import assert from "node:assert/strict";
import { globalCatalogue, featuredCatalogue } from "../server/global-catalogue";
import { GET } from "../app/api/catalog/route";
import { universityRanks } from "../lib/ranking-highlights";
import { tuition, type University } from "../lib/domain";
import type { ExplorerResult } from "../lib/supabase/catalogue";
const query = async <T>(p: string): Promise<T> =>
  (
    await GET(new Request("https://collegestat.test/api/catalog?" + p))
  ).json() as Promise<T>;
test("global identities have unique stable routes and comparison IDs", () => {
  assert.ok(globalCatalogue.length >= 14000);
  assert.equal(
    new Set(globalCatalogue.map((u) => u.id)).size,
    globalCatalogue.length,
  );
  assert.equal(
    new Set(globalCatalogue.map((u) => u.slug)).size,
    globalCatalogue.length,
  );
  assert.ok(globalCatalogue.every((u) => /^[a-z0-9-]{1,160}$/.test(u.slug)));
  assert.ok(featuredCatalogue.length >= 10);
});
test("catalogue paginates without duplicates, clamps page overflow and filters countries", async () => {
  const first = await query<ExplorerResult>("mode=explore"),
    second = await query<ExplorerResult>("mode=explore&page=2");
  assert.equal(first.universities.length, 24);
  assert.equal(second.universities.length, 24);
  assert.ok(
    !second.universities.some((u: { id: string }) =>
      first.universities.some((r: { id: string }) => r.id === u.id),
    ),
  );
  const filtered = await query<ExplorerResult>(
    "mode=explore&country=UZ&page=9999",
  );
  assert.ok(filtered.total > 0);
  assert.ok(
    filtered.universities.every(
      (u: { country_code: string }) => u.country_code === "UZ",
    ),
  );
  assert.equal(filtered.page, Math.ceil(filtered.total / 24));
});
test("a non-reference university is searchable and has a data-backed profile", async () => {
  const search = await query<University[]>("mode=search&q=Harvard");
  const u = search.find(
    (r: { name: string }) => r.name === "Harvard University",
  );
  assert.ok(u);
  const detail = await query<University>("slug=" + u.slug);
  assert.ok((detail.imported_records?.length || 0) > 5);
  assert.equal(detail.admissions[0].year, 2025);
  assert.equal(detail.admissions[0].acceptance_rate, 100 * 2003 / 47893);
  assert.ok(
    detail.costs.some(
      (c: { student_category: string }) =>
        c.student_category === "out_of_state",
    ),
  );
  assert.equal(
    tuition(detail),
    undefined,
    "Out-of-state prices must not masquerade as international prices",
  );
  assert.equal((await query<University[]>("ids=" + u.id))[0].slug, u.slug);
  assert.equal(await query("slug=not-a-university"), null);
});
test("ranking positions retain publisher, edition and ties across profile and ranking views", async () => {
  const rows = await query<University[]>("mode=rankings");
  assert.ok(rows.length > 1400);
  const mit = rows.find((u: { slug: string }) => u.slug === "mit");
  assert.equal(universityRanks(mit!).find((r) => r.provider === "qs")?.rank, 1);
  const stanford = rows.find((u: { slug: string }) => u.slug === "stanford");
  assert.equal(
    universityRanks(stanford!).find((r) => r.provider === "the")?.tied,
    true,
  );
  assert.ok(universityRanks(mit!).every((r) => r.url.startsWith("https://")));
});
