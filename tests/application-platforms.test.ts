import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applicationKey,
  buildPlatformData,
  detectPlatform,
  groupApplications,
  nextDeadline,
  parseRouteText,
  type PlatformData,
  type PlatformUniversity,
} from "../lib/application-platforms";
import data from "../components/college/application-practice/platform-data.json";
import { overallProgress, sectionsFor, sectionProgress, seedChoices, validate, itemKey, valueKey, type FormContext } from "../components/college/application-practice/forms";

const pd = data as unknown as PlatformData;
const uni = (id: string, country_code: string, extra: Partial<PlatformUniversity> = {}): PlatformUniversity => ({ id, name: id, country_code, ...extra });
const empty: PlatformData = { generated_from: [], common_app: {}, routes: {}, dates: {} };
const id = (u: PlatformUniversity, d: PlatformData = empty) => detectPlatform(u, d).platform.id;

test("country defaults", () => {
  assert.equal(id(uni("a", "GB")), "ucas");
  assert.equal(id(uni("a", "US")), "common-app");
  assert.equal(id(uni("a", "DE")), "uni-assist");
  assert.equal(id(uni("a", "NL")), "studielink");
  assert.equal(id(uni("a", "FR")), "campus-france");
  assert.equal(id(uni("a", "IT")), "universitaly");
  for (const c of ["KR", "JP", "CN", "TR", "HU", "ZZ"]) assert.equal(id(uni("a", c)), "direct", c);
  assert.deepEqual(detectPlatform(uni("a", "KR")).alternatives, ["gks"]);
  assert.deepEqual(detectPlatform(uni("a", "TR")).alternatives, ["yos", "ytb"]);
  assert.deepEqual(detectPlatform(uni("a", "HU")).alternatives, ["stipendium-hungaricum"]);
  assert.equal(detectPlatform(uni("a", "ZZ")).reason.kind, "fallback");
});

test("Canada and Australia route by region", () => {
  assert.equal(id(uni("a", "CA", { city: "Toronto" })), "ouac");
  assert.equal(id(uni("a", "CA", { city: "Vancouver" })), "direct");
  assert.equal(id(uni("a", "AU", { city: "Sydney" })), "uac");
  assert.equal(id(uni("a", "AU", { city: "Melbourne" })), "vtac");
  assert.equal(id(uni("a", "AU", { city: "Perth" })), "direct");
});

test("a verified route outranks the country rule", () => {
  const d: PlatformData = { ...empty, routes: { x: { text: "Direct online application through the university portal.", source: null } } };
  const m = detectPlatform(uni("x", "DE"), d);
  assert.equal(m.platform.id, "direct");
  assert.equal(m.reason.kind, "verified");
  assert.equal(id(uni("x", "IT"), d), "universitaly");
  assert.equal(id(uni("y", "DE"), d), "uni-assist");
});

test("route sentences are read by first mention, VPD means uni-assist", () => {
  assert.equal(parseRouteText("OUAC; York direct application").primary, "ouac");
  assert.equal(parseRouteText("Direct VIBS portal; foreign credentials require a uni-assist VPD").primary, "uni-assist");
  assert.equal(parseRouteText("Nothing useful here").primary, null);
});

test("Common App members, UC and own portals", () => {
  const memberId = Object.keys(pd.common_app)[0];
  assert.equal(id(uni(memberId, "US"), pd), "common-app");
  assert.equal(detectPlatform(uni(memberId, "US"), pd).reason.kind, "member");
  assert.equal(id(uni("uc", "US", { name: "University of California, Berkeley" }), pd), "uc");
  const mit = detectPlatform(uni("m", "US", { website: "https://www.mit.edu/" }), pd);
  assert.equal(mit.platform.id, "direct");
  assert.equal(mit.portal, "MIT application");
  const tum = detectPlatform(uni("t", "DE", { website: "https://www.tum.de" }), pd);
  assert.equal(tum.platform.id, "uni-assist");
  assert.equal(tum.vpd, true);
});

test("universities on a shared platform share one application", () => {
  const list = [uni("a", "GB"), uni("b", "GB"), uni("c", "DE"), uni("d", "KR"), uni("e", "KR")];
  const groups = groupApplications(list, empty);
  assert.deepEqual(groups.map((g) => [g.key, g.universities.length]), [["ucas", 2], ["uni-assist", 1], ["direct:d", 1], ["direct:e", 1]]);
  assert.equal(applicationKey({ platform: groups[0].platform }, "a"), "ucas");
});

test("deadline: upcoming first, otherwise the last one", () => {
  const rows = [
    { title: "a", date: "2026-10-01", timezone: "", source: "", category: "" },
    { title: "b", date: "2027-01-15", timezone: "", source: "", category: "" },
  ];
  assert.deepEqual(nextDeadline(rows, "2026-11-14")?.row.title, "b");
  assert.equal(nextDeadline(rows, "2027-02-01")?.past, true);
  assert.equal(nextDeadline([], "2026-11-14"), null);
});

test("the bundled data file matches its published sources", () => {
  const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
  const built = buildPlatformData(read("data/published/common-app-members.json"), read("data/review/segment-admissions-nov14-merged.json"), [
    read("data/published/application-dates-current.json"),
    read("data/published/application-dates-segment-nov14.json"),
  ]);
  assert.deepEqual(built, pd);
});

const ctx = (kind: FormContext["kind"], platform: FormContext["platform"], extra: Partial<FormContext> = {}): FormContext => ({
  kind,
  platform,
  universities: [{ id: "u1", name: "One", country_code: "US" }, { id: "u2", name: "Two", country_code: "US" }],
  ...extra,
});

test("Common App structure and limits", () => {
  const s = sectionsFor(ctx("common-app", "common-app"));
  const common = s.filter((x) => x.tab === "common").map((x) => x.id);
  assert.deepEqual(common, ["personal", "address", "contact", "geography", "language", "fee_waiver", "household", "parent1", "parent2", "siblings", "school", "grades", "courses", "honors", "future", "testing", "activities", "responsibilities", "essay", "challenges", "additional"]);
  // My Colleges: questions, writing supplement (unless the college has none), recommenders and FERPA, per college.
  assert.deepEqual(s.filter((x) => x.groupName === "One").map((x) => x.id), ["c-u1-questions", "c-u1-writing", "c-u1-recommenders"]);
  assert.equal(s[s.length - 1].id, "review");
  const act = s.find((x) => x.id === "activities")!.repeat!;
  assert.equal(act.count, 10);
  assert.equal(act.fields.find((f) => f.id === "position")!.max, 50);
  assert.equal(act.fields.find((f) => f.id === "org")!.max, 100);
  assert.equal(act.fields.find((f) => f.id === "description")!.max, 150);
  assert.equal(s.find((x) => x.id === "honors")!.repeat!.count, 5);
  assert.equal(s.find((x) => x.id === "courses")!.repeat!.count, 15);
  const essay = s.find((x) => x.id === "essay")!.fields!;
  assert.equal(essay[0].options!.length, 7);
  assert.deepEqual([essay[1].min, essay[1].max, essay[1].unit], [250, 650, "words"]);
  assert.equal(s.find((x) => x.id === "additional")!.fields![1].max, 300);
  assert.equal(s.find((x) => x.id === "challenges")!.fields![1].max, 250);
});

test("Common App college sections follow each college's flags", () => {
  const flags = { u1: { essay: true, recs: true, fee: true, test_flexible: true, url: "" }, u2: { essay: false, recs: false, fee: false, test_flexible: true, url: "" } };
  const s = sectionsFor(ctx("common-app", "common-app", { commonApp: flags }));
  const field = (sec: string, f: string) => s.find((x) => x.id === sec)?.fields?.find((x) => x.id === f);
  assert.equal(field("c-u1-writing", "supplement")!.required, true);
  // The supplement is drafted in the writing desk as this college's own document.
  assert.equal(field("c-u1-writing", "supplement")!.writing, "why_us@u1");
  assert.equal(s.find((x) => x.id === "c-u2-writing"), undefined);
  assert.ok(field("c-u1-questions", "fee"));
  assert.equal(field("c-u2-questions", "fee"), undefined);
  assert.equal(field("c-u1-recommenders", "ferpa")!.required, true);
});

test("UCAS: Hub order, five choices, three answers, 350 minimum, 4,000 total", () => {
  const s = sectionsFor(ctx("ucas", "ucas"));
  assert.deepEqual(s.map((x) => x.id), ["personal", "contact", "nationality", "supporting", "finance", "education", "employment", "extra", "statement", "reference", "choices", "review"]);
  // Every section is marked complete by the student, as in the Hub.
  assert.ok(s.filter((x) => !x.review).every((x) => x.fields!.some((f) => f.id === "complete" && f.required)));
  assert.equal(s.find((x) => x.id === "choices")!.repeat!.count, 5);
  const st = s.find((x) => x.id === "statement")!;
  const qs = { ...st, fields: st.fields!.filter((f) => f.id !== "complete") };
  assert.equal(qs.fields.length, 3);
  assert.deepEqual(st.total, { max: 4000, unit: "chars", lines: 47 });
  assert.ok(qs.fields.every((f) => f.min === 350 && f.unit === "chars"));
  const long = "x".repeat(1400);
  const ok = { "statement.q1": long, "statement.q2": long, "statement.q3": long };
  assert.equal(validate([qs], ok).filter((i) => i.problem === "total").length, 1);
  const short = { "statement.q1": "x".repeat(349), "statement.q2": long, "statement.q3": long };
  assert.deepEqual(validate([qs], short).map((i) => i.problem), ["too_short"]);
  const fine = { "statement.q1": "x".repeat(350), "statement.q2": "x".repeat(1000), "statement.q3": "x".repeat(2650) };
  assert.deepEqual(validate([qs], fine), []);
});

test("UC: answer exactly four of eight personal insight questions, 350 words each", () => {
  const s = sectionsFor(ctx("direct", "uc"));
  const piq = s.find((x) => x.id === "piq")!;
  assert.equal(piq.fields!.length, 8);
  assert.ok(piq.fields!.every((f) => f.max === 350 && f.unit === "words"));
  const answer = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [valueKey("piq", "piq" + (i + 1)), "word ".repeat(100)]));
  assert.deepEqual(validate([piq], answer(3)).map((i) => i.problem), ["choose"]);
  assert.deepEqual(validate([piq], answer(4)), []);
  assert.deepEqual(validate([piq], answer(5)).map((i) => i.problem), ["choose"]);
  assert.equal(s.find((x) => x.id === "activities")!.repeat!.count, 20);
});

test("validation: required, email, limits, repeat items", () => {
  const s = sectionsFor(ctx("common-app", "common-app"));
  const issues = validate(s, {});
  assert.ok(issues.some((i) => i.field === "personal.first_name" && i.problem === "required"));
  assert.ok(issues.some((i) => i.section === "activities" && i.problem === "min_items"));
  const v = {
    "contact.email": "nope",
    [itemKey("activities", 0, "position")]: "p".repeat(51),
    [itemKey("activities", 0, "type")]: "art",
    [itemKey("activities", 0, "description")]: "d".repeat(151),
    "essay.essay": "word ".repeat(651),
  };
  const got = validate(s, v);
  assert.ok(got.some((i) => i.field === "contact.email" && i.problem === "email"));
  assert.ok(got.some((i) => i.field === itemKey("activities", 0, "position") && i.problem === "too_long" && i.n === 50));
  assert.ok(got.some((i) => i.field === itemKey("activities", 0, "description") && i.problem === "too_long" && i.n === 150));
  assert.ok(got.some((i) => i.field === "essay.essay" && i.problem === "too_long" && i.unit === "words"));
  assert.ok(!got.some((i) => i.section === "activities" && i.problem === "min_items"));
});

test("an unfilled optional item list is not an error; a half-filled item is", () => {
  const s = sectionsFor(ctx("common-app", "common-app")).filter((x) => x.id === "honors");
  assert.deepEqual(validate(s, {}), []);
  assert.deepEqual(validate(s, { [itemKey("honors", 0, "title")]: "Olympiad" }).map((i) => i.problem), ["incomplete_item"]);
});

test("uni-assist: wizard steps, uploads and per-university programmes", () => {
  const s = sectionsFor(ctx("europe", "uni-assist", { vpd: true }));
  assert.deepEqual(s.map((x) => x.id), ["personal", "education", "language", "programmes", "documents", "review"]);
  assert.ok(s.find((x) => x.id === "documents")!.fields!.every((f) => f.type === "file"));
  assert.equal(s.find((x) => x.id === "programmes")!.fields!.filter((f) => f.id.endsWith(".programme")).length, 2);
  assert.ok(sectionsFor(ctx("europe", "studielink")).some((x) => x.id === "motivation"));
});

test("every label a form shows exists in every language", async () => {
  const locales = await Promise.all(["en", "ru", "uz", "es", "de", "zh"].map((l) => import(`../lib/i18n/locales/${l}`).then((m) => m[l] as Record<string, string>)));
  const keys = new Set<string>();
  const platforms: [FormContext["kind"], FormContext["platform"]][] = [["common-app", "common-app"], ["ucas", "ucas"], ["europe", "uni-assist"], ["europe", "studielink"], ["europe", "campus-france"], ["direct", "uc"], ["direct", "direct"]];
  for (const [kind, platform] of platforms)
    for (const sec of sectionsFor(ctx(kind, platform, { vpd: true }))) {
      keys.add(sec.title);
      if (sec.intro) keys.add(sec.intro);
      if (sec.group) keys.add(sec.group);
      for (const f of [...(sec.fields || []), ...(sec.repeat?.fields || [])]) {
        keys.add(f.label);
        if (f.hint) keys.add(f.hint);
        if (f.heading) keys.add(f.heading);
        for (const o of f.options || []) if (o.label) keys.add(o.label);
      }
      if (sec.repeat) keys.add(sec.repeat.item);
    }
  for (const loc of locales) for (const k of keys) assert.ok(typeof loc[k] === "string" && loc[k], k);
});

test("progress rises as fields are filled and ends at 100%", () => {
  const s = sectionsFor(ctx("direct", "direct", { universities: [{ id: "u1", name: "One", country_code: "KR" }] }));
  assert.equal(overallProgress(s, {}, validate(s, {})).percent, 0);
  const values: Record<string, string | boolean> = {};
  for (const sec of s) for (const f of sec.fields || []) if (f.required) values[valueKey(sec.id, f.id)] = f.type === "check" ? true : f.type === "email" ? "a@b.co" : f.type === "essay" ? "word ".repeat(f.min || 5) : f.type === "date" ? (f.id === "dob" ? "2008-01-01" : "2026-01-01") : f.options ? f.options[0].value : "x";
  const issues = validate(s, values);
  assert.deepEqual(issues, []);
  assert.equal(overallProgress(s, values, issues).percent, 100);
  assert.equal(sectionProgress(s[0], values, issues).done, sectionProgress(s[0], values, issues).total);
});

test("UK universities fill empty UCAS choice slots once", () => {
  const unis = [{ id: "a", name: "A", country_code: "GB" }, { id: "b", name: "B", country_code: "GB" }];
  const v = seedChoices({}, unis);
  assert.equal(v[itemKey("choices", 0, "uni")], "a");
  assert.equal(v[itemKey("choices", 1, "uni")], "b");
  assert.deepEqual(seedChoices(v, unis), v);
});
