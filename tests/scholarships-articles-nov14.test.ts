import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import overlay from "../data/review/content-articles-nov15.json";
import assert from "node:assert/strict";
import {
  centralAsiaCodes,
  deadlineInfo,
  deadlineState,
  reconcileDeadline,
  filterScholarships,
  mergeScholarships,
  normalizeScholarship,
  relatedScholarships,
  sortScholarships,
} from "../lib/scholarships-data";
import { adjacentArticles, categorize, filterArticles, mergeArticles, parseMarkdown, relatedArticles, tableOfContents, usedCategories } from "../lib/articles-data";
import { allScholarships, getScholarship } from "../lib/scholarships-load";
import { allArticles } from "../lib/articles-load";

const rec = (over: Record<string, unknown>) => ({ name: "Award", slug: "award", funding_type: "full", country_code: "GB", level: "Master", ...over });

test("only verified reviewed scholarships join the published ones", () => {
  const merged = mergeScholarships(
    [[rec({ slug: "a", name: "A" })]],
    [
      rec({ slug: "b", name: "B", verification_status: "verified" }),
      rec({ slug: "c", name: "C", verification_status: "pending" }),
      rec({ slug: "d", name: "D" }),
    ],
  );
  assert.deepEqual(merged.map((s) => s.slug), ["a", "b"]);
});

test("scholarships are deduplicated by slug, then by name, published first with gaps filled", () => {
  const merged = mergeScholarships(
    [[rec({ slug: "x", name: "X Scholarship", description: null })], [rec({ slug: "y", name: "Y" })]],
    [
      rec({ slug: "x", name: "X Scholarship", description: "From review", verification_status: "verified", deadline: "2027-01-15" }),
      rec({ slug: "y-2", name: "Y!", verification_status: "verified" }),
    ],
  );
  assert.equal(merged.length, 2);
  const x = merged.find((s) => s.slug === "x")!;
  assert.equal(x.description, "From review");
  assert.equal(x.deadline, "2027-01-15");
});

test("the loaded set keeps every published scholarship with a unique slug", () => {
  // Node loads only the published files (duplicates merged, irrelevant ones hidden); Vite adds the reviewed ones.
  assert.ok(allScholarships.length >= 90);
  assert.equal(new Set(allScholarships.map((s) => s.slug)).size, allScholarships.length);
  assert.ok(getScholarship("pearson"));
  assert.equal(getScholarship("nope"), undefined);
});

test("the overlay merges duplicate slugs, hides records and overrides facts", () => {
  const merged = mergeScholarships(
    [[rec({ slug: "a", name: "A", level: "Bachelor" }), rec({ slug: "a-old", name: "A old", description: "Old text" }), rec({ slug: "h", name: "H" })]],
    [rec({ slug: "r", name: "R", verification_status: "staged" })],
    {
      aliases: { "a-old": "a" },
      hidden: ["h"],
      records: {
        a: { amount_headline: "¥1 a month", coverage: { tuition: true, travel: false }, central_asia_eligible: true, faq: [{ q: "Q?", a: "A." }] },
        r: { verification_status: "verified", undergrad: false },
      },
    },
  );
  assert.deepEqual(merged.map((s) => s.slug), ["a", "r"]);
  const a = merged[0];
  assert.equal(a.description, "Old text");
  assert.equal(a.amountHeadline, "¥1 a month");
  assert.deepEqual(a.coverage, { tuition: true, living: null, travel: false, insurance: null });
  assert.deepEqual(centralAsiaCodes(a), ["UZ", "KZ", "KG", "TJ"]);
  assert.equal(merged[1].undergrad, false);
  assert.deepEqual(filterScholarships(merged, { level: "Bachelor" }).map((s) => s.slug), ["a"]);
  assert.equal(getScholarship("mext-undergraduate-students-scholarship")?.slug, "mext-undergrad-2027");
});

test("deadline-soon and Central Asia filters", () => {
  const list = mergeScholarships([
    [
      rec({ slug: "soon", name: "Soon", deadline: "2026-12-20", eligible_nationalities: "All" }),
      rec({ slug: "late", name: "Late", deadline: "2027-09-01" }),
      rec({ slug: "past", name: "Past", deadline: "2026-01-01", central_asia_eligible: false, eligible_nationalities: "All" }),
    ],
  ]);
  assert.deepEqual(filterScholarships(list, { soon: true, today: "2026-11-16" }).map((s) => s.slug), ["soon"]);
  assert.deepEqual(filterScholarships(list, { ca: true }).map((s) => s.slug), ["soon"]);
});

test("Central Asian eligibility comes from explicit codes, named countries or open-to-all wording", () => {
  const n = (over: Record<string, unknown>) => normalizeScholarship(rec(over))!;
  assert.deepEqual(centralAsiaCodes(n({ eligible_nationalities: "International students" })), ["UZ", "KZ", "KG", "TJ"]);
  assert.deepEqual(centralAsiaCodes(n({ eligible_nationalities: "Citizens of Uzbekistan and Kazakhstan" })), ["UZ", "KZ"]);
  assert.deepEqual(centralAsiaCodes(n({ eligible_country_codes: ["kg"] })), ["KG"]);
  assert.deepEqual(centralAsiaCodes(n({ eligible_nationalities: "Nigerian nationals" })), []);
  assert.deepEqual(centralAsiaCodes(n({ eligible_nationalities: "Citizens of eligible countries" })), []);
});

test("filters, sorting and related scholarships", () => {
  const today = "2026-11-14";
  const list = mergeScholarships([
    [
      rec({ slug: "a", name: "A", deadline: "2026-12-01", eligible_nationalities: "All" }),
      rec({ slug: "b", name: "B", deadline: "2026-01-10", funding_type: "tuition", country_code: "DE" }),
      rec({ slug: "c", name: "C", country_code: "GB", eligible_nationalities: "Citizens of Kyrgyzstan" }),
    ],
  ]);
  assert.deepEqual(sortScholarships(list, today).map((s) => s.slug), ["a", "c", "b"]);
  assert.equal(deadlineState(list[1], today), "closed");
  assert.deepEqual(filterScholarships(list, { funding: "partial" }).map((s) => s.slug), ["b"]);
  assert.deepEqual(filterScholarships(list, { nationality: "KG" }).map((s) => s.slug), ["a", "c"]);
  assert.deepEqual(filterScholarships(list, { nationality: "UZ" }).map((s) => s.slug), ["a"]);
  assert.deepEqual(filterScholarships(list, { month: 12 }).map((s) => s.slug), ["a"]);
  assert.deepEqual(filterScholarships(list, { country: "DE", q: "b" }).map((s) => s.slug), ["b"]);
  assert.deepEqual(relatedScholarships(list, list[0]).map((s) => s.slug), ["c"]);
});

const article = (over: Record<string, unknown>) => ({ slug: "own", title: "Own guide", status: "approved", body: "Intro.\n\n## One\n\nText.", category: "applications", ...over });
const external = [{ slug: "ext", title: "How To Write A College Essay", provider: "MIT", category: "applications", url: "https://x.edu/a", featured: true }];

test("only approved reviewed articles join, deduplicated by slug with ours first", () => {
  const merged = mergeArticles(external, [
    article({}),
    article({ slug: "draft", status: "draft" }),
    article({ slug: "ext", title: "Replacement", status: "approved" }),
    article({ slug: "empty", body: "" }),
  ]);
  assert.deepEqual(merged.map((a) => a.slug), ["own", "ext"]);
  assert.equal(merged[1].kind, "own");
  assert.ok(merged[0].readingMinutes! >= 1);
});

test("articles are categorised, filtered, paired and parsed", () => {
  assert.equal(categorize("choosing-university"), "choosing");
  assert.equal(categorize("applications", "5 Essay Writing Tips"), "essays");
  assert.equal(categorize("study-abroad", "Apply For Your U.S. Student Visa"), "visas");
  const merged = mergeArticles(external, [
    article({ slug: "ca", central_asia: true, category: "visas" }),
    article({ slug: "ca2", central_asia: true, category: "visas" }),
  ]);
  assert.deepEqual(filterArticles(merged, "visas", "").map((a) => a.slug), ["ca", "ca2"]);
  assert.deepEqual(filterArticles(merged, "all", "mit").map((a) => a.slug), ["ext"]);
  assert.ok(usedCategories(merged).some((c) => c.id === "visas"));
  assert.deepEqual(adjacentArticles(merged, merged[1]).prev?.slug, "ca");
  assert.deepEqual(relatedArticles(merged, merged[0]).map((a) => a.slug), ["ca2"]);
  const blocks = parseMarkdown("# Title\n\nPara **bold**.\n\n## One\n\n- a\n- b\n\n## One\n\n1. x\n2. y");
  assert.deepEqual(tableOfContents(blocks).map((h) => h.id), ["one", "one-2"]);
  assert.deepEqual(blocks.map((b) => b.type), ["p", "h2", "ul", "h2", "ol"]);
});

test("the loaded library lists only summarised outside articles, each with its own page slug", () => {
  const outside = allArticles.filter((a) => a.kind === "external");
  assert.ok(outside.length >= 1 && outside.length <= 8, "few, useful outside summaries");
  // Our own guides load through Vite's glob, so read the reviewed files directly.
  const dir = new URL("../data/review/articles-nov14/", import.meta.url);
  const approved = new Set((overlay as { approve: string[] }).approve);
  const own = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")))
    .filter((a) => approved.has(a.slug));
  assert.equal(own.length, 12, "twelve finished CollegeStat guides");
  for (const a of own) {
    assert.ok(a.sources.length >= 2, a.slug + " cites sources");
    assert.match(a.body, /^## In short/, a.slug);
    assert.match(a.body, /\*\*Example\.\*\*/, a.slug + " has an example");
    assert.doesNotMatch(a.body, /sendted|checkation/, a.slug);
  }
  for (const a of outside) {
    assert.ok(a.summary, a.slug);
    assert.ok(a.keyPoints.length >= 3, a.slug);
    assert.match(a.url ?? "", /^https:\/\//);
  }
  assert.equal(allArticles.find((a) => a.slug === "harvard-first-year-advice"), undefined);
  assert.equal(new Set(allArticles.map((a) => a.slug)).size, allArticles.length);
});

test("one deadline for tile, list and timeline", () => {
  const rows = [
    { label: "Applications open", date: "2026-10-01", note: null },
    { label: "Applications close", date: "2027-01-15", note: null },
    { label: "Results", date: "2027-03-01", note: null },
  ];
  const r = reconcileDeadline("2027-02-20", rows);
  assert.equal(r.deadline, "2027-01-15", "the timeline's closing row wins over a stray date");
  const solo = reconcileDeadline("2027-02-20", []);
  assert.deepEqual(solo.timeline.map((t) => t.date), ["2027-02-20"]);
  assert.equal(deadlineInfo(r, "2026-11-16").state, "open");
  assert.equal(deadlineInfo(r, "2026-11-16").days, 60);
  assert.equal(deadlineInfo(r, "2027-02-01").state, "next");
  assert.equal(deadlineInfo(solo, "2027-03-01").state, "closed");
  assert.equal(deadlineInfo({ deadline: null, timeline: [] }, "2027-03-01").state, "none");
});
