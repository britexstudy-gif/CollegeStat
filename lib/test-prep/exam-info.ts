/** What each exam is, how it runs, what it scores, and what it costs in the four
 * home countries. Light on purpose: the overview imports it without the
 * question banks. Every fee and centre list comes from the exam owner's (or its
 * official delivery partner's) public page, checked on the date below; where no
 * official figure could be confirmed the field is left out. */

export type Country = "UZ" | "KZ" | "KG" | "TJ";
export const COUNTRIES: Country[] = ["UZ", "KZ", "KG", "TJ"];

export type ExamSection = { name: string; minutes: string; items: string };
export type LocalInfo = { fee?: string; cities?: string[]; note?: "online" | "school" | "dec_only" };
export type ExamInfo = {
  slug: string;
  name: string;
  short: string;
  provider: string;
  /** Full practice in the official format, or an information card only. */
  practice: boolean;
  sections: ExamSection[];
  total: string;
  /** Score scale, short and language-neutral. */
  scale: string;
  validity?: string;
  /** Same fee everywhere (USD) when the owner sets one global price. */
  fee?: string;
  local: Partial<Record<Country, LocalInfo>>;
  /** Where the fee and centre facts come from. */
  sources: string[];
  book: string;
  prep: { title: string; url: string }[];
};

export const INFO_CHECKED = "2026-11-15";

export const EXAM_INFO: ExamInfo[] = [
  {
    slug: "ielts",
    name: "IELTS Academic",
    short: "IELTS",
    provider: "British Council · IDP · Cambridge",
    practice: true,
    sections: [
      { name: "Listening", minutes: "30", items: "40" },
      { name: "Reading", minutes: "60", items: "40" },
      { name: "Writing", minutes: "60", items: "2" },
      { name: "Speaking", minutes: "11–14", items: "3" },
    ],
    total: "2 h 45 min",
    scale: "0–9",
    validity: "2",
    local: {
      UZ: { fee: "2 800 000 UZS", cities: ["Tashkent", "Samarkand", "Bukhara", "Andijan", "Fergana", "Namangan", "Navoi", "Nukus", "Termez", "Urgench"] },
      KZ: { fee: "110 250 KZT", cities: ["Almaty", "Astana", "Shymkent", "Karaganda", "Aktobe", "Atyrau", "Aktau", "Pavlodar", "Oskemen", "Semey", "Kostanay", "Taraz", "Kyzylorda", "Uralsk"] },
      TJ: { fee: "2 150 TJS", cities: ["Dushanbe"] },
    },
    sources: [
      "https://ielts.idp.com/uzbekistan/test-dates",
      "https://ielts.idp.com/kazakhstan/test-dates",
      "https://ielts.idp.com/tajikistan/test-dates",
    ],
    book: "https://ielts.org/take-a-test/book-a-test",
    prep: [
      { title: "IELTS sample test questions", url: "https://ielts.org/take-a-test/preparation-resources/sample-test-questions" },
      { title: "Computer-delivered IELTS familiarisation test", url: "https://ielts.org/take-a-test/preparation-resources/familiarisation-test" },
      { title: "IDP free practice tests", url: "https://ielts.idp.com/prepare/free-ielts-practice-tests" },
      { title: "Writing band descriptors", url: "https://ielts.org/take-a-test/preparation-resources/writing-test-resources" },
    ],
  },
  {
    slug: "toefl",
    name: "TOEFL iBT",
    short: "TOEFL",
    provider: "ETS",
    practice: true,
    sections: [
      { name: "Reading", minutes: "≈30", items: "≈50" },
      { name: "Listening", minutes: "≈29", items: "≈47" },
      { name: "Writing", minutes: "≈23", items: "≈12" },
      { name: "Speaking", minutes: "≈8", items: "≈11" },
    ],
    total: "≈ 1 h 30 min",
    scale: "1–6",
    validity: "2",
    local: { UZ: { fee: "US$200" }, KZ: { fee: "US$180" }, KG: { fee: "US$200" }, TJ: { fee: "US$204" } },
    sources: ["https://www.ets.org/toefl/test-takers/ibt/register/fees.html"],
    book: "https://www.ets.org/toefl/test-takers/ibt/register.html",
    prep: [
      { title: "TOEFL iBT practice tests", url: "https://www.ets.org/toefl/test-takers/ibt/prepare/practice-tests.html" },
      { title: "TOEFL TestReady", url: "https://www.ets.org/toefl/test-takers/ibt/prepare/toefl-testready.html" },
      { title: "Test centre search", url: "https://www.ets.org/toefl/test-takers/ibt/register/centers-dates.html" },
    ],
  },
  {
    slug: "sat",
    name: "Digital SAT",
    short: "SAT",
    provider: "College Board",
    practice: true,
    sections: [
      { name: "Reading and Writing", minutes: "64 (2 × 32)", items: "54" },
      { name: "Math", minutes: "70 (2 × 35)", items: "44" },
    ],
    total: "2 h 14 min",
    scale: "400–1600",
    fee: "US$111",
    local: {},
    sources: ["https://satsuite.collegeboard.org/sat/registration/international-testing/fees"],
    book: "https://satsuite.collegeboard.org/sat/registration",
    prep: [
      { title: "Full-length practice tests in Bluebook", url: "https://satsuite.collegeboard.org/practice/practice-tests" },
      { title: "SAT Suite question bank", url: "https://satsuitequestionbank.collegeboard.org/" },
      { title: "Khan Academy: Digital SAT", url: "https://www.khanacademy.org/test-prep/digital-sat" },
      { title: "Test centre search", url: "https://satsuite.collegeboard.org/sat/test-center-search" },
    ],
  },
  {
    slug: "duolingo",
    name: "Duolingo English Test",
    short: "DET",
    provider: "Duolingo",
    practice: true,
    sections: [
      { name: "Setup and checks", minutes: "5", items: "—" },
      { name: "Adaptive test", minutes: "≈45", items: "—" },
      { name: "Writing and speaking samples", minutes: "≈10", items: "2" },
    ],
    total: "≈ 1 h",
    scale: "10–160",
    validity: "2",
    local: { UZ: { note: "online" }, KZ: { note: "online" }, KG: { note: "online" }, TJ: { note: "online" } },
    sources: ["https://englishtest.duolingo.com/"],
    book: "https://englishtest.duolingo.com/",
    prep: [
      { title: "Free official practice test", url: "https://englishtest.duolingo.com/practice" },
      { title: "Official guide for test takers", url: "https://englishtest-static.duolingo.com/media/resources/test-taker-guide/DET%20Guide%20EN.pdf" },
      { title: "Readiness hub", url: "https://englishtest.duolingo.com/readiness" },
    ],
  },
  {
    slug: "act",
    name: "ACT",
    short: "ACT",
    provider: "ACT, Inc.",
    practice: false,
    sections: [
      { name: "English", minutes: "35", items: "50" },
      { name: "Math", minutes: "50", items: "45" },
      { name: "Reading", minutes: "40", items: "36" },
      { name: "Science (optional)", minutes: "40", items: "40" },
    ],
    total: "2 h 5 min",
    scale: "1–36",
    fee: "US$188.50",
    local: {},
    sources: ["https://global.act.org/content/global/en/products-and-services/the-act-non-us/registration/fees.html"],
    book: "https://global.act.org/content/global/en/products-and-services/the-act-non-us/registration.html",
    prep: [
      { title: "ACT test preparation", url: "https://www.act.org/content/act/en/products-and-services/the-act/test-preparation.html" },
      { title: "International computer-based ACT", url: "https://global.act.org/content/global/en/products-and-services/the-act-non-us/international-cbt.html" },
    ],
  },
  {
    slug: "ap",
    name: "AP Exams",
    short: "AP",
    provider: "College Board",
    practice: false,
    sections: [
      { name: "Multiple choice", minutes: "≈60–90", items: "—" },
      { name: "Free response", minutes: "≈60–100", items: "—" },
    ],
    total: "≈ 2–3 h",
    scale: "1–5",
    fee: "US$129",
    local: { UZ: { note: "school" }, KZ: { note: "school" }, KG: { note: "school" }, TJ: { note: "school" } },
    sources: ["https://apstudents.collegeboard.org/exam-policies-guidelines/exam-fees"],
    book: "https://apstudents.collegeboard.org/taking-the-exam/exam-registration",
    prep: [
      { title: "AP courses and exams", url: "https://apstudents.collegeboard.org/course-index-page" },
      { title: "Past free-response questions", url: "https://apcentral.collegeboard.org/courses/exam-pages" },
    ],
  },
  {
    slug: "topik",
    name: "TOPIK",
    short: "TOPIK",
    provider: "NIIED (Korea)",
    practice: false,
    sections: [
      { name: "TOPIK I: Listening + Reading", minutes: "100", items: "70" },
      { name: "TOPIK II: Listening + Writing + Reading", minutes: "180", items: "104" },
    ],
    total: "1 h 40 min / 3 h",
    scale: "Levels 1–6",
    validity: "2",
    local: {},
    sources: ["https://www.topik.go.kr/"],
    book: "https://www.topik.go.kr/",
    prep: [{ title: "Official site: past papers and schedule", url: "https://www.topik.go.kr/" }],
  },
  {
    slug: "hsk",
    name: "HSK",
    short: "HSK",
    provider: "Chinese Testing International",
    practice: false,
    sections: [
      { name: "Listening", minutes: "≈20–40", items: "—" },
      { name: "Reading", minutes: "≈25–50", items: "—" },
      { name: "Writing (HSK 3+)", minutes: "≈15–40", items: "—" },
    ],
    total: "≈ 1–2 h",
    scale: "Levels 1–6 · 0–300",
    local: {},
    sources: ["https://www.chinesetest.cn/"],
    book: "https://www.chinesetest.cn/",
    prep: [{ title: "Official site: levels, sample papers and centre finder", url: "https://www.chinesetest.cn/" }],
  },
  {
    slug: "jlpt",
    name: "JLPT",
    short: "JLPT",
    provider: "Japan Foundation · JEES",
    practice: false,
    sections: [
      { name: "Language knowledge and reading", minutes: "60–110", items: "—" },
      { name: "Listening", minutes: "30–55", items: "—" },
    ],
    total: "≈ 1.5–3 h",
    scale: "N5–N1 · 0–180",
    local: {
      UZ: { cities: ["Tashkent"] },
      KZ: { cities: ["Almaty", "Astana"] },
      KG: { cities: ["Bishkek"] },
      TJ: { cities: ["Dushanbe"] },
    },
    sources: ["https://www.jlpt.jp/e/application/overseas_list.html"],
    book: "https://www.jlpt.jp/e/application/overseas_list.html",
    prep: [{ title: "Official sample questions", url: "https://www.jlpt.jp/e/samples/forlearners.html" }],
  },
];

export const infoBySlug = (slug: string) => EXAM_INFO.find((e) => e.slug === slug);

/** Home country from the onboarding answers, when it is one of the four. */
export function homeCountry(prefs: unknown): Country | null {
  const p = (prefs || {}) as { intake?: { details?: { home_country?: string }; home_country?: string }; home_country?: string };
  const c = p.intake?.details?.home_country || p.intake?.home_country || p.home_country;
  return COUNTRIES.includes(c as Country) ? (c as Country) : null;
}
