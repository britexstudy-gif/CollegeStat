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
  for(const r of requirements) {
    const u=globalCatalogue.find(u=>u.id===r.university_id)!;
    assert.ok(u.requirements.some(row=>row.id===r.id));
    assert.equal(r.source_id,r.data_sources.id);
    assert.ok(r.source_url.startsWith("https://"));
    assert.equal(r.year,null,"A verification date does not invent an intake year");
  }
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
