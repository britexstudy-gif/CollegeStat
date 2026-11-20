import { test } from "node:test";
import assert from "node:assert/strict";
import type { University } from "../lib/domain";
import { answersFrom, preferencesFrom, syncActivities, syncTests, type Answers } from "../components/college/onboarding-steps";
import { chanceFor } from "../lib/admission-chance";
import { chanceProfile, snapshotFrom } from "../lib/student-profile";
import { handlePersonalize } from "../server/personalize-handler";
import { readPersonalization } from "../lib/personalize-ai";

const base = (patch: Partial<Answers> = {}): Answers => ({
  ...answersFrom({ countries: [] }, "Aziza"),
  home_country: "KZ",
  countries: ["GB", "DE"],
  ...patch,
});

test("tests list drives the older English/SAT fields", () => {
  const a = syncTests(
    base({
      tests: [
        { id: "ielts", status: "planned", score: "7", date: "2027-02" },
        { id: "toefl", status: "taken", score: "98", date: "2026-05" },
        { id: "sat", status: "taken", score: "1450", date: "2026-10" },
      ],
    }),
  );
  assert.equal(a.english_status, "taken");
  assert.equal(a.english_test, "toefl");
  assert.equal(a.sat_score, "1450");
  const cleared = syncTests({ ...a, tests: [] });
  assert.equal(cleared.english_status, undefined);
  assert.equal(cleared.sat_status, undefined);
});

test("grades, exam, tests, activities and honours round-trip through preferences", () => {
  const a = syncActivities(
    syncTests(
      base({
        grade_scale: "five",
        grade: "4.6",
        exam_score: "118",
        school_name: "NIS Almaty",
        school_class: "11",
        tests: [{ id: "ielts", status: "taken", score: "7.0", date: "2026-09" }],
        activity_list: [{ type: "coding", role: "Founder", org: "Code club", hours: "6", weeks: "30", grades: ["10", "11"], description: "Taught Python." }],
        honours: [{ title: "Silver, national physics olympiad", level: "national", grade: "" }],
      }),
    ),
  );
  const prefs = preferencesFrom(a, { countries: [] }, true, new Date("2026-11-15T00:00:00Z"));
  const d = (prefs.intake as { details: Record<string, unknown> }).details;
  assert.deepEqual(d.grade_norm, { pct: 89, gpa: 3.6 });
  assert.deepEqual(d.exam, { id: "unt", score: "118" });
  assert.deepEqual(d.activities, ["olympiad_national", "coding"]);
  assert.equal(prefs.intake?.english_score, 7);
  const back = answersFrom(prefs, "Aziza");
  assert.equal(back.tests[0].score, "7");
  assert.equal(back.activity_list[0].role, "Founder");
  assert.equal(back.honours[0].level, "national");
  assert.equal(back.school_class, "11");
  const snap = snapshotFrom(prefs);
  assert.equal(snap.exam?.pct, 84);
  assert.equal(chanceProfile(snap).ielts, 7);
});

test("older profiles turn into list entries", () => {
  const a = answersFrom(
    {
      countries: [],
      intake: {
        english_test: "ielts",
        english_score: 6.5,
        details: { activities: ["debate", "olympiad_international"], activities_note: "Robotics team", english_status: "taken" },
      },
    } as never,
    null,
  );
  assert.deepEqual(a.tests.map((t) => [t.id, t.status, t.score]), [["ielts", "taken", "6.5"]]);
  assert.deepEqual(a.activity_list.map((x) => x.type), ["debate", "other"]);
  assert.equal(a.honours[0].level, "international");
});

const uni = (slug: string, o: { rate?: number; sat?: [number, number]; ielts?: number; tuition?: number }): University =>
  ({
    id: slug,
    slug,
    name: "Uni " + slug,
    country_code: "GB",
    city: null,
    rankings: [],
    imported_records: [],
    data_points: [],
    admissions: o.rate != null ? [{ id: "a", year: 2025, program_id: null, acceptance_rate: o.rate, sat_min: o.sat?.[0] ?? null, sat_max: o.sat?.[1] ?? null }] : [],
    costs: o.tuition ? [{ id: "c", year: 2025, program_id: null, category: "tuition", period: "year", student_category: "international", amount: o.tuition, currency: "USD" }] : [],
    requirements: o.ielts ? [{ id: "r", year: 2025, kind: "IELTS", minimum: o.ielts, program_id: null }] : [],
  }) as unknown as University;

test("chips reuse the admissions-check categories, plus English minimum and budget", () => {
  assert.equal(chanceFor({}, uni("a", { rate: 8 })).category, "reach");
  assert.equal(chanceFor({ sat: 1500 }, uni("b", { rate: 70, sat: [1200, 1400] })).category, "likely");
  assert.equal(chanceFor({}, uni("c", {})).category, "unknown");
  const c = chanceFor({ ielts: 6, budget: 10000 }, uni("d", { rate: 75, ielts: 6.5, tuition: 20000 }));
  assert.equal(c.category, "reach");
  assert.equal(c.english?.meets, false);
  assert.equal(c.overBudget, true);
});

test("personalize keeps only catalogue slugs and dated future actions", async () => {
  const pool = [uni("oxford", { rate: 15 }), uni("leeds", { rate: 70 }), uni("tum", { rate: 40 })];
  let quota = 0;
  const req = (body: unknown) =>
    new Request("http://x/api/student-ai/personalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const deps = {
    sameOrigin: () => true,
    authenticate: async () => ({ owner: "u", consumeLimit: async () => ++quota <= 1 }),
    configured: () => true,
    candidates: async () => pool,
    now: () => new Date("2026-11-15T00:00:00Z"),
    generate: async () => ({
      summary: "Strong maths, English to finish.",
      country_mix: [{ country: "GB", share: 60, reason: "r" }, { country: "DE", share: 40, reason: "r" }],
      universities: [
        { slug: "oxford", tier: "reach", reason: "x" },
        { slug: "made-up", tier: "target", reason: "x" },
        { slug: "leeds", tier: "reach", reason: "x" },
      ],
      gaps: ["IELTS 6.5 → 7.0 for UK targets"],
      actions: [
        { title: "Old", detail: "", due: "2020-01-01" },
        { title: "Book IELTS", detail: "", due: "2026-12-01" },
      ],
      extra: true,
    }),
  };
  const profile = snapshotFrom({ countries: ["GB", "DE"] });
  const res = await handlePersonalize(req({ profile, language: "en" }), deps);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { universities: { slug: string; tier: string }[]; actions: { title: string }[] };
  assert.deepEqual(body.universities.map((u: { slug: string }) => u.slug), ["oxford", "leeds"]);
  // Our own estimate wins: Leeds at 70% is likely, so safety.
  assert.equal(body.universities[1].tier, "safety");
  assert.deepEqual(body.actions.map((a: { title: string }) => a.title), ["Book IELTS"]);
  assert.ok(readPersonalization({ ai_personalize: body }));
  // The shared AI quota applies.
  assert.equal((await handlePersonalize(req({ profile, language: "en" }), deps)).status, 429);
  // A name or email field is rejected outright.
  assert.equal((await handlePersonalize(req({ profile: { ...profile, name: "A" }, language: "en" }), deps)).status, 400);
});
