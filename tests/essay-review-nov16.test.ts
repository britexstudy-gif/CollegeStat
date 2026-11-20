import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorComments, bandFor, essayReview, findQuote, fitEssayReview, REVIEW_CRITERIA } from "../lib/essay-review";
import { handleEssayReview } from "../server/essay-review-handler";
import { universityEssays, docType, docUniversity } from "../lib/university-essays";
import { prefillValues } from "../components/college/application-practice/prefill";
import { sectionsFor } from "../components/college/application-practice/forms";

const essay = "The first time my grandmother let me stir the plov, I was eleven.\n\nShe gave me a rule: never  stir the rice once the water is gone. That silence taught me more than any lecture.";

test("quotes are found exactly, then ignoring case, curly quotes and spaces", () => {
  const exact = findQuote(essay, "That silence taught me");
  assert.equal(essay.slice(exact!.start, exact!.end), "That silence taught me");
  const loose = findQuote(essay, "Never stir the rice");
  assert.equal(essay.slice(loose!.start, loose!.end), "never  stir the rice");
  assert.equal(findQuote(essay, "a sentence that is not there"), null);
  const anchored = anchorComments(essay, [{ quote: "That silence" }, { quote: "gone missing" }, { quote: "The first time" }]);
  assert.deepEqual(anchored.map((c) => c.index), [2, 0, 1]);
});

test("provider replies are shaped: fixed criteria, computed score, only real quotes", () => {
  const raw = {
    summary: "Good start.",
    prompt_fit: "",
    criteria: [
      { id: "voice", score: 9, note: "Yours." },
      { id: "story", score: 7.6, note: "Clear moment." },
      { id: "nonsense", score: 3, note: "x" },
    ],
    comments: [
      { quote: "“That silence taught me more than any lecture.”", criterion: "voice", kind: "question", comment: "What did it teach?" },
      { quote: "invented sentence", criterion: "story", kind: "fix", comment: "x" },
      { quote: "never stir the rice", criterion: "odd", kind: "odd", comment: "Strong rule." },
    ],
    officer: "They would remember the plov.",
    strengths: ["a", "b", "c", "d"],
    next_revision: { focus: "Ending", steps: [] },
    extra: "dropped",
  };
  const review = essayReview.parse(fitEssayReview(raw, essay));
  assert.deepEqual(review.criteria.map((c) => c.id), [...REVIEW_CRITERIA]);
  assert.equal(review.criteria.find((c) => c.id === "story")!.score, 8);
  assert.equal(review.criteria.find((c) => c.id === "clarity")!.score, 5);
  assert.equal(review.score, Math.round((8 + 5 + 5 + 9 + 5 + 5) / 6));
  assert.equal(review.band, bandFor(review.score));
  assert.deepEqual(review.comments.map((c) => c.quote), ["That silence taught me more than any lecture.", "never stir the rice"]);
  assert.equal(review.comments[1].kind, "suggestion");
  assert.equal(review.strengths.length, 3);
  assert.equal(review.next_revision.steps.length, 1);
});

const reply = { summary: "ok", prompt_fit: "", criteria: [], comments: [], officer: "fine", strengths: [], next_revision: { focus: "f", steps: ["s"] } };
const deps = (over: Partial<Parameters<typeof handleEssayReview>[1]> = {}) => ({
  sameOrigin: () => true,
  authenticate: async () => ({ owner: "u", consumeLimit: async () => true }),
  configured: () => true,
  generate: async () => reply as unknown,
  ...over,
});
const req = (body: unknown) => new Request("https://collegestat.test/api/essay-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const body = { text: essay + " ".repeat(2) + "More words to pass the minimum length here.", essay_type: "Common App essay", consent: true };

test("the review route checks sign-in, input and quota before calling the AI", async () => {
  let called = 0;
  const generate = async () => {
    called++;
    return reply as unknown;
  };
  assert.equal((await handleEssayReview(req(body), deps({ authenticate: async () => null, generate }))).status, 401);
  assert.equal((await handleEssayReview(req({ ...body, text: "short" }), deps({ generate }))).status, 400);
  assert.equal((await handleEssayReview(req({ ...body, consent: false }), deps({ generate }))).status, 400);
  assert.equal((await handleEssayReview(req(body), deps({ authenticate: async () => ({ owner: "u", consumeLimit: async () => false }), generate }))).status, 429);
  assert.equal(called, 0);
  const ok = await handleEssayReview(req(body), deps({ generate }));
  assert.equal(ok.status, 200);
  const json = (await ok.json()) as { review: { score: number; criteria: unknown[] } };
  assert.equal(json.review.criteria.length, 6);
  assert.equal(called, 1);
});

test("university essays follow the detected platform", () => {
  const us = universityEssays({ id: "d1", name: "Dartmouth", country_code: "US" }, { generated_from: [], routes: {}, dates: {}, common_app: { d1: { essay: true, recs: true, fee: true, test_flexible: true, url: "" } } });
  assert.deepEqual(us.essays.map((e) => e.doc), ["common_app", "activities", "why_us@d1"]);
  assert.equal(us.essays[2].required, true);
  assert.deepEqual(universityEssays({ id: "o", name: "Oxford", country_code: "GB" }).essays.map((e) => e.doc), ["ucas"]);
  assert.deepEqual(universityEssays({ id: "t", name: "TUM", country_code: "DE" }).essays.map((e) => e.doc), ["motivation@t"]);
  assert.equal(docType("why_us@d1"), "why_us");
  assert.equal(docUniversity("why_us@d1"), "d1");
  assert.equal(docUniversity("ucas"), "");
});

test("practice forms are prefilled from the profile without overwriting edits", () => {
  const sections = sectionsFor({ kind: "common-app", platform: "common-app", universities: [{ id: "u1", name: "One", country_code: "US" }] });
  const add = prefillValues(
    sections,
    {
      name: "Aziza Karimova",
      email: "a@example.com",
      country: "Uzbekistan",
      school: "Presidential School",
      certificate: "ib",
      grade: "38",
      gradeMax: 45,
      sat: "1450",
      english: { test: "ielts", score: "7.5" },
      activities: [{ type: "coding", role: "Founder", org: "Code club", hours: "5", weeks: "30", grades: ["10", "11"], description: "Taught 20 students Python." }],
      honours: [{ title: "National olympiad, chemistry", level: "region", grade: "11" }],
    },
    { "personal.first_name": "Azi" },
  );
  assert.equal(add["personal.first_name"], undefined);
  assert.equal(add["personal.last_name"], "Karimova");
  assert.equal(add["school.curriculum"], "ib");
  assert.equal(add["grades.gpa_scale"], "45");
  assert.equal(add["testing.sat_total"], "1450");
  assert.equal(add["testing.report_scores"], "yes");
  assert.equal(add["testing.english_test"], "ielts");
  assert.equal(add["activities.0.type"], "stem");
  assert.equal(add["activities.0.grades"], "10, 11");
  assert.equal(add["honors.0.level"], "regional");
  assert.ok(!Object.keys(add).some((k) => k.startsWith("c-")));
});

test("practice forms reject impossible dates", async () => {
  const { validate, sectionsFor: forms } = await import("../components/college/application-practice/forms");
  const s = forms({ kind: "ucas", platform: "ucas", universities: [] });
  const problems = (v: Record<string, string>) => validate(s, v).filter((i) => i.problem === "date" || i.problem === "date_order").map((i) => i.field);
  assert.deepEqual(problems({ "personal.dob": "2030-01-01" }), ["personal.dob"]);
  assert.deepEqual(problems({ "personal.dob": "2008-05-01" }), []);
  assert.deepEqual(problems({ "education.school_from": "2020-09-01", "education.school_to": "2019-06-01" }), ["education.school_to"]);
  assert.deepEqual(problems({ "employment.0.job_from": "2025-01-01", "employment.0.job_to": "2024-01-01" }), ["employment.0.job_to"]);
});
