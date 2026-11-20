import assert from "node:assert/strict";
import test from "node:test";
import { Budget, costOf } from "../scripts/collect/cost";
import { amountsNearTuition, dates, duolingo, extractHints, ielts, isLatestYear, platforms, toefl } from "../scripts/collect/extract";
import { buildRecord } from "../scripts/collect/record";
import { approxTokens, filterBlocks, htmlToBlocks, looksBlocked, parseRobots, parseSitemap, sameDomain, scoreUrl } from "../scripts/collect/text";

test("htmlToBlocks strips scripts/nav and joins table rows", () => {
  const b = htmlToBlocks(`<nav>Menu menu menu menu</nav><script>var x=1;tuition tuition</script><p>International tuition is $45,000 per year.</p><table><tr><td>Application deadline</td><td>January 15, 2027</td></tr></table>`);
  assert.ok(b.some((x) => x.includes("$45,000")));
  assert.ok(b.some((x) => x.includes("Application deadline | January 15, 2027")));
  assert.ok(!b.some((x) => /Menu|var x/.test(x)));
});

test("filterBlocks keeps relevant, drops noise, respects token budget", () => {
  const noise = Array.from({ length: 50 }, (_, i) => `Welcome to our wonderful campus life number ${i} with trees`);
  const rel = ["International students pay tuition of £29,500 per year.", "IELTS 6.5 overall with no band below 6.0 is required.", "Apply through UCAS by 14 January 2027."];
  const out = filterBlocks([...noise, ...rel], 2000);
  assert.deepEqual(out, rel);
  const many = Array.from({ length: 200 }, (_, i) => `Tuition fee for programme ${i} is $${10000 + i} per year for international students`);
  const capped = filterBlocks(many, 500);
  assert.ok(capped.reduce((s, b) => s + approxTokens(b), 0) <= 500);
});

test("regex extractors", () => {
  assert.deepEqual(ielts("Applicants need IELTS Academic 6.5 overall with no band below 6.0."), { overall: 6.5, band: 6 });
  assert.equal(ielts("IELTS is accepted"), null);
  assert.equal(toefl("TOEFL iBT: minimum score of 92"), 92);
  assert.equal(toefl("TOEFL 1200"), null);
  assert.equal(duolingo("Duolingo English Test minimum 120"), 120);
  const a = amountsNearTuition("International undergraduate tuition: £29,500 per year. Coffee costs £3,000,000 maybe");
  assert.equal(a[0].amount, 29500); assert.equal(a[0].currency, "GBP"); assert.equal(a[0].period, "year");
  assert.equal(amountsNearTuition("Tuition 12 000 EUR per semester")[0].period, "semester");
  assert.deepEqual(dates("The UCAS deadline is 14 January 2027 and the campus opens 3 May."), ["14 January 2027"]);
  assert.deepEqual(platforms("Apply via UCAS or Common App"), ["UCAS", "Common App"]);
  assert.equal(extractHints("IELTS 7.0 and TOEFL 100").ielts[0], "7");
});

test("latest-year rule", () => {
  assert.ok(isLatestYear("2026/27")); assert.ok(isLatestYear("2025/26")); assert.ok(isLatestYear(null));
  assert.ok(!isLatestYear("2023/24"));
});

test("urls, domains, robots, sitemaps, blocks", () => {
  assert.ok(scoreUrl("https://x.edu/admissions/international/tuition-fees") > scoreUrl("https://x.edu/about"));
  assert.equal(scoreUrl("https://x.edu/news/2026"), -1);
  assert.ok(sameDomain("https://admissions.x.edu/a", "https://www.x.edu"));
  assert.ok(!sameDomain("https://evil.com/a", "https://www.x.edu"));
  const r = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/open\nSitemap: https://x.edu/s.xml\nUser-agent: BadBot\nDisallow: /");
  assert.ok(!r.allowed("/private/x")); assert.ok(r.allowed("/private/open/y")); assert.ok(r.allowed("/admissions"));
  assert.deepEqual(r.sitemaps, ["https://x.edu/s.xml"]);
  assert.ok(!parseRobots("User-agent: CollegeStatBot\nDisallow: /").allowed("/a"));
  assert.deepEqual(parseSitemap("<urlset><url><loc>https://x.edu/a</loc></url></urlset>").urls, ["https://x.edu/a"]);
  assert.ok(looksBlocked(403, "")); assert.ok(looksBlocked(200, "<title>Just a moment...</title>")); assert.ok(!looksBlocked(200, "<p>hello</p>"));
});

test("cost cap stops the run", () => {
  assert.equal(costOf(1_000_000, 1_000_000), 1.5);
  const b = new Budget(1.5, 0);
  assert.ok(!b.exhausted());
  b.add(2_000_000, 500_000);
  assert.ok(Math.abs(b.spent - 1.2) < 1e-9); assert.ok(!b.exhausted());
  b.add(1_000_000, 0);
  assert.ok(b.exhausted());
  assert.ok(new Budget(1.5, 1.499).exhausted());
});

test("buildRecord: sources required, semester annualised, old years nulled", () => {
  const pages: any = [{ url: "https://x.edu/fees", status: 200 }];
  const u = { id: "1", slug: "x", name: "X", country_code: "GB" };
  const r = buildRecord(u, pages, { tuition: { amount: 10000, currency: "gbp", period: "semester", academic_year: "2026/27", src: "P1" }, platform: { value: "UCAS", src: "P9" } }, "2026-11-16");
  assert.equal(r.tuition.amount, 20000); assert.equal(r.tuition.currency, "GBP"); assert.equal(r.tuition.source_url, "https://x.edu/fees");
  assert.equal(r.platform.value, null);
  const old = buildRecord(u, pages, { tuition: { amount: 9000, currency: "USD", period: "year", academic_year: "2022/23", src: "P1" } }, "2026-11-16");
  assert.equal(old.tuition.amount, null); assert.match(old.tuition.note, /older/);
});
