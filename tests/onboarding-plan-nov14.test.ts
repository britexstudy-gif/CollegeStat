import { test } from "node:test";
import assert from "node:assert/strict";
import type { University } from "../lib/domain";
import type { Scholarship } from "../lib/scholarships-data";
import { baseTier, buildPlan, matchScholarships, pickUniversities } from "../components/college/onboarding-plan";
import { answersFrom, preferencesFrom, type Answers } from "../components/college/onboarding-steps";

const uni = (id: string, country: string, o: { rate?: number; rank?: number; tuition?: number; ielts?: number; deadline?: string }): University =>
  ({
    id,
    slug: id,
    name: "Uni " + id,
    country_code: country,
    city: "City",
    data_points: [],
    imported_records: [],
    ranking_entries: [],
    university_programs: [],
    rankings: o.rank ? [{ provider: "qs", rank: o.rank }] : [],
    admissions: o.rate != null ? [{ id: id + "a", year: 2025, program_id: null, acceptance_rate: o.rate }] : [],
    costs: o.tuition
      ? [{ id: id + "c", year: 2025, program_id: null, category: "tuition", period: "year", student_category: "international", amount: o.tuition, currency: "USD" }]
      : [],
    requirements: o.ielts ? [{ id: id + "r", year: 2025, kind: "IELTS", minimum: o.ielts, program_id: null }] : [],
    deadlines: o.deadline ? [{ title: "Regular deadline", due_date: o.deadline }] : [],
  }) as unknown as University;

const answers = (patch: Partial<Answers> = {}): Answers => ({
  name: "Aziza",
  home_country: "UZ",
  home_city: "",
  school_name: "",
  subjects: [],
  grade: "",
  exam_score: "",
  tests: [],
  countries: ["DE", "GB"],
  priorities: [],
  english_score: "",
  english_date: "",
  sat_score: "",
  sat_date: "",
  activities: [],
  activity_list: [],
  honours: [],
  languages: [],
  support: [],
  ...patch,
});

const scholarship = (slug: string, o: Partial<Scholarship>): Scholarship =>
  ({ slug, name: slug, provider: null, funding: "full", country: null, level: "Bachelor", openToAll: false, eligibleCodes: ["UZ"], deadline: null, ...o }) as Scholarship;

const catalogue = [
  uni("a", "GB", { rate: 8, rank: 4, tuition: 40000, ielts: 7.5 }),
  uni("b", "DE", { rate: 40, rank: 120, tuition: 500, ielts: 6.5, deadline: "2099-01-15" }),
  uni("c", "DE", { rate: 80, rank: 900, tuition: 300, ielts: 6 }),
  uni("d", "GB", { rate: 85, rank: 700, tuition: 15000, ielts: 6 }),
  uni("e", "GB", {}),
];

test("tiers follow admission rate first, then rank; unknown stays out", () => {
  assert.equal(baseTier(catalogue[0]), "reach");
  assert.equal(baseTier(catalogue[1]), "match");
  assert.equal(baseTier(catalogue[2]), "safety");
  assert.equal(baseTier(catalogue[4]), null);
  assert.equal(baseTier(uni("r", "US", { rank: 50 })), "reach");
});

test("reach, match and safety lists cover the student's countries and respect the budget", () => {
  const picks = pickUniversities(catalogue, answers({ budget: 20000, priorities: ["cost"] }));
  assert.deepEqual(picks.map((p) => p.tier), ["reach", "match", "safety", "safety"]);
  assert.equal(picks.find((p) => p.id === "a")?.within_budget, false);
  assert.equal(picks.find((p) => p.id === "b")?.within_budget, true);
  // Safeties: the cheaper German university first because cost is a priority.
  assert.equal(picks.filter((p) => p.tier === "safety")[0].id, "c");
  assert.ok(!picks.some((p) => p.id === "e"));
});

test("a taken English test below a minimum moves that university up a tier", () => {
  const a = answers({ english_status: "taken", english_test: "ielts", english_score: "6.0" });
  const picks = pickUniversities(catalogue, a);
  assert.equal(picks.find((p) => p.id === "b")?.meets_english, false);
  assert.equal(picks.find((p) => p.id === "b")?.tier, "reach");
  assert.equal(picks.find((p) => p.id === "d")?.meets_english, true);
  assert.equal(picks.find((p) => p.id === "d")?.tier, "safety");
});

test("the plan has tests, a dated timeline and scholarships for Central Asia", () => {
  const a = answers({ english_status: "planned", english_test: "ielts", english_score: "7", english_date: "2099-03", sat_status: "no" });
  const picks = pickUniversities(catalogue, a);
  const plan = buildPlan(
    a,
    picks,
    catalogue,
    [
      scholarship("de-full", { country: "DE", deadline: "2099-06-01" }),
      scholarship("kz-only", { eligibleCodes: ["KZ"] }),
      scholarship("old", { deadline: "2001-01-01" }),
      scholarship("master", { level: "Master" }),
      scholarship("world", { openToAll: true, eligibleCodes: [], funding: "partial" }),
    ],
    new Date("2026-11-14T00:00:00Z"),
  );
  assert.equal(plan.version, 1);
  assert.deepEqual(plan.scholarships.map((s) => s.slug), ["de-full", "world"]);
  const english = plan.tests.find((t) => t.kind === "english");
  assert.ok(english && english.kind === "english");
  assert.equal(english.target, 7);
  assert.equal(english.highest_min?.minimum, 7.5);
  assert.deepEqual(plan.timeline.map((e) => e.date), ["2099-01-15", "2099-03", "2099-06-01"]);
  assert.deepEqual(plan.timeline.map((e) => e.kind), ["deadline", "english", "scholarship"]);
  const sat = plan.tests.find((t) => t.kind === "sat");
  assert.ok(sat && sat.kind === "sat" && sat.status === "no" && !sat.us);
});

test("matchScholarships honours the home country outside the five first countries", () => {
  const list = [scholarship("uz", {}), scholarship("tr", { eligibleCodes: ["TR"] })];
  assert.deepEqual(matchScholarships(list, answers({ home_country: "TR" }), "2026-11-14").map((s) => s.slug), ["tr"]);
});

test("answers round-trip through profile preferences without a schema change", () => {
  const a = answers({
    school_type: "presidential",
    certificate: "ib",
    graduation_year: 2027,
    grade_scale: "ib",
    grade: "38",
    subjects: ["Computer Science"],
    budget: 25000,
    funding: "partial",
    english_status: "taken",
    english_test: "ielts",
    english_score: "7.5",
    sat_status: "planned",
    sat_test: "sat",
    sat_score: "1450",
    activities: ["coding"],
    start_year: 2027,
    apply_count: "4-7",
    interface_lang: "ru",
  });
  const prefs = preferencesFrom(a, { countries: [] }, true, new Date("2026-11-14T00:00:00Z"));
  assert.equal(prefs.intake?.completed_at, "2026-11-14T00:00:00.000Z");
  assert.equal(prefs.intake?.english_score, 7.5);
  assert.equal(prefs.field, "Computer Science");
  const back = answersFrom(prefs, "Aziza");
  assert.equal(back.certificate, "ib");
  assert.equal(back.grade, "38");
  assert.equal(back.sat_score, "1450");
  assert.equal(back.english_score, "7.5");
  assert.deepEqual(back.subjects, ["Computer Science"]);
  assert.equal(back.interface_lang, "ru");
});
