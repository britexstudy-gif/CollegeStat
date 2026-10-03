import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultFilters, filterUniversities, readFilters, valueOf } from "../lib/research";
import { globalCatalogue } from "../server/global-catalogue";
import { rankingTable } from "../server/ranking-table";
import { applicationRoute, applicationLinks } from "../lib/application-routes";
import { regionForCountry } from "../lib/regions";
import { universityRanks } from "../lib/ranking-highlights";
test("rank and admission sorting supports both directions and always puts unknowns last", () => {
  for (const sort of ["rank", "rank_desc", "admission", "admission_desc", "international", "international_asc"] as const) {
    const rows = filterUniversities(globalCatalogue, { ...defaultFilters, sort });
    const values = rows.map(u => sort.startsWith("rank") ? universityRanks(u).find(r => r.provider === "qs" && r.year === 2027)?.rank : valueOf(u, sort.startsWith("admission") ? "admission" : "international_students").value);
    const firstMissing = values.findIndex(v => v == null);
    assert.ok(firstMissing === -1 || values.slice(firstMissing).every(v => v == null));
    const known = values.filter((v): v is number => v != null);
    const direction = sort.endsWith("desc") || sort === "international" ? -1 : 1;
    assert.ok(known.length > 10);
    assert.ok(known.every((v, i) => i === 0 || direction * (v - known[i - 1]) >= 0), sort);
  }
});
test("malformed filter fields do not erase valid constraints; legacy alphabetical links select rank", () => {
  const filters = readFilters(new URLSearchParams("country=uz&cost_max=oops&sort=name&admission_min=90&admission_max=30"));
  assert.equal(filters.country, "UZ"); assert.equal(filters.cost_max, undefined); assert.equal(filters.sort, "rank");
  assert.equal(filters.admission_min, 30); assert.equal(filters.admission_max, 90);
});
test("regional rankings filter complete world tables while retaining world positions", () => {
  const table = rankingTable(new URLSearchParams("region=Europe&sort=desc"));
  assert.ok(table.total > 100); assert.ok(table.rows.every(r => regionForCountry(r.country_code || "") === "Europe"));
  assert.equal(regionForCountry("BG"), "Europe"); assert.equal(regionForCountry("UZ"), "Asia"); assert.equal(regionForCountry("UG"), "Africa");
});
test("institution-specific application routes override country platforms and resource links retain sources", () => {
  const mit = globalCatalogue.find(u => u.slug === "mit")!;
  assert.equal(applicationRoute(mit)?.name, "MIT application");
  const ruse = globalCatalogue.find(u => u.website?.includes("uni-ruse.bg"))!;
  assert.equal(applicationRoute(ruse)?.name, "University of Ruse international admissions");
  const uibe = globalCatalogue.find(u => u.website?.includes("uibe.edu.cn"))!;
  assert.match(applicationRoute(uibe)!.scope, /past-cycle/);
  assert.ok(applicationLinks(mit).every(l => /^https?:\/\//.test(l.url)));
});


test("lightweight discovery retains every displayed metric without shipping course or paper libraries", async () => {
  const { discoveryPreview } = await import('../server/explorer');
  const { metricDefinitions } = await import('../lib/research');
  for (const full of globalCatalogue) {
    const preview=discoveryPreview(full);
    for(const metric of metricDefinitions) assert.deepEqual(valueOf(preview,metric.key),valueOf(full,metric.key),full.name+':'+metric.key);
    assert.equal(preview.reported_programs?.length,0);
    assert.equal(preview.research_identity,undefined);
  }
});
test("spelling suggestions preserve country and budget constraints", async () => {
 const {exploreCatalogue}=await import('../server/explorer');
 const result=exploreCatalogue(new URLSearchParams('q=Harvadr&country=US'));
 // Two substitutions are deliberately outside the conservative one-edit-per-word suggestion threshold.
 assert.equal(result.total,0);
 const typo=exploreCatalogue(new URLSearchParams('q=Harvord&country=US'));
 assert.ok(typo.suggestions?.some(u=>u.name==='Harvard University'));
 const excluded=exploreCatalogue(new URLSearchParams('q=Harvord&country=GB'));
 assert.ok(!excluded.suggestions?.some(u=>u.name==='Harvard University'));
});
test("DOI duplicates retain one paper with strongest citation evidence",async()=>{
 const {uniquePapers}=await import('../lib/profile-library');
 const original={id:'a',title:'Example',doi:'https://doi.org/10.1/ABC',date:'2026-01-01',type:'article',authors:[],venue:null,url:'https://doi.org/10.1/ABC',open_access_url:null,citations:2};
 const rows=uniquePapers([original,{...original,id:'b',doi:'10.1/abc',citations:5}]);
 assert.equal(rows.length,1);assert.equal(rows[0].citations,5);
});
