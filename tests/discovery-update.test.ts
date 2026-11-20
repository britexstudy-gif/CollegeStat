import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultFilters, filterUniversities, readFilters, valueOf } from "../lib/research";
import { globalCatalogue } from "../server/global-catalogue";
import { rankingTable } from "../server/ranking-table";
import { applicationRoute, applicationLinks } from "../lib/application-routes";
import { regionForCountry } from "../lib/regions";
import { universityRanks } from "../lib/ranking-highlights";
import { normalizeUniversity, type DataPoint } from "../lib/domain";
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
test("regional rankings filter complete world tables while retaining world positions", async () => {
  const table = await rankingTable(new URLSearchParams("region=Europe&sort=desc"));
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
test("discovery omits unused aid detail payloads without changing supported historical facts or their evidence", async () => {
  const { discoveryPreview } = await import("../server/discovery-preview");
  const source = {
    id: "synthetic-official-source", name: "Synthetic public aid source",
    organization: "Example University", url: "https://example.edu/aid-report",
    source_type: "official_university", license_notes: "Synthetic test evidence",
    retrieved_at: "2026-10-11",
  };
  const fact = (metric: string, year: number, value: number): DataPoint => ({
    id: `${metric}:${year}`, university_id: "synthetic-discovery-university",
    metric, value, text_value: null, unit: "%", year, source_id: source.id,
    verification_status: "verified", verified_at: "2026-10-11", canonical: true,
    notes: "All enrolled undergraduate students, reporting period as labelled.",
    source_url: source.url, data_sources: source,
    evidence: {
      population: "All enrolled undergraduate students", reporting_period: String(year),
      source_record_id: `${metric}:${year}`, raw_field: metric, raw_value: value,
      dataset_sha256: "synthetic-source-checksum", publication_year: year,
      retrieved_at: "2026-10-11",
    },
  });
  const older = fact("aid_recipients", 2022, 48);
  const current = fact("aid_recipients", 2024, 52);
  const unused = fact("ipeds_sfa_total_pell_recipients", 2024, 31);
  unused.evidence!.raw_row = "Unused public source detail. ".repeat(5000);
  const full = normalizeUniversity({
    id: "synthetic-discovery-university", name: "Synthetic discovery university",
    data_points: [older, current, unused],
  });
  const original = JSON.stringify(full);
  Object.freeze(full.data_points);
  for (const point of full.data_points) {
    Object.freeze(point.evidence);
    Object.freeze(point);
  }
  Object.freeze(full);
  const preview = discoveryPreview(full);
  assert.deepEqual(preview.data_points, [older, current]);
  assert.notEqual(preview.data_points, full.data_points);
  assert.equal(preview.data_points[0], older);
  assert.equal(preview.data_points[1], current);
  assert.deepEqual(valueOf(preview, "aid_recipients"), valueOf(full, "aid_recipients"));
  assert.equal(JSON.stringify(full), original);
  assert.ok(JSON.stringify(preview).length < original.length / 10);
  assert.equal(full.data_points.length, 3, "Full profile keeps unused observations and raw evidence");
});
test("spelling suggestions preserve country and budget constraints", async () => {
 const {exploreCatalogue}=await import('../server/explorer');
 const result=await exploreCatalogue(new URLSearchParams('q=Harvadr&country=US'));
 // Two substitutions are deliberately outside the conservative one-edit-per-word suggestion threshold.
 assert.equal(result.total,0);
 const typo=await exploreCatalogue(new URLSearchParams('q=Harvord&country=US'));
 assert.ok(typo.suggestions?.some(u=>u.name==='Harvard University'));
 const excluded=await exploreCatalogue(new URLSearchParams('q=Harvord&country=GB'));
 assert.ok(!excluded.suggestions?.some(u=>u.name==='Harvard University'));
});
test("DOI duplicates retain one paper with strongest citation evidence",async()=>{
 const {uniquePapers}=await import('../lib/profile-library');
 const original={id:'a',title:'Example',doi:'https://doi.org/10.1/ABC',date:'2026-01-01',type:'article',authors:[],venue:null,url:'https://doi.org/10.1/ABC',open_access_url:null,citations:2};
 const rows=uniquePapers([original,{...original,id:'b',doi:'10.1/abc',citations:5}]);
 assert.equal(rows.length,1);assert.equal(rows[0].citations,5);
});
