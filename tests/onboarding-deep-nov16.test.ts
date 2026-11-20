import { test } from "node:test";
import assert from "node:assert/strict";
import type { University } from "../lib/domain";
import {
  LEGACY_SUBJECTS,
  PROGRAMMES,
  PROGRAMME_GROUPS,
  normalizeSubjects,
  programme,
  programmeKey,
  groupKey,
  programmeTerm,
  searchProgrammes,
  suggestGroups,
} from "../lib/programmes";
import { SUBJECTS, answersFrom, derivePriorities, preferencesFrom, syncTests, type Answers } from "../components/college/onboarding-steps";
import { answersStrength, pickUniversities, tailoredNotes } from "../components/college/onboarding-plan";
import { chanceFor, profileStrength } from "../lib/admission-chance";
import { chanceProfile, snapshotFrom } from "../lib/student-profile";
import { personalizeInput, personalizeRequest } from "../lib/personalize-ai";
import { en } from "../lib/i18n/locales/en";

const NOW = new Date("2026-11-16T00:00:00Z");
const base = (patch: Partial<Answers> = {}): Answers => ({
  ...answersFrom({ countries: [] }, "Aziza"),
  home_country: "UZ",
  countries: ["GB", "DE"],
  ...patch,
});
const roundTrip = (a: Answers) => answersFrom(preferencesFrom(a, { countries: [] }, true, NOW), "Aziza");

test("programme taxonomy: 12 groups, ~80 unique programmes, every one translated", () => {
  assert.equal(PROGRAMME_GROUPS.length, 12);
  assert.ok(PROGRAMMES.length >= 80, `only ${PROGRAMMES.length}`);
  assert.equal(new Set(PROGRAMMES.map((x) => x.id)).size, PROGRAMMES.length);
  assert.equal(new Set(PROGRAMMES.map((x) => x.label.toLowerCase())).size, PROGRAMMES.length);
  for (const g of PROGRAMME_GROUPS) assert.ok(PROGRAMMES.some((x) => x.group === g), g);
  const keys = en as Record<string, string>;
  for (const x of PROGRAMMES) assert.ok(keys[programmeKey(x)], programmeKey(x));
  for (const g of PROGRAMME_GROUPS) assert.ok(keys[groupKey(g)], groupKey(g));
});

test("every one of the 15 older subjects still resolves, and saved profiles keep working", () => {
  for (const old of SUBJECTS) assert.ok(programme(old), old);
  assert.equal(programme("Business")?.label, LEGACY_SUBJECTS.Business);
  assert.deepEqual(normalizeSubjects(["Business", "computer science", "Astrology", "Business Administration", "Law", "Physics"]), [
    "Business Administration",
    "Computer Science",
    "Law",
  ]);
  // Old details.subjects
  const a = answersFrom({ countries: [], intake: { details: { subjects: ["Business", "Design"] } } } as never, null);
  assert.deepEqual(a.subjects, ["Business Administration", "Design"]);
  // Very old: only preferences.field
  assert.deepEqual(answersFrom({ countries: [], field: "Business" } as never, null).subjects, ["Business Administration"]);
  assert.deepEqual(answersFrom({ countries: [], field: "Underwater basket weaving" } as never, null).subjects, []);
});

test("preferences.field stays an explorer search word for the first choice", () => {
  assert.equal(programmeTerm("Business Administration"), "Business");
  assert.equal(programmeTerm("Medicine"), "Medicine");
  const prefs = preferencesFrom(base({ subjects: ["Logistics and Supply Chain", "Finance"] }), { countries: [] }, false, NOW);
  assert.equal(prefs.field, "Logistics");
  assert.deepEqual((prefs.intake as { details: { subjects: string[] } }).details.subjects, ["Logistics and Supply Chain", "Finance"]);
});

test("search and 'help me choose' point to the right groups", () => {
  const ids = searchProgrammes("engin", (x) => x.label).map((x) => x.id);
  assert.ok(ids.includes("mech") && ids.includes("se") && ids.includes("civil"));
  assert.deepEqual(searchProgrammes("", (x) => x.label, "economics").map((x) => x.id), ["econ", "econometrics", "econfin"]);
  // Translated labels are searchable too.
  assert.deepEqual(searchProgrammes("стомат", (x) => (x.id === "dentistry" ? "Стоматология" : x.label)).map((x) => x.id), ["dentistry"]);
  assert.equal(suggestGroups({ enjoy: "build", subject: "physics", day: "site" })[0], "engineering");
  assert.equal(suggestGroups({ enjoy: "people", subject: "biochem", day: "lab" })[0], "health");
  assert.deepEqual(suggestGroups({}), []);
});

test("deeper answers round-trip through preferences.intake.details", () => {
  const a = base({
    class_rank: "top5",
    strong_subjects: ["maths", "physics"],
    research: "research",
    activity_depth: { leadership: { years: "3", hours: "high" }, sport: { years: "0" } },
    interests: { enjoy: "build" },
    career: "tech",
    work_after: "must",
    return_home: "maybe",
    study_langs: ["english", "german"],
    foundation: "yes",
    city_size: "big",
    climate: "any",
    setting: "campus",
    safety: "high",
    distance: "near",
    halal: "medium",
    rank_vs_cost: 75,
    funding: "partial",
    budget: 15000,
    loan: "maybe",
    intake_term: "fall",
    app_hours: "3to6",
    helpers: ["parents", "counsellor"],
    honours: [{ title: "IMO", level: "international", grade: "", medal: "bronze" }],
  });
  const back = roundTrip(a);
  for (const k of ["class_rank", "research", "career", "work_after", "return_home", "foundation", "city_size", "climate", "setting", "safety", "distance", "halal", "rank_vs_cost", "loan", "intake_term", "app_hours"] as const)
    assert.equal(back[k], a[k], k);
  assert.deepEqual(back.strong_subjects, ["maths", "physics"]);
  assert.deepEqual(back.activity_depth, { leadership: { years: "3", hours: "high" }, sport: { years: "0" } });
  assert.deepEqual(back.study_langs, ["english", "german"]);
  assert.deepEqual(back.helpers, ["parents", "counsellor"]);
  assert.deepEqual(back.interests, { enjoy: "build" });
  assert.equal(back.honours[0].medal, "bronze");
  assert.equal(back.budget, 15000);
});

test("unanswered or invalid deep values are not saved", () => {
  const prefs = preferencesFrom(
    base({ class_rank: "top0" as never, study_langs: ["klingon"], rank_vs_cost: undefined, activity_depth: { work: { years: "9" as never } } }),
    { countries: [] },
    false,
    NOW,
  );
  const d = (prefs.intake as { details: Record<string, unknown> }).details;
  for (const k of ["class_rank", "study_langs", "rank_vs_cost", "activity_depth", "helpers", "exam_date"]) assert.ok(!(k in d), k);
});

test("tests: declined core tests, and a planned national exam is a target, not a result", () => {
  const a = syncTests(base({ home_country: "KZ", tests: [{ id: "ielts", status: "taken", score: "7", date: "2026-09" }], tests_declined: ["sat", "ielts"], exam_status: "planned", exam_score: "120", exam_date: "2027-06" }));
  const prefs = preferencesFrom(a, { countries: [] }, false, NOW);
  const d = (prefs.intake as { details: Record<string, unknown> }).details;
  assert.deepEqual(d.tests_declined, ["sat"]);
  assert.equal(d.exam, undefined);
  assert.equal(d.exam_target, "120");
  assert.equal(d.exam_date, "2027-06");
  const back = answersFrom(prefs, null);
  assert.equal(back.exam_score, "120");
  assert.equal(back.exam_status, "planned");
  assert.equal(snapshotFrom(prefs).exam, undefined);
});

test("priorities come from the cost/ranking slider, funding, safety and distance", () => {
  assert.deepEqual(derivePriorities(base({ rank_vs_cost: 100, funding: "full", safety: "high", distance: "near" })), ["ranking", "scholarships", "safety"]);
  assert.deepEqual(derivePriorities(base({ rank_vs_cost: 0 })), ["cost"]);
  assert.deepEqual(derivePriorities(base({ rank_vs_cost: 50, priorities: ["language"] })), ["language"]);
});

test("profile strength reads olympiads, rank, scores, research and activity depth", () => {
  assert.equal(profileStrength({}), null);
  const strong = profileStrength({ gradePct: 96, classRank: "top1", honours: [{ level: "national", medal: "gold" }], sat: 1500 });
  assert.equal(strong?.level, "strong");
  assert.ok(strong?.reasons.includes("olympiad"));
  assert.equal(profileStrength({ gradePct: 90, depth: [{ years: "3", hours: "high" }], research: "research" })?.level, "solid");
  assert.equal(profileStrength({ gradePct: 80 })?.level, "building");
  // Taking part is not a medal.
  assert.ok((profileStrength({ honours: [{ level: "international", medal: "participant" }] })?.points ?? 0) < (profileStrength({ honours: [{ level: "international", medal: "gold" }] })?.points ?? 0));
});

const uni = (slug: string, o: { rate?: number; sat?: [number, number]; ielts?: number; tuition?: number; country?: string }): University =>
  ({
    id: slug,
    slug,
    name: "Uni " + slug,
    country_code: o.country ?? "GB",
    city: null,
    rankings: [],
    imported_records: [],
    data_points: [],
    admissions: o.rate != null ? [{ id: "a", year: 2025, program_id: null, acceptance_rate: o.rate, sat_min: o.sat?.[0] ?? null, sat_max: o.sat?.[1] ?? null }] : [],
    costs: o.tuition ? [{ id: "c", year: 2025, program_id: null, category: "tuition", period: "year", student_category: "international", amount: o.tuition, currency: "USD" }] : [],
    requirements: o.ielts ? [{ id: "r", year: 2025, kind: "IELTS", minimum: o.ielts, program_id: null }] : [],
  }) as unknown as University;

test("strength nudges rate-only chances one step, never past score evidence", () => {
  assert.equal(chanceFor({ strength: "strong" }, uni("a", { rate: 30 })).category, "target");
  assert.equal(chanceFor({}, uni("a", { rate: 30 })).category, "target");
  assert.equal(chanceFor({ strength: "strong" }, uni("b", { rate: 22 })).category, "target");
  assert.equal(chanceFor({}, uni("b", { rate: 22 })).category, "reach");
  assert.equal(chanceFor({ strength: "strong" }, uni("c", { rate: 10 })).category, "reach");
  assert.equal(chanceFor({ strength: "strong", sat: 1200 }, uni("d", { rate: 40, sat: [1300, 1450] })).category, "reach");
  assert.equal(chanceFor({ strength: "strong", ielts: 6 }, uni("e", { rate: 50, ielts: 6.5 })).category, "reach");
  assert.equal(chanceFor({ strength: "building" }, uni("f", { rate: 65 })).category, "target");
  assert.equal(chanceFor({ strength: "building" }, uni("g", { rate: 85 })).category, "likely");
});

test("the snapshot carries context and strength to chips and the AI request", () => {
  const prefs = preferencesFrom(
    base({
      grade_scale: "five",
      grade: "4.9",
      class_rank: "top1",
      honours: [{ title: "National physics olympiad", level: "national", grade: "", medal: "gold" }],
      tests: [{ id: "sat", status: "taken", score: "1480", date: "2026-10" }],
      career: "research",
      rank_vs_cost: 25,
      helpers: ["alone"],
    }),
    { countries: [] },
    true,
    NOW,
  );
  const snap = snapshotFrom(prefs);
  assert.equal(snap.context?.class_rank, "top1");
  assert.equal(snap.context?.career, "research");
  assert.equal(chanceProfile(snap).strength, "strong");
  const parsed = personalizeInput.safeParse(personalizeRequest(snap, "en"));
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  const bad = personalizeInput.safeParse({ language: "en", profile: { ...snap, context: { career: "astronaut" } } });
  assert.equal(bad.success, false);
});

test("budget: family-only funding without a loan leaves over-budget universities out", () => {
  const pool = [
    uni("pricey1", { rate: 70, tuition: 40000, country: "GB" }),
    uni("pricey2", { rate: 72, tuition: 45000, country: "GB" }),
    uni("cheap1", { rate: 80, tuition: 3000, country: "DE" }),
    uni("cheap2", { rate: 75, tuition: 2000, country: "DE" }),
    uni("cheap3", { rate: 90, tuition: 5000, country: "DE" }),
  ];
  const hard = pickUniversities(pool, base({ funding: "family", loan: "no", budget: 10000 }));
  assert.ok(!hard.some((p) => p.within_budget === false), JSON.stringify(hard.map((p) => p.id)));
  const loan = pickUniversities(pool, base({ funding: "family", loan: "yes", budget: 10000 }));
  assert.ok(loan.some((p) => p.within_budget === false));
  // Not enough affordable ones: keep them, flagged.
  const few = pickUniversities(pool.slice(0, 3), base({ funding: "family", loan: "no", budget: 10000 }));
  assert.ok(few.some((p) => p.within_budget === false));
});

test("tailored notes reflect goals, money and timeline", () => {
  const a = base({
    subjects: ["Computer Science"],
    funding: "family",
    loan: "no",
    budget: 15000,
    return_home: "yes",
    work_after: "must",
    study_langs: ["english", "german"],
    app_hours: "lt3",
  });
  const ids = tailoredNotes(a, []).map((n) => n.id);
  assert.deepEqual(ids.slice(0, 1), ["first"]);
  for (const id of ["budget", "work", "home", "lang", "time"] as const) assert.ok(ids.includes(id), id);
  assert.equal(tailoredNotes(a, []).find((n) => n.id === "home")?.vars?.name, "El-Yurt Umidi");
  assert.equal(tailoredNotes(a, []).find((n) => n.id === "lang")?.vars?.langs, "german");
  assert.equal(answersStrength(base()), null);
  // Every note id has a message.
  const keys = en as Record<string, string>;
  for (const id of ["first", "strong", "solid", "building", "budget", "aid", "loan", "work", "home", "foundation", "lang", "time"]) assert.ok(keys["obd.tl." + id], id);
});
