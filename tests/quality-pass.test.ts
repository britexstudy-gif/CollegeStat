import { test } from "node:test";
import assert from "node:assert/strict";
import { glassMap, glassMapSize } from "../lib/glass-map";
import { scoreRange } from "../lib/score-range";
import { historySeries } from "../lib/chart-series";
import { campusGallery } from "../lib/campus-gallery";
import { comparisonEvidence } from "../lib/comparison-evidence";
import { deadlineDate, deadlineLabel } from "../lib/application-dates";
import { filterScholarships } from "../lib/scholarship-discovery";
import { entitySchemas } from "../services/admin-schema";
import { globalCatalogue } from "../server/global-catalogue";
import { currentScholarships } from "../server/scholarship-catalogue";
import { regionalIdentities } from "../server/regional-identities";
import { officialLogo } from "../lib/official-logos";
import logos from "../data/published/official-logos.json";
import photos from "../data/published/campus-media-checks.json";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HistoryChart } from "../charts/research-charts";
import requirements from "../data/published/requirements-current.json";
import reviewedRequirements from "../data/published/reviewed-requirements-oct05.json";
import { originalSourceURL, SourceEvidenceDetails } from "../components/college/primitives";
import type { Sourced } from "../lib/domain";
const mit = globalCatalogue.find(u => u.slug === "mit")!;
const toronto = globalCatalogue.find(u => u.slug === "toronto")!;
test("lens maps bend only the rim and keep memory bounded", () => {
  const width=120,height=60,data=glassMap(width,height,24,12);
  const pixel=(x:number,y:number) => [...data.slice((y*width+x)*4,(y*width+x)*4+4)];
  assert.deepEqual(pixel(60,30),[128,128,128,255]);
  assert.ok(pixel(2,30)[0]<128);
  assert.ok(pixel(117,30)[0]>128);
  assert.equal(pixel(2,30)[0]+pixel(117,30)[0],256);
  assert.throws(() => glassMap(2000,2000,12),RangeError);
  assert.equal(glassMapSize(900,500),null);
  const scaled=glassMapSize(1400,100)!;
  assert.ok(scaled.width<=720 && scaled.height<=180 && scaled.width*scaled.height<=180000);
});
test("score charts retain intervals, ties and zero without invented midpoints", () => {
  assert.deepEqual(scoreRange("43.6–46.1"),{low:43.6,high:46.1});
  assert.deepEqual(scoreRange("0"),{low:0,high:0});
  assert.equal(scoreRange("101"),null);
  assert.equal(scoreRange("n/a"),null);
  assert.equal(scoreRange("70–20"),null);
});
test("history never connects conflicting years or different applicant populations", () => {
  const base=mit.admissions[0];
  const rows=historySeries([
    {...base,id:"a",year:2024,value:10,student_category:"Domestic"},
    {...base,id:"b",year:2025,value:20,student_category:"Domestic"},
    {...base,id:"c",year:2025,value:30,student_category:"Domestic"},
    {...base,id:"d",year:2025,value:40,student_category:"International"},
    {...base,id:"e",year:2026,value:50,student_category:"International",verification_status:"needs_review"},
  ]);
  assert.equal(rows.length,2);
  assert.deepEqual(rows.find(r=>r.scope==="Domestic")!.points.map(r=>r.year),[2024]);
  assert.equal(rows.find(r=>r.scope==="Domestic")!.observations.length,3);
  assert.equal(rows.find(r=>r.scope==="International")!.points[0].value,40);
});
test("galleries exclude logos, unverified images and photographs without reuse permission", () => {
  const photo=mit.media.find(m=>m.kind==="campus")!;
  assert.equal(campusGallery([photo,photo,{...photo,url:"a",kind:"logo"},{...photo,url:"b",reuse_permitted:false},{...photo,url:"c",verification_status:"needs_review"}]).length,1);
  for (const name of ["Harvard University","University of Cambridge","The University of Hong Kong"]) assert.ok(campusGallery(globalCatalogue.find(u=>u.name===name)!.media).length);
});
test("fresh awards link to real institutions and scholarship filters honor that relationship", () => {
  assert.ok(currentScholarships.length >= 6);
  for(const a of currentScholarships) for(const l of a.university_scholarships) assert.ok(globalCatalogue.some(u=>u.id===l.university_id));
  const rows=filterScholarships(currentScholarships,{ query:"",funding:"all",level:"all",university:toronto.id,includeClosed:false,today:"2026-10-02" });
  assert.equal(rows.length,1);
  assert.ok(rows[0].name.includes("Pearson"));
});
test("date-only deadlines cannot shift across time zones or invent cutoff times", () => {
  const date=toronto.deadlines.find(d=>d.due_at.length===10)!;
  assert.equal(deadlineDate(date),date.due_at);
  assert.match(deadlineLabel({...date,timezone:"America/Los_Angeles"}),/date only/);
  const oxford=globalCatalogue.find(u=>u.slug==="oxford")!;
  assert.match(deadlineLabel(oxford.deadlines.find(d=>d.due_at.startsWith("2026-10-15"))!),/18:00|6:00/);
  const record={ ...date,due_at:null,due_date:date.due_at };
  assert.equal(entitySchemas.deadlines.safeParse(record).success,true);
  assert.equal(entitySchemas.deadlines.safeParse({...record,due_at:"2026-10-15T17:00:00Z"}).success,false);
});
test("comparison retains publisher populations and keeps award-specific dates separate", () => {
  const snapshot=globalCatalogue.find(u=>u.publisher_students?.students)!;
  const rows=comparisonEvidence(snapshot);
  assert.ok(rows.find(r=>r.id==="publisher-students")?.detail.includes("census year not specified"));
  const dates=comparisonEvidence(toronto).filter(r=>r.id.startsWith("deadline|"));
  assert.ok(dates.length>=3);
  assert.equal(new Set(dates.map(r=>r.id)).size,dates.length);
  assert.ok(comparisonEvidence(toronto).some(r=>r.id==="linked-awards"));
});
test("regional ranking identities use actual university records and official logos match only their domain", () => {
  const rows=regionalIdentities();
  assert.ok(Object.keys(rows).length>=20);
  assert.ok(rows["hku.hk"].slug);
  assert.equal(officialLogo("https://cam.ac.uk.evil.test"),undefined);
  for (const domain of ["cam.ac.uk","hku.hk","ntu.edu.sg","utoronto.ca"]) assert.ok(officialLogo("https://www."+domain));
});
test("downloaded institutional assets match their reviewed source hashes", async () => {
  for(const record of [...logos,...photos]) {
    const buffer=await readFile("public"+record.local);
    assert.equal(createHash("sha256").update(buffer).digest("hex"),record.sha256,record.local);
    assert.ok(("source_url" in record && record.source_url) || ("source" in record && record.source));
  }
});
test("one-year and conflicting historical populations still expose switching and source records", () => {
  const base=mit.admissions[0];
  const records=[
    {...base,id:"a",year:2025,value:10,student_category:"Domestic"},
    {...base,id:"b",year:2025,value:20,student_category:"Domestic"},
    {...base,id:"c",year:2024,value:30,student_category:"International"},
    {...base,id:"d",year:2025,value:40,student_category:"International"},
  ];
  const html=renderToStaticMarkup(createElement(HistoryChart,{records,title:"Admission history",unit:"%"}));
  assert.ok(html.includes("<select") && html.includes("International"));
  assert.ok(html.includes("View values and sources"));
  assert.ok(html.includes("10") && html.includes("20"));
});
test("reviewed requirements retain alternatives, conditional scope and test-date-specific scales", () => {
  const reviewed = new Map(reviewedRequirements.records.map(r => [r.id, r]));
  for(const r of requirements) {
    const u=globalCatalogue.find(u=>u.id===r.university_id)!;
    assert.ok(u.requirements.some(row=>row.id===r.id));
    assert.equal(r.source_id,r.data_sources.id);
    assert.ok(r.source_url.startsWith("https://"));
    if (r.source_url === "https://inha.uz/prospective-students/admissions/application-guideline/") {
      assert.equal(r.year, 2026, "The official guideline explicitly names the 2026–2027 intake");
      assert.ok(r.student_category.includes("Korean track") && r.notes.includes("2026–2027"));
    } else {
      const receipt = reviewed.get(r.id);
      if (receipt) {
        assert.equal(r.year, receipt.year, "Installed intake year must match its reviewed official policy");
        if (receipt.year !== null) {
          assert.ok("reporting_period" in receipt.evidence && receipt.evidence.reporting_period?.includes(String(receipt.year)), "Only an explicitly announced admission cycle can supply an intake year");
        }
      } else assert.equal(r.year,null,"A verification date does not invent an intake year");
    }
  }
  assert.equal(requirements.find(r => r.id === "07ea0577-51a2-5915-9d4a-0fee7dfb70ed")!.year, 2026, "UCA announces the 2026 admission cycle");
  assert.equal(requirements.find(r => r.id === "79de29c0-c97a-5a88-b037-83d464956760")!.year, 2027, "Aalto announces 2027 entry despite its 2026 verification date");
  assert.equal(requirements.find(r => r.id === "9bc3cd06-0977-5040-8093-33408d9be2a4")!.year, null, "Toronto's undated policy must retain an unspecified intake year");
  assert.equal(requirements.find(r => r.id === "3f7b8e23-4ab6-5936-a0f2-6e6e105aa0d1")!.year, null, "The Nazarbayev policy's publication date does not announce an intake cohort");
  const toefl=toronto.requirements.find(r=>r.kind==="TOEFL")!;
  assert.equal(toefl.minimum,4.5);
  assert.ok(toefl.label.includes("1–6") && toefl.student_category.includes("21 January 2026"));
  assert.equal(toronto.requirements.find(r=>r.kind==="IELTS")!.required,null);
  const cambridge=globalCatalogue.find(u=>u.name==="University of Cambridge")!;
  assert.equal(cambridge.requirements.find(r=>r.kind==="IELTS")!.required,null);
  const oxford=globalCatalogue.find(u=>u.slug==="oxford")!;
  assert.ok(!oxford.requirements.some(r=>r.kind==="TOEFL"));
  assert.ok(oxford.requirements.some(r=>r.notes?.includes("not accepted while under review")));
});

test("evidence views retain population, period, scope, retrieval and safe dictionary links", () => {
  const record: Sourced = {
    id: "survey", year: 2024, source_id: "source", verification_status: "verified", verified_at: "2026-10-05", notes: null,
    source_url: "https://nces.ed.gov/ipeds/use-the-data/download-access-database",
    evidence: { population: "Full-time, first-time undergraduates", reporting_period: "2023–24 academic year", scope: "Pell Grant recipients", retrieved_at: "2026-09-26", dictionary_url: "https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx?gotoReportId=7&surveyNumber=7" },
  };
  const html = renderToStaticMarkup(createElement(SourceEvidenceDetails, { record }));
  for (const value of ["Population", "Full-time, first-time undergraduates", "2023–24 academic year", "Pell Grant recipients", "Sep 26, 2026", "View field definitions"]) assert.ok(html.includes(value));
  assert.equal(originalSourceURL(record), record.source_url, "A figure with an exact source URL needs no joined source to remain traceable");
  assert.equal(renderToStaticMarkup(createElement(SourceEvidenceDetails, { record: { ...record, evidence: { population: "  ", scope: "", dictionary_url: "javascript:alert(1)", retrieved_at: "invalid date" } } })), "");
  const fallback = renderToStaticMarkup(createElement(SourceEvidenceDetails, { record: { ...record, evidence: { ...record.evidence, retrieved_at: undefined, source_snapshot_retrieved_at: "2026-09-25T08:18:02Z" } } }));
  assert.ok(fallback.includes("Sep 25, 2026"));
  const joinedSource = { id: "source", name: "IPEDS", organization: "NCES", url: "https://nces.ed.gov/ipeds/", source_type: "government", license_notes: null, retrieved_at: "2026-09-24" };
  const sourceDate = renderToStaticMarkup(createElement(SourceEvidenceDetails, { record: { ...record, data_sources: joinedSource } }));
  assert.ok(sourceDate.includes("Sep 24, 2026") && !sourceDate.includes("Sep 26, 2026"), "Joined source retrieval remains authoritative when supplied");
  assert.equal(originalSourceURL({ ...record, source_url: undefined, data_sources: joinedSource }), joinedSource.url);
  assert.equal(originalSourceURL({ ...record, source_url: "javascript:alert(1)" }), undefined);
});
