import { test } from "node:test";
import assert from "node:assert/strict";
import {
  certificateCategories,
  certificateCategory,
  certificatePracticeHref,
  certificateRecords,
  certificateReferences,
  certificateViewHref,
  originalCertificatePractice,
  otherCertificateRecords,
  testCertificateCategory,
} from "../lib/student-certificates";
import {
  testInput,
  type Qualifications,
  type TestRecord,
} from "../lib/student-qualifications";
import { practiceSets } from "../lib/student-practice";

const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const attempt = (
  id: string,
  kind: TestRecord["kind"],
  overrides: Partial<TestRecord> = {},
): TestRecord => ({
  id,
  user_id: owner,
  kind,
  label: `${kind} as on my report`,
  status: "taken",
  taken_on: "2026-09-01",
  score_label: null,
  scale_label: null,
  created_at: "2026-10-12T00:00:00Z",
  ...overrides,
});
const id = (n: number) =>
  `${String(n).padStart(8, "0")}-1111-4111-8111-${String(n).padStart(12, "0")}`;
const records: Qualifications = {
  education: [
    {
      id: id(1),
      user_id: owner,
      qualification: "School certificate exactly as issued",
      country_code: "UZ",
      curriculum: "national",
      level: "secondary",
      status: "completed",
      graduation_year: 2026,
      grade_label: "4.7",
      grade_scale: "1–5, school grading scale",
      created_at: "2026-10-12T00:00:00Z",
    },
  ],
  tests: [
    attempt(id(2), "IELTS Academic", {
      score_label: "7.0",
      scale_label: "0–9",
    }),
    attempt(id(3), "IELTS Academic", {
      taken_on: "2025-08-01",
      score_label: "6.5",
      scale_label: "0–9",
    }),
    attempt(id(4), "SAT", { status: "registered", taken_on: null }),
    attempt(id(5), "other", {
      label: "SAT / IELTS preparation course certificate",
    }),
  ],
};

test("certificate categories use known structured kinds without guessing from labels", () => {
  for (const kind of [
    "IELTS Academic",
    "IELTS General",
    "TOEFL iBT",
    "Duolingo",
  ] as const)
    assert.equal(testCertificateCategory(kind), "language");
  for (const kind of ["SAT", "ACT"] as const)
    assert.equal(testCertificateCategory(kind), "admission");
  assert.equal(testCertificateCategory("other"), "other");
  assert.equal(
    otherCertificateRecords(records)[0].label,
    "SAT / IELTS preparation course certificate",
  );
  assert.deepEqual(certificateCategories, [
    "language",
    "admission",
    "academic",
  ]);
});

test("the certificate view preserves separate historical attempts and exact student grades", () => {
  const before = JSON.stringify(records);
  Object.freeze(records.tests);
  Object.freeze(records.education);
  const language = certificateRecords(records, "language");
  assert.deepEqual(language.tests, records.tests.slice(0, 2));
  assert.equal(language.tests[0], records.tests[0]);
  assert.equal(language.tests[1].score_label, "6.5");
  assert.deepEqual(certificateRecords(records, "admission").tests, [
    records.tests[2],
  ]);
  assert.deepEqual(
    certificateRecords(records, "academic").education,
    records.education,
  );
  assert.equal(
    certificateRecords(records, "academic").education[0].grade_scale,
    "1–5, school grading scale",
  );
  assert.equal(JSON.stringify(records), before);
});

test("empty private history stays empty and unknown records stay visible separately", () => {
  for (const category of certificateCategories)
    assert.deepEqual(
      certificateRecords({ tests: [], education: [] }, category),
      { tests: [], education: [] },
    );
  assert.deepEqual(otherCertificateRecords(records), [records.tests[3]]);
  assert.equal(
    certificateRecords(records, "language").tests.some(
      (row) => row.kind === "other",
    ),
    false,
  );
});

test("certificate URL categories preserve context and reject unknown selection values", () => {
  assert.equal(certificateCategory("academic"), "academic");
  assert.equal(certificateCategory("admission"), "admission");
  for (const value of [
    "SAT",
    null,
    ["academic"],
    { category: "academic" },
    "<script>",
  ])
    assert.equal(certificateCategory(value), "language");
  assert.equal(
    certificateViewHref(
      "/dashboard/library/certificates?view=saved#sources",
      "academic",
    ),
    "/dashboard/library/certificates?view=saved&category=academic#sources",
  );
});

test("provider reference cards have distinct identities and explicit purpose/source metadata", () => {
  const ids = new Set(certificateReferences.map((reference) => reference.id));
  assert.equal(ids.size, certificateReferences.length);
  assert.equal(certificateReferences.length, 9);
  const allowedHosts = new Set([
    "ielts.org",
    "www.ets.org",
    "www.englishtest.duolingo.com",
    "bigfuture.collegeboard.org",
    "www.act.org",
    "ibo.org",
    "www.cambridgeinternational.org",
    "apstudents.collegeboard.org",
    "www.uni-assist.de",
  ]);
  for (const reference of certificateReferences) {
    assert.ok(allowedHosts.has(new URL(reference.source.url).hostname));
    assert.equal(new URL(reference.source.url).protocol, "https:");
    assert.equal(reference.source.reuse, "link_metadata_only");
    assert.equal(
      reference.source.publicationYear,
      null,
      "Retrieval date is not a manufactured publication year",
    );
    assert.equal(reference.source.checkedAt, "2026-10-12");
    assert.ok(reference.source.population.length > 30);
    assert.ok(reference.confirm.length >= 3);
    assert.ok(reference.why.length > 60);
  }
  assert.match(
    certificateReferences.find((reference) => reference.id === "national")!
      .source.population,
    /not a worldwide equivalence rule/,
  );
});

test("original practice links refer only to existing authored exercise sets", () => {
  for (const reference of certificateReferences) {
    for (const link of originalCertificatePractice(reference)) {
      const key = new URL(
        link.href,
        "https://college.example",
      ).searchParams.get("track")!;
      assert.ok(practiceSets[key]);
      assert.equal(link.count, practiceSets[key].questions.length);
      assert.equal(link.name, practiceSets[key].name);
      assert.equal(
        new URL(link.href, "https://college.example").pathname,
        "/dashboard/prepare",
      );
    }
  }
  assert.equal(
    originalCertificatePractice(
      certificateReferences.find((reference) => reference.id === "sat")!,
    ).length,
    2,
  );
  assert.equal(
    originalCertificatePractice(
      certificateReferences.find((reference) => reference.id === "act")!,
    ).length,
    0,
    "No invented ACT question bank",
  );
});

test("certificate AI links pass only an approved certificate kind, never private results", () => {
  for (const reference of certificateReferences) {
    const url = new URL(
      certificatePracticeHref(reference),
      "https://college.example",
    );
    assert.equal(url.pathname, "/dashboard/assistant");
    assert.equal(url.searchParams.get("mode"), "certificate_practice");
    assert.equal(url.searchParams.get("certificate"), reference.id);
    assert.equal(url.searchParams.size, 2);
  }
});

test("private TOEFL records support both labelled score scales without conversion", () => {
  for (const [score_label, scale_label] of [
    ["110", "0–120"],
    ["5.5", "1–6"],
    ["112 comparable total estimate", "0–120 estimate on the official report"],
  ]) {
    const row = attempt(id(6), "TOEFL iBT", { score_label, scale_label });
    const { user_id, created_at, ...input } = row;
    assert.equal(user_id, owner);
    assert.ok(created_at);
    const parsed = testInput.parse(input);
    assert.equal(parsed.score_label, score_label);
    assert.equal(parsed.scale_label, scale_label);
  }
  assert.match(
    certificateReferences.find((reference) => reference.id === "toefl")!.note!,
    /does not convert/,
  );
});
