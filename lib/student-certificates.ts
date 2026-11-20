import type { Qualifications, TestRecord } from "./student-qualifications";
import { practiceSets } from "./student-practice";

export const certificateCategories = [
  "language",
  "admission",
  "academic",
] as const;
export type CertificateCategory = (typeof certificateCategories)[number];
export type CertificateReference = {
  id: string;
  name: string;
  category: CertificateCategory;
  why: string;
  confirm: readonly string[];
  source: {
    provider: string;
    url: string;
    checkedAt: string;
    population: string;
    publicationYear: number | null;
    reuse: "link_metadata_only";
  };
  note?: string;
  originalPractice?: readonly (keyof typeof practiceSets)[];
};
const checkedAt = "2026-10-12";
const reference = (provider: string, url: string, population: string) => ({
  provider,
  url,
  checkedAt,
  population,
  publicationYear: null,
  reuse: "link_metadata_only" as const,
});

/** Provider definitions and recognition routes, not university admission rules.
 * Keep original test materials on their provider websites. No score conversions,
 * acceptance probabilities, universal country thresholds or expiry inferred.
 */
export const certificateReferences: readonly CertificateReference[] = [
  {
    id: "ielts",
    name: "IELTS Academic",
    category: "language",
    why: "Evidence of English language skills for higher education. Confirm that your course accepts the specific IELTS test you plan to take.",
    confirm: [
      "Accepted test variant and delivery format",
      "Overall score, section scores and exemptions",
      "Score age and official result submission",
    ],
    source: reference(
      "IELTS",
      "https://ielts.org/take-a-test/test-types/ielts-academic-test",
      "IELTS Academic purpose and test variants; institution sets its entry conditions",
    ),
    note: "Academic and General Training are different variants. A General Training record is kept as reported; it is not converted into an Academic result.",
    originalPractice: ["ielts"],
  },
  {
    id: "toefl",
    name: "TOEFL iBT",
    category: "language",
    why: "Evidence of academic English. Follow the programme’s accepted test formats, score requirements and instructions for submitting results.",
    confirm: [
      "Accepted test format for your programme",
      "The score scale stated on your report and the course page",
      "Section scores, exemptions and submission instructions",
    ],
    source: reference(
      "ETS",
      "https://www.ets.org/toefl/test-takers/ibt/where-to-study/destinations-search.html",
      "TOEFL iBT institution search and current score-reporting transition",
    ),
    note: "ETS now reports a 1–6 scale and a comparable 0–120 total estimate during the transition. Keep your score and its scale exactly as reported; CollegeStat does not convert them.",
  },
  {
    id: "duolingo",
    name: "Duolingo English Test",
    category: "language",
    why: "An English proficiency test accepted by participating programmes. A provider listing is a starting point; confirm the exact course policy.",
    confirm: [
      "Acceptance for your programme and degree level",
      "Required total and subscores, if stated",
      "Additional language evidence and official submission",
    ],
    source: reference(
      "Duolingo English Test",
      "https://www.englishtest.duolingo.com/institutions",
      "Participating institutions; acceptance may differ by programme or applicant",
    ),
  },
  {
    id: "sat",
    name: "SAT",
    category: "admission",
    why: "An academic admission test covering reading, writing and mathematics. Whether you need it depends on your university’s current applicant policy.",
    confirm: [
      "Required, optional or not considered for your intake",
      "Any programme or applicant-category exceptions",
      "Official score submission and scholarship policies",
    ],
    source: reference(
      "College Board",
      "https://bigfuture.collegeboard.org/plan-for-college/find-your-fit/what-colleges-require-SAT",
      "SAT/ACT admission policies; the provider instructs applicants to verify each college’s policy",
    ),
    originalPractice: ["math", "reading"],
  },
  {
    id: "act",
    name: "ACT",
    category: "admission",
    why: "An academic test whose results can be sent to colleges. Check the course’s policy and which test sections it expects before registering.",
    confirm: [
      "The current policy for your applicant category",
      "Any requested test sections and score report",
      "Submission instructions and fee-waiver eligibility",
    ],
    source: reference(
      "ACT",
      "https://www.act.org/content/act/en/products-and-services/the-act.html",
      "ACT provider overview, current test sections and college score reporting",
    ),
  },
  {
    id: "ib",
    name: "IB Diploma & subjects",
    category: "academic",
    why: "A school qualification with subject-level results. University recognition and the subjects or grades a course requests are separate checks.",
    confirm: [
      "Diploma or individual-course recognition",
      "Required subjects, levels and grades",
      "Predicted/final results and transcript delivery",
    ],
    source: reference(
      "International Baccalaureate",
      "https://ibo.org/programmes/diploma-programme/assessment-and-exams/university-admissions/",
      "IB university recognition policies; recognition does not guarantee admission",
    ),
  },
  {
    id: "a-level",
    name: "A levels & AS levels",
    category: "academic",
    why: "Subject qualifications that universities assess through their own recognition and course entry policies. Check subjects and grades together.",
    confirm: [
      "Recognition of your awarding body and qualification",
      "Required subjects, combinations and grades",
      "Whether predicted or final results are requested",
    ],
    source: reference(
      "Cambridge International Education",
      "https://www.cambridgeinternational.org/programmes-and-qualifications/recognition-and-acceptance/",
      "Cambridge qualification recognition and institution-specific acceptance policies",
    ),
  },
  {
    id: "ap",
    name: "AP courses & exams",
    category: "academic",
    why: "College-level courses and exams taken in high school. Admission use, course credit and placement are separate university policies.",
    confirm: [
      "Whether the course considers AP for admission",
      "Its subject and score requirements, if stated",
      "Separate credit/placement policy and official reports",
    ],
    source: reference(
      "College Board",
      "https://apstudents.collegeboard.org/what-is-ap",
      "AP programme purpose, college credit and placement; institution-specific conditions",
    ),
  },
  {
    id: "national",
    name: "School certificates & prior degrees",
    category: "academic",
    why: "Your school or university records show your academic preparation. Check how your destination evaluates the exact qualification you hold.",
    confirm: [
      "Recognition of the certificate and subject background",
      "Transcripts, grading scale and any entrance examination",
      "Certified copies, translations and possible foundation route",
    ],
    source: reference(
      "uni-assist",
      "https://www.uni-assist.de/en/tools/glossary-of-terms/description/term/university-entrance-qualification-hochschulzugangsberechtigung/",
      "German university entrance qualification guidance; not a worldwide equivalence rule",
    ),
    note: "The linked German guidance is one recognition example. Use the destination guide and the university’s own policy for other countries.",
  },
];
export function certificateCategory(value: unknown): CertificateCategory {
  return value === "admission" || value === "academic" ? value : "language";
}
/** Classify only structured kinds. A free-text label never establishes a test type. */
export function testCertificateCategory(
  kind: TestRecord["kind"],
): CertificateCategory | "other" {
  if (
    ["IELTS Academic", "IELTS General", "TOEFL iBT", "Duolingo"].includes(kind)
  )
    return "language";
  if (kind === "SAT" || kind === "ACT") return "admission";
  return "other";
}
export function certificateRecords(
  rows: Qualifications,
  category: CertificateCategory,
) {
  return {
    education: category === "academic" ? rows.education : [],
    tests: rows.tests.filter(
      (row) => testCertificateCategory(row.kind) === category,
    ),
  };
}
export function otherCertificateRecords(rows: Qualifications) {
  return rows.tests.filter(
    (row) => testCertificateCategory(row.kind) === "other",
  );
}
export function certificateViewHref(
  current: string,
  category: CertificateCategory,
) {
  const url = new URL(current, "https://college.example");
  url.searchParams.set("category", category);
  return url.pathname + url.search + url.hash;
}
export function certificatePracticeHref(reference: CertificateReference) {
  return `/dashboard/assistant?mode=certificate_practice&certificate=${encodeURIComponent(reference.id)}`;
}
export function originalCertificatePractice(reference: CertificateReference) {
  return (reference.originalPractice || [])
    .filter((key) => !!practiceSets[key])
    .map((key) => ({
      name: practiceSets[key].name,
      href: `/dashboard/prepare?section=Practice&track=${encodeURIComponent(key)}`,
      count: practiceSets[key].questions.length,
    }));
}
