import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { normalizeOwn } from "../lib/articles-data";
import { dedupeBy, dedupeRequirements } from "../lib/requirements-merge";
import { mergeScholarships } from "../lib/scholarships-data";
import { canonicalise, dateRow, deadlinesFrom, feeFrom, parsedIssues, requirementRow, tuitionFrom } from "../scripts/data/admissions-nov14-lib";
import {
  buildEligibility,
  convertArticle,
  eligibilityConflicts,
  isValidIsoDate,
  judgeUrl,
  normalizeScholarshipRecord,
  parseEnglishMinimum,
  parseFrontmatter,
  parseMoney,
  parseNationality,
  resolveMonthDay,
  reviewArticleText,
  sameOrganisation,
  uuid5,
  validateScholarshipRecord,
  type Raw,
} from "../scripts/data/nov14-lib";

const json = <T = Raw[]>(p: string) => JSON.parse(readFileSync(p, "utf8")) as T;
const UUID5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const UNI = "39230496-b2fc-53ca-9303-1726c4ac13da";
const catalogue = new Map([[UNI, { id: UNI, name: "Harvard University", slug: "harvard-university-39230496" }]]);
const base = (over: Raw = {}): Raw => ({
  slug: "x-aid", name: "X Aid", description: "d", funding_type: "full", country_code: "US", level: "Bachelor", international: true,
  deadline: null, application_url: "https://x.edu/a", source_url: "https://x.edu/a", verification_status: "staged", year: 2027,
  eligible_nationalities: "all", central_asia_eligible: true, coverage: { tuition: true, living: null, travel: true, insurance: false },
  deadlines: [{ label: "Close", date: "2027-01-15", cycle_year: 2027 }], how_to_apply: ["Apply"], documents: ["Form"],
  university_ids: [UNI], university_scholarships: [{ university_id: UNI }], checked_at: "2026-11-14", ...over,
});

test("uuid5 matches the RFC 4122 test vector", () => {
  assert.equal(uuid5("python.org", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"), "886313e1-3b8a-5372-9b90-0c9aee199e5d");
});

test("date helpers reject impossible dates and resolve month-day with a cycle", () => {
  assert.equal(isValidIsoDate("2027-02-29"), false);
  assert.equal(isValidIsoDate("2028-02-29"), true);
  assert.equal(isValidIsoDate("15 January 2027"), false);
  assert.equal(resolveMonthDay("November 1", "Fall 2027 entry"), "2026-11-01");
  assert.equal(resolveMonthDay("January 1", "Fall 2027 entry"), "2027-01-01");
  assert.equal(resolveMonthDay("soon", "Fall 2027 entry"), null);
});

test("URL judgement: 200 and same-organisation redirects pass, others fail", () => {
  assert.ok(sameOrganisation("https://www.ox.ac.uk/a", "https://admissions.ox.ac.uk/b"));
  assert.ok(!sameOrganisation("https://www.ox.ac.uk/a", "https://www.cam.ac.uk/b"));
  assert.equal(judgeUrl("https://a.edu/x", 200, "https://a.edu/x").ok, true);
  assert.equal(judgeUrl("https://a.edu/x", 301, "https://www.a.edu/y").ok, true);
  assert.equal(judgeUrl("https://a.edu/x", 200, "https://spam.example.com/").ok, false);
  assert.equal(judgeUrl("https://a.edu/x", 404, null).ok, false);
  assert.equal(judgeUrl("https://a.edu/x", 0, null).ok, false);
  assert.equal(judgeUrl("https://a.example.com/x", 200, "https://a.example.com/x", { requireOfficial: true }).ok, false);
});

test("scholarship conversion gives the loader's fields and the loader admits only verified records", () => {
  const norm = normalizeScholarshipRecord(base(), catalogue, "2026-11-14");
  assert.deepEqual(norm.universities, [{ name: "Harvard University", slug: "harvard-university-39230496" }]);
  assert.equal(norm.covers, "Tuition, travel");
  assert.equal(norm.open_to_all, true);
  assert.equal(norm.deadline, "2027-01-15");
  assert.deepEqual(norm.timeline, [{ label: "Close", date: "2027-01-15", note: "2027 cycle" }]);
  assert.deepEqual(norm.steps, ["Apply"]);
  assert.equal(mergeScholarships([], [norm]).length, 0, "staged stays hidden");
  const [s] = mergeScholarships([], [{ ...norm, verification_status: "verified" }]);
  assert.equal(s.slug, "x-aid");
  assert.equal(s.openToAll, true);
  assert.equal(s.universities[0].slug, "harvard-university-39230496");
});

test("eligibility text never names Central Asian countries unless they are eligible", () => {
  const closed = buildEligibility(base({ eligible_nationalities: "Descendants of eligible Korean War veterans", central_asia_eligible: false })).join(" ");
  assert.match(closed, /Restricted by nationality/);
  const norm = normalizeScholarshipRecord(base({ eligible_nationalities: "Descendants of eligible Korean War veterans", central_asia_eligible: false }), catalogue, "2026-11-14");
  const [s] = mergeScholarships([], [{ ...norm, verification_status: "verified" }]);
  assert.equal(s.openToAll, false);
  assert.deepEqual(s.eligibleCodes, [], "loader must not read the exclusion sentence as eligibility");
  const unknown = normalizeScholarshipRecord(base({ eligible_nationalities: null, central_asia_eligible: null }), catalogue, "2026-11-14");
  const [u] = mergeScholarships([], [{ ...unknown, verification_status: "verified" }]);
  assert.deepEqual(u.eligibleCodes, []);
  const kz = normalizeScholarshipRecord(base({ eligible_nationalities: ["KZ"], central_asia_eligible: true }), catalogue, "2026-11-14");
  const [k] = mergeScholarships([], [{ ...kz, verification_status: "verified" }]);
  assert.deepEqual(k.eligibleCodes, ["KZ"]);
});

test("nationality parsing", () => {
  assert.equal(parseNationality("all").kind, "all");
  assert.deepEqual(parseNationality("RU"), { kind: "codes", codes: ["RU"], text: null });
  assert.deepEqual(parseNationality(["UZ", "KZ"]).codes, ["UZ", "KZ"]);
  assert.equal(parseNationality("DAC ODA recipient countries").kind, "text");
  assert.equal(parseNationality(null).kind, "unknown");
});

test("scholarship validator: required fields, dates, catalogue ids, eligibility consistency", () => {
  const ids = new Set([UNI]);
  assert.deepEqual(validateScholarshipRecord(base(), ids), { ok: true, reasons: [] });
  const bad = validateScholarshipRecord(base({ documents: [], deadline: "2027-13-01", university_ids: ["nope"], checked_at: "yesterday" }), ids).reasons.join("|");
  assert.match(bad, /documents/);
  assert.match(bad, /deadline does not parse/);
  assert.match(bad, /not in catalogue/);
  assert.match(bad, /checked_at does not parse/);
  assert.match(eligibilityConflicts(base({ central_asia_eligible: true, eligible_nationalities: ["RU"] }))[0], /true but eligible nationalities are RU/);
  assert.match(eligibilityConflicts(base({ central_asia_eligible: false }))[0], /false but eligible nationalities are all/);
  assert.match(eligibilityConflicts(base({ central_asia_eligible: null }))[0], /unresolved/);
  assert.deepEqual(eligibilityConflicts(base({ central_asia_eligible: false, eligible_nationalities: ["GB"] })), []);
});

test("article conversion keeps frontmatter and body, maps categories, and only approved articles load", () => {
  const src = `---\nslug: "ucas-2027"\ntitle: "UCAS 2027"\ncategory: "applications"\nsummary: "S"\nsources: [{"title": "T", "url": "https://www.ucas.com/x"}]\nchecked_at: "2026-11-14"\nstatus: "draft"\n---\n\n## Dates\n\nUCAS opens 12 May 2026. [T](https://www.ucas.com/x)\n`;
  const { meta, body } = parseFrontmatter(src);
  assert.equal(meta.slug, "ucas-2027");
  assert.ok(body.startsWith("## Dates"));
  const a = convertArticle(src);
  assert.equal(a.category, "applications");
  assert.equal(a.central_asia, false);
  assert.equal(a.status, "draft");
  assert.deepEqual(a.sources, [{ title: "T", url: "https://www.ucas.com/x" }]);
  assert.equal(normalizeOwn(a), null, "draft is hidden");
  const live = normalizeOwn({ ...a, status: "approved" });
  assert.equal(live?.slug, "ucas-2027");
  assert.equal(live?.category, "applications");
  assert.equal(convertArticle(src.replace('"applications"', '"study-abroad"').replace('"ucas-2027"', '"uzbekistan-11-year-certificate"')).category, "central-asia");
  assert.equal(convertArticle(src.replace('"applications"', '"study-abroad"').replace('"ucas-2027"', '"student-visa-basics"')).category, "visas");
  assert.equal(convertArticle(src.replace('"applications"', '"study-abroad"').replace('"ucas-2027"', '"south-korea-gks-direct"')).category, "money");
});

test("article review flags marketing wording and unsourced figures, not negated guarantees", () => {
  const src = [{ url: "https://a.edu" }];
  assert.match(reviewArticleText("Unlock your journey today.", src).join(), /marketing/);
  assert.deepEqual(reviewArticleText("This does not guarantee admission. [A](https://a.edu)", src), []);
  assert.match(reviewArticleText("The fee is 95 dollars.", src).join(), /no link/);
  assert.deepEqual(reviewArticleText("The fee is 95 dollars. [A](https://a.edu)", src), []);
  assert.deepEqual(reviewArticleText("As of 14 November 2026 this is the 2026 notice.", src), []);
  assert.match(reviewArticleText("Plain text.", []).join(), /no sources/);
});

test("English minimum parsing accepts clean values and rejects hedged ones", () => {
  assert.deepEqual(parseEnglishMinimum("IELTS", "IELTS 5.5 minimum."), { minimum: 5.5, maximum: null, scale: "ielts", component: null });
  assert.equal(parseEnglishMinimum("IELTS", "6.5 overall, minimum 6.0 each component")?.component, 6);
  assert.equal(parseEnglishMinimum("IELTS", "IELTS Academic overall 6.5, with Writing 6.5")?.minimum, 6.5);
  assert.equal(parseEnglishMinimum("IELTS", "IELTS 7.0 for assignment to some majors; not a universal minimum"), null);
  assert.equal(parseEnglishMinimum("IELTS", "Program-specific; IELTS 5.5 exempts from remedial English"), null);
  assert.equal(parseEnglishMinimum("IELTS", 6.5)?.minimum, 6.5);
  assert.equal(parseEnglishMinimum("TOEFL", "90 (1–120 scale); 4.5 (1–6 scale)")?.scale, "toefl120");
  assert.equal(parseEnglishMinimum("TOEFL", "4.5 on the current 1–6 scale")?.scale, "toefl6");
  assert.equal(parseEnglishMinimum("TOEFL", null), null);
});

test("sanity ranges: IELTS 4-9, TOEFL 0-120, positive money with a currency", () => {
  const issues = (p: Parameters<typeof parsedIssues>[0]) => parsedIssues(p);
  assert.deepEqual(issues({ ielts: { minimum: 6.5, maximum: null, scale: "ielts", component: null } }), []);
  assert.match(issues({ ielts: { minimum: 3.5, maximum: null, scale: "ielts", component: null } })[0], /outside 4-9/);
  assert.match(issues({ ielts: { minimum: 9.5, maximum: null, scale: "ielts", component: null } })[0], /outside 4-9/);
  assert.match(issues({ toefl: { minimum: 130, maximum: null, scale: "toefl120", component: null } })[0], /outside 0-120/);
  assert.match(issues({ fee: { amount: 0, currency: "USD" } })[0], /positive/);
  assert.match(issues({ tuition: { amount: 5000, currency: "", period: "year", note: null } })[0], /currency/);
  assert.match(issues({ deadlines: [{ label: "x", date: "2027-02-30", cycle: null }] })[0], /does not parse/);
});

test("money parsing needs exactly one clear amount", () => {
  assert.deepEqual(parseMoney("CAD 150 for new applicants."), { amount: 150, currency: "CAD" });
  assert.deepEqual(parseMoney("RM100 processing fee"), { amount: 100, currency: "MYR" });
  assert.deepEqual(parseMoney("€60 fee"), { amount: 60, currency: "EUR" });
  assert.equal(parseMoney("KRW 150,000 arts; KRW 200,000 design"), null);
  assert.equal(parseMoney("fee not found"), null);
  assert.deepEqual(parseMoney(17000, "JPY"), { amount: 17000, currency: "JPY" });
  assert.equal(parseMoney(17000), null);
  assert.deepEqual(feeFrom({ route: "Direct", application_fee: { amount: 95, currency: "USD" } }), { amount: 95, currency: "USD" });
  assert.deepEqual(feeFrom("Direct online application; HKD 780 fee for 2027 intake."), { amount: 780, currency: "HKD" });
  assert.equal(feeFrom({ routes: ["OUAC: CAD 156", "Direct: CAD 140"] }), null);
});

test("tuition is taken only as one annual figure", () => {
  assert.deepEqual(tuitionFrom({ academic_year: "2027/28", amount: 230000, currency: "HKD/year for non-local students" })?.amount, 230000);
  assert.equal(tuitionFrom({ amount: 2500, currency: "AED per credit hour" }), null);
  assert.equal(tuitionFrom("USD 36,500 per academic year for international undergraduates, 2026-2027.")?.amount, 36500);
  assert.equal(tuitionFrom("USD 21,500 per academic year; Medicine USD 29,500 per academic year"), null);
  assert.equal(tuitionFrom({ amount: "CAD 39,000–55,000" }), null);
});

test("deadlines: only ISO or month-day dates for the 2027 cycle", () => {
  assert.deepEqual(deadlinesFrom({ cycle: 2027, open: "2026-09-23", close: "2027-08-25", first_round: "2026-11-25" }).map((d) => d.date), ["2027-08-25", "2026-11-25"]);
  assert.deepEqual(deadlinesFrom({ cycle: 2026, close: "2026-07-01" }), []);
  assert.deepEqual(deadlinesFrom([{ round: "Regular Decision", date: "January 1", cycle: "Fall 2027 entry" }]), [{ label: "Regular Decision", date: "2027-01-01", cycle: "Fall 2027 entry" }]);
  assert.deepEqual(deadlinesFrom("Latest published recurring dates: 15 July"), []);
});

test("canonicalise reads all five input shapes", () => {
  const leafOf = (value: unknown, url = "https://u.edu/a") => ({ value, source_url: url, checked_at: "2026-11-14" });
  const common = { university_id: UNI, name: "U", country: "US", verification_status: "staged" };
  const p2 = canonicalise({ ...common, english_ielts: leafOf("IELTS 6.0 minimum."), english_toefl_ibt: leafOf("TOEFL iBT 80 minimum."), english_duolingo: leafOf(null), english_waivers: leafOf(null), application_route: leafOf("Direct"), application_fee: leafOf("USD 50 one-time application fee."), deadlines: leafOf(null), international_tuition: leafOf(null), international_aid: leafOf(null), central_asian_cis_scholarships: leafOf(null), foundation_for_11_year_schooling: leafOf(null) });
  assert.equal(p2.shape, "p2");
  assert.equal(p2.parsed.ielts?.minimum, 6);
  assert.equal(p2.parsed.toefl?.minimum, 80);
  assert.deepEqual(p2.parsed.fee, { amount: 50, currency: "USD" });
  const p3 = canonicalise({ ...common, english: { ielts_academic_overall: leafOf("6.5"), ielts_min_band: leafOf("6.0"), toefl_ibt: leafOf("90"), duolingo: leafOf(null), waivers: leafOf(null) }, application: { route: leafOf("Direct"), fee_amount: leafOf(17000), fee_currency: leafOf("JPY") }, deadlines: { cycle: leafOf("2027"), early: leafOf(null), regular: leafOf(null) }, tuition: { amount: leafOf(535800), currency: leafOf("JPY"), academic_year: leafOf("2026") }, aid: leafOf(null), foundation: leafOf(null) });
  assert.equal(p3.shape, "p3");
  assert.equal(p3.parsed.ielts?.minimum, 6.5);
  assert.equal(p3.parsed.ielts?.component, 6);
  assert.deepEqual(p3.parsed.fee, { amount: 17000, currency: "JPY" });
  assert.equal(p3.parsed.tuition?.amount, 535800);
  const p4 = canonicalise({ ...common, english: leafOf({ "IELTS Academic": "6.5", "TOEFL iBT": "79", Duolingo: null, waivers: null }), application_route_and_fee: leafOf("Direct; CAD 150 for new applicants."), deadlines: leafOf({ cycle: 2027, close: "2027-02-01" }), international_tuition_per_year: leafOf({ amount: 15000, currency: "USD/year" }), international_aid: leafOf(null), foundation_for_11_year_certificate: leafOf(null) });
  assert.equal(p4.shape, "p4");
  assert.equal(p4.parsed.toefl?.minimum, 79);
  assert.deepEqual(p4.parsed.fee, { amount: 150, currency: "CAD" });
  assert.equal(p4.parsed.deadlines?.[0].date, "2027-02-01");
  assert.equal(p4.parsed.tuition?.currency, "USD");
  const p1 = canonicalise({ ...common, english: leafOf(null), application_route_and_fee: leafOf({ route: "UC", application_fee: { amount: 95, currency: "USD" } }), deadlines: leafOf(null), international_tuition_per_year: leafOf(null), international_aid: leafOf(null), central_asian_cis_scholarship: leafOf(null), foundation_for_11_year_certificate: leafOf(null) });
  assert.equal(p1.shape, "p1");
  assert.equal(p1.fields.application_route.value, "UC");
  assert.deepEqual(p1.parsed.fee, { amount: 95, currency: "USD" });
  const b = canonicalise({ ...common, english: leafOf({ "IELTS Academic": null }), application: leafOf({ route: "Common App", application_fee: { amount: 75, currency: "USD" } }), deadlines: leafOf([{ round: "RD", date: "January 1", cycle: "Fall 2027 entry" }]), tuition_per_year: leafOf(null), aid: leafOf(null), central_asian_scholarship: leafOf(null), foundation_year: leafOf(null) });
  assert.equal(b.shape, "base");
  assert.equal(b.parsed.deadlines?.[0].date, "2027-01-01");
});

test("requirement dedupe never repeats a university's test kind", () => {
  const existing = [{ id: "1", university_id: "A", kind: "IELTS", program_id: null }, { id: "2", university_id: "A", kind: "SAT", program_id: null }];
  const incoming = [
    { id: "3", university_id: "A", kind: "IELTS" },
    { id: "4", university_id: "A", kind: "TOEFL" },
    { id: "5", university_id: "A", kind: "TOEFL" },
    { id: "6", university_id: "B", kind: "ielts" },
  ];
  assert.deepEqual(dedupeRequirements(existing, incoming).map((r) => r.id), ["4", "6"]);
  assert.deepEqual(dedupeBy([{ k: "x" }], [{ k: "x" }, { k: "y" }, { k: "y" }], (r) => String(r.k)).length, 1);
});

test("published rows keep the shape of requirements-current and use deterministic v5 ids", () => {
  const c = canonicalise({ university_id: UNI, name: "U", country: "US", english_ielts: { value: "IELTS 6.0 minimum.", source_url: "https://u.edu/e", checked_at: "2026-11-14" }, english_toefl_ibt: { value: null }, english_duolingo: { value: null }, english_waivers: { value: null }, application_route: { value: null }, application_fee: { value: null }, deadlines: { value: null }, international_tuition: { value: null }, international_aid: { value: null }, central_asian_cis_scholarships: { value: null }, foundation_for_11_year_schooling: { value: null } });
  const row = requirementRow(c, "IELTS", c.parsed.ielts!, "https://u.edu/e");
  const ref = json("data/published/requirements-current.json")[0];
  for (const k of Object.keys(ref).filter((k) => k !== "evidence")) assert.ok(k in row, `missing ${k}`);
  assert.equal(row.kind, "IELTS");
  assert.equal(row.minimum, 6);
  assert.match(String(row.id), UUID5);
  assert.equal(row.id, requirementRow(c, "IELTS", c.parsed.ielts!, "https://u.edu/e").id);
  const d = dateRow(c, { label: "Applications close", date: "2027-02-01", cycle: "2027" }, "https://u.edu/d");
  assert.equal(d.due_at, "2027-02-01");
  assert.match(String(d.id), UUID5);
});

test("published segment files are consistent with requirements-current", () => {
  const current = json("data/published/requirements-current.json") as Raw[];
  const seg = json("data/published/requirements-segment-nov14.json") as Raw[];
  const have = new Set(current.filter((r) => r.program_id == null).map((r) => `${r.university_id}|${r.kind}`));
  const ids = new Set<string>();
  const kinds = new Set<string>();
  for (const r of seg) {
    assert.match(String(r.id), UUID5);
    assert.ok(!ids.has(String(r.id)), "unique id");
    ids.add(String(r.id));
    const key = `${r.university_id}|${r.kind}`;
    assert.ok(!have.has(key), `${key} already in requirements-current`);
    assert.ok(!kinds.has(key), `${key} repeated`);
    kinds.add(key);
    assert.ok(["IELTS", "TOEFL"].includes(String(r.kind)));
    assert.equal(r.verification_status, "verified");
    assert.ok(/^https?:\/\//.test(String(r.source_url)));
    const m = r.minimum as number;
    if (r.kind === "IELTS") assert.ok(m >= 4 && m <= 9);
    else assert.ok(m >= 0 && m <= 120);
  }
  for (const f of ["application-fees", "application-dates"]) {
    const rows = json(`data/published/${f}-segment-nov14.json`) as Raw[];
    const cur = json(`data/published/${f}-current.json`) as Raw[];
    assert.ok(rows.every((r) => UUID5.test(String(r.id)) && !cur.some((c) => c.id === r.id)));
  }
  for (const r of json("data/published/application-fees-segment-nov14.json") as Raw[]) assert.ok((r.amount as number) > 0 && /^[A-Z]{3}$/.test(String(r.currency)));
  for (const r of json("data/published/application-dates-segment-nov14.json") as Raw[]) assert.ok(isValidIsoDate(r.due_at));
});

test("reviewed scholarship file: every verified record carries loader fields and valid catalogue ids", () => {
  const recs = json("data/review/scholarships-nov14.json") as Raw[];
  const list = new Set((json("data/generated/catalogue/list.json") as { id: string }[]).map((u) => u.id));
  const verified = recs.filter((r) => r.verification_status === "verified");
  assert.ok(verified.length > 0);
  for (const r of verified) {
    assert.ok(Array.isArray(r.eligibility) && (r.eligibility as unknown[]).length, `${r.slug} eligibility`);
    assert.ok(Array.isArray(r.timeline) && Array.isArray(r.eligible_country_codes), `${r.slug} lists`);
    for (const id of r.university_ids as string[]) assert.ok(list.has(id));
  }
  for (const r of recs.filter((x) => x.verification_status !== "verified")) assert.ok(r.review_note, `${r.slug} needs a review_note`);
  assert.equal(mergeScholarships([], recs).length, verified.length);
});

test("reviewed article JSON: approved ones load, drafts carry a note", () => {
  const dir = "data/review/articles-nov14";
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 30);
  for (const f of files) {
    const a = json<Raw & { sources: unknown[]; body: string; slug: string }>(`${dir}/${f}`);
    if (a.status === "approved") assert.ok(normalizeOwn(a), f);
    else assert.ok(a.review_note, `${f} needs a note`);
    assert.ok(a.sources.length > 0 && a.body && a.slug === f.replace(/\.json$/, ""));
  }
});
