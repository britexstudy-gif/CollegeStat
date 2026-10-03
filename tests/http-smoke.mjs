// Read-only local integration smoke. Does not create users or publish data.
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const timeoutMs = Number(process.env.TEST_HTTP_TIMEOUT_MS || 60000);
for (const path of [
  "/",
  "/universities",
  "/university/mit",
  "/compare",
  "/rankings",
  "/scholarships",
  "/resources",
  "/saved",
  "/dashboard",
  "/profile",
  "/research",
  "/auth/sign-in",
  "/staff/college-console",
  "/sources",
  "/methodology",
  "/statistics",
  "/support",
  "/resources/applications",
]) {
  const r = await fetch(base + path, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  assert.equal(r.status, 200, path);
  const html = await r.text();
  assert.ok(html.includes("CollegeStat"), path);
  console.log("PASS", path);
}
const ai = await fetch(base + "/api/research", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ question: "What does MIT report about tuition?" }),
  signal: AbortSignal.timeout(timeoutMs),
});
assert.equal(ai.status, 200);
const response = await ai.json();
assert.ok(
  response.evidence.every(
    (e) => e.url.startsWith("https://") && typeof e.value === "number",
  ),
);
console.log("PASS grounded research API");
const denied = await fetch(base + "/api/admin", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(denied.status, 401);
console.log("PASS unauthenticated admin denial");
const filtered = await fetch(base + "/api/research", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    question:
      "Computer science universities in Europe under $20k with scholarships and IELTS 7.0 or lower",
  }),
});
assert.equal(filtered.status, 200);
const result = await filtered.json();
assert.equal(result.filters.ielts_max, 7);
assert.equal(result.filters.scholarships, "yes");
assert.equal(result.total, 0);
assert.deepEqual(result.evidence, []);
console.log("PASS constrained research excludes unsupported matches");
const malformed = await fetch(base + "/api/research", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{",
});
assert.equal(malformed.status, 400);
console.log("PASS malformed JSON rejected");
const profile = await fetch(base + "/university/mit");
const html = await profile.text();
assert.ok(html.includes("Massachusetts Institute of Technology | CollegeStat"));
assert.ok(html.includes("application/ld+json"));
assert.equal(profile.headers.get("x-content-type-options"), "nosniff");
console.log("PASS public SEO and response hardening");
const missing = await fetch(base + "/university/no-such-university");
assert.equal(missing.status, 404);
console.log("PASS missing university is a real 404");
const catalog = await (
  await fetch(base + "/api/catalog?mode=explore&page=2")
).json();
assert.equal(catalog.universities.length, 24);
assert.ok(catalog.total >= 5000 && catalog.total <= 10000);
console.log("PASS expanded directory page 2");
const lookup = await (
  await fetch(base + "/api/catalog?mode=search&q=Harvard")
).json();
const harvard = lookup.find((u) => u.name === "Harvard University");
assert.ok(harvard);
const expanded = await fetch(base + "/university/" + harvard.slug);
assert.equal(expanded.status, 200);
const expandedHTML = await expanded.text();
assert.ok(expandedHTML.includes("Harvard University"));
assert.ok(expandedHTML.includes("How to apply"));
assert.ok(expandedHTML.includes("ShanghaiRanking"));
assert.ok(expandedHTML.includes("/logos/applications/common-app.svg"));
console.log("PASS downloaded profile and ranking badges render on server");
const rankingRows = await (
  await fetch(base + "/api/catalog?mode=rankings")
).json();
assert.ok(rankingRows.length > 1400);
console.log("PASS ranking catalogue");
for (const asset of [
  "/images/resources/compare.webp",
  "/images/resources/sat.webp",
  "/images/resources/funding.webp",
  "/images/resources/ielts.webp",
  "/images/resources/essays.webp",
  "/images/resources/applications.webp",
]) {
  const response = await fetch(base + asset);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("content-type")?.includes("image/webp"));
  console.log("PASS", asset);
}
const gate = await (await fetch(base + "/dashboard")).text();
assert.ok(
  !gate.includes("Your application plan"),
  "Private application data must not be in anonymous HTML",
);
console.log("PASS anonymous dashboard does not expose private data");

for (const [provider, total] of [
  ["qs", 1504],
  ["the", 2191],
  ["arwu", 1000],
]) {
  const table = await (
    await fetch(
      base +
        "/api/catalog?mode=ranking-table&provider=" +
        provider +
        "&page=99999",
    )
  ).json();
  assert.equal(table.total, total);
  assert.equal(table.page, table.pages);
  assert.ok(table.rows.length > 0);
  console.log("PASS complete " + provider + " table and final page");
}
const signIn = await (
  await fetch(base + "/auth/sign-in?next=%2Frankings%3Fprovider%3Dthe")
).text();
assert.ok(signIn.includes("Back to browsing"));
console.log("PASS sign-in back navigation present");

const smart = await (
  await fetch(base + "/api/catalog?mode=search&q=Oxford%20in%20UK")
).json();
assert.ok(smart.length > 0);
assert.ok(
  smart.every(
    (u) => u.country_code === "GB" && u.name.toLowerCase().includes("oxford"),
  ),
);
console.log("PASS natural-language search preserves institution name");
const tumSearch = await (
  await fetch(
    base + "/api/catalog?mode=search&q=Technical%20University%20of%20Munich",
  )
).json();
const tum = tumSearch.find((u) => u.website?.includes("tum.de"));
assert.ok(tum);
const programs = await (
  await fetch(base + "/university/" + tum.slug + "?tab=Academics")
).text();
assert.ok(programs.includes("Search programs"));
assert.ok(programs.includes("AI in Biomedicine"));
console.log("PASS official courses and source links render");
const mitData = await (await fetch(base + "/api/catalog?slug=mit")).json();
assert.ok(mitData.reported_programs.length > 0);
assert.ok(mitData.research_identity);
console.log("PASS profile research and program data");
const home = await (await fetch(base + "/")).text();
assert.ok(home.includes("University, country, or subject"));
assert.ok(home.includes("Find scholarships and funding."));
console.log("PASS direct home search and funding discovery");
for (const [tab, content] of [
  ["Admissions", "Application"],
  ["How to apply", "Application"],
  ["Costs", "Official funding programmes."],
  ["Scholarships", "Official funding programmes."],
  ["Academics", "course"],
  ["Research", "Research"],
  ["Students", "ordinary week"],
  ["Campus", "ordinary week"],
  ["Sources", "Official links for this profile"],
]) {
  const r = await fetch(
    base + "/university/mit?tab=" + encodeURIComponent(tab),
    { signal: AbortSignal.timeout(timeoutMs) },
  );
  assert.equal(r.status, 200, tab);
  assert.ok((await r.text()).includes(content), tab);
  console.log("PASS profile section", tab);
}
const awardPage = await (await fetch(base + "/scholarships")).text();
assert.ok(awardPage.includes("MIT Scholarship"));
assert.ok(awardPage.includes("Confirm current cycle"));
console.log("PASS scholarship records render before hydration");
const invalidGuide = await fetch(base + "/resources/no-such-guide");
assert.equal(invalidGuide.status, 404);
console.log("PASS invalid resource route is a real 404");
assert.ok((await invalidGuide.text()).includes('/images/status/not-found-collage.webp'));
const statusArtwork=await fetch(base+'/images/status/not-found-collage.webp');
assert.equal(statusArtwork.status,200);
assert.ok(statusArtwork.headers.get('content-type')?.includes('image/webp'));
assert.equal((await fetch(base+'/admin')).status,404);
assert.ok(signIn.includes('id="auth-title"') && signIn.includes('id="auth-email"'));
assert.ok(!signIn.includes('Continue with Google'),'Unconfigured OAuth is hidden');
console.log('PASS illustrated recovery, discreet staff entry and dedicated sign-in');
for (const asset of ["common-app", "ucas"]) {
  const response = await fetch(base + "/logos/applications/" + asset + ".svg");
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes("<svg"));
  console.log("PASS official platform asset", asset);
}
const applyHTML = await (
  await fetch(base + "/university/mit?tab=Admissions")
).text();
assert.ok(applyHTML.includes('aria-label="Application steps"'));
assert.ok(applyHTML.includes("Requirements &amp; dates"));
assert.ok(!applyHTML.includes("/logos/applications/common-app.svg"));
console.log("PASS own portal, ordered process, and requirements hierarchy");
assert.ok(home.includes("/images/hero/blue-collage.webp"));
// SSR intentionally shows the static poster until the browser checks motion preferences.
const collage = await fetch(base + "/images/hero/blue-collage-loop.mp4", {
  headers: { Range: "bytes=0-1023" },
});
assert.ok([200, 206].includes(collage.status));
assert.ok(collage.headers.get("content-type")?.includes("video/mp4"));
console.log("PASS restored blue collage and animation asset");
const compareHTML = await (
  await fetch(base + "/compare?ids=" + mitData.id + "," + harvard.id)
).text();
assert.ok(compareHTML.includes("Massachusetts Institute of Technology"));
assert.ok(compareHTML.includes("Harvard University"));
assert.ok(compareHTML.includes("Application requirements"));
assert.ok(compareHTML.includes("Comparison category"));
assert.ok(compareHTML.includes("Only differences"));
assert.ok(compareHTML.includes("Move Harvard University left"));
assert.ok(compareHTML.includes("Indexed research works"));
console.log("PASS populated comparison before hydration");
assert.ok(applyHTML.includes('role="tablist"'));
assert.ok(!applyHTML.includes("View section"));
assert.ok(applyHTML.includes("What to confirm for your application"));
assert.ok(programs.includes("Filter programs by first letter"));
assert.ok(programs.includes("Official program listings"));
console.log("PASS compact sections, requirements planner, Programs filters");
const directorySearchHTML = await (
  await fetch(base + "/universities?q=pro")
).text();
assert.ok(directorySearchHTML.includes("Search:"));
assert.ok(!directorySearchHTML.includes("q: pro"));
console.log("PASS readable search selection labels");
const oxfordApply = await (
  await fetch(base + "/university/oxford?tab=Admissions")
).text();
assert.ok(oxfordApply.includes("/logos/applications/ucas.svg"));
const ucasMark = await (
  await fetch(base + "/logos/applications/ucas.svg")
).text();
assert.ok(ucasMark.includes("<title>UCAS logo</title>"));
assert.ok(ucasMark.includes('viewBox="0 0 104.049 30"'));
const commonAppMark = await (
  await fetch(base + "/logos/applications/common-app.svg")
).text();
assert.ok(commonAppMark.includes('fill="#111827"'));
console.log("PASS readable full application platform marks");
const harvardPage = await (
  await fetch(base + "/university/" + harvard.slug)
).text();
assert.ok(harvardPage.includes("/logos/harvard-wordmark.svg"));
assert.ok(
  harvardPage.includes("University website, contact and social accounts"),
);
assert.ok(harvardPage.includes("/logos/social/"));
console.log("PASS sourced logo and top social accounts");
for (const name of [
  "University College London",
  "National University of Singapore",
]) {
  const matches = await (
    await fetch(base + "/api/catalog?mode=search&q=" + encodeURIComponent(name))
  ).json();
  const institution = matches.find((u) => u.name === name);
  assert.ok(institution, name);
  const page = await fetch(
    base + "/university/" + institution.slug + "?tab=Rankings",
  );
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes("QS"));
  console.log("PASS restored ranked profile", name);
}
for (const [name,mark,requirement] of [
  ["University of Toronto","/logos/toronto-wordmark.svg","Senior English course"],
  ["University of Cambridge","/logos/cambridge-wordmark.svg","normal offer condition"],
  ["The University of Hong Kong","/logos/hku.svg",null],
]) {
  const matches=await (await fetch(base+"/api/catalog?mode=search&q="+encodeURIComponent(name))).json();
  const institution=matches.find(u=>u.name===name);
  assert.ok(institution,name);
  const admissions=await (await fetch(base+"/university/"+institution.slug+"?tab=Admissions")).text();
  assert.ok(admissions.includes(mark));
  if(requirement) assert.ok(admissions.includes(requirement));
  const image=await fetch(base+mark);
  assert.equal(image.status,200);
  assert.ok(image.headers.get("content-type")?.includes("image/svg+xml"));
  if(name!=="University of Toronto") {
    const gallery=await (await fetch(base+"/university/"+institution.slug+"?tab=Gallery")).text();
    assert.ok(gallery.includes("/images/campuses/"+institution.id+".jpg"));
    assert.ok(gallery.includes("creativecommons.org"));
  }
  console.log("PASS reviewed institutional media and requirements",name);
}
assert.ok(oxfordApply.includes("TOEFL acceptance policy") && oxfordApply.includes("not accepted while under review"));
const ranked=await (await fetch(base+"/rankings")).text();
assert.ok(ranked.includes("/logos/hku.svg") && ranked.includes("View university"));
console.log("PASS sourced language policy and regional profile links");
