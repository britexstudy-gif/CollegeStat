import satBank from "@/data/published/sat-question-bank.json";
import content from "@/data/published/certificates.json";

/** Exam folders: course lessons, practice, mocks and free official resources.
 * Lessons and questions are original CollegeStat material, not official
 * exam content. Facts come from each exam owner's site (see sources). */

export type Question = {
  id: string;
  section?: string;
  domain?: string;
  skill?: string;
  difficulty?: "easy" | "medium" | "hard";
  type?: "mcq" | "grid_in";
  passage?: string | null;
  table?: { caption?: string | null; columns: string[]; rows: string[][] } | null;
  /** Reserved for full-length tests, so practice never spoils a mock. */
  mock_only?: boolean;
  prompt: string;
  options: string[] | null;
  answer: number | null;
  answer_value?: string | null;
  explanation: string;
};

export type Lesson = { id: string; title: string; minutes: number; body: string };
export type Resource = { title: string; url: string; kind: string; provider: string };
export type FormatSection = { name: string; minutes: number | null; questions: string | null; notes?: string };
export type Mock = {
  id: string;
  title: string;
  minutes: number;
  questions: string[];
  kind?: "full" | "section" | "mini";
  note?: string;
};

export type Exam = {
  slug: string;
  name: string;
  short: string;
  provider: string;
  official_url?: string;
  best_for?: string;
  tone: "blue" | "violet" | "green" | "amber" | "rose" | "slate";
  group: "Admission tests" | "English tests" | "Graduate tests" | "Courses";
  format?: {
    sections: FormatSection[];
    total_minutes: number | null;
    score_scale: string | null;
    validity?: string | null;
    delivery?: string | null;
  };
  facts_source_url?: string;
  checked_at?: string;
  free_resources: Resource[];
  lessons: Lesson[];
  /** Practice pool (excludes questions reserved for mocks). */
  practice: Question[];
  /** Every question, including mock-only ones. */
  bank: Question[];
  mocks: Mock[];
};

const BASE: Omit<Exam, "free_resources" | "lessons" | "practice" | "bank" | "mocks">[] = [
  { slug: "sat", name: "SAT", short: "SAT", provider: "College Board", tone: "blue", group: "Admission tests" },
  { slug: "act", name: "ACT", short: "ACT", provider: "ACT, Inc.", tone: "violet", group: "Admission tests" },
  { slug: "ielts", name: "IELTS Academic", short: "IELTS", provider: "IELTS (British Council, IDP, Cambridge)", tone: "rose", group: "English tests" },
  { slug: "toefl", name: "TOEFL iBT", short: "TOEFL", provider: "ETS", tone: "green", group: "English tests" },
  { slug: "duolingo", name: "Duolingo English Test", short: "DET", provider: "Duolingo", tone: "green", group: "English tests" },
  { slug: "pte", name: "PTE Academic", short: "PTE", provider: "Pearson", tone: "amber", group: "English tests" },
  { slug: "cambridge-c1", name: "Cambridge C1 Advanced", short: "C1", provider: "Cambridge English", tone: "rose", group: "English tests" },
  { slug: "ap", name: "AP exams", short: "AP", provider: "College Board", tone: "blue", group: "Courses" },
  { slug: "gre", name: "GRE General Test", short: "GRE", provider: "ETS", tone: "slate", group: "Graduate tests" },
  { slug: "gmat", name: "GMAT Focus Edition", short: "GMAT", provider: "GMAC", tone: "slate", group: "Graduate tests" },
];

type RawExam = Partial<Exam> & { slug: string };
const raw = (content as { exams?: RawExam[] }).exams || [];
const sat = satBank as unknown as {
  structure: Record<string, string>;
  questions: Question[];
  mocks: (Mock & { math?: string[]; reading_writing?: string[] })[];
};

export const exams: Exam[] = BASE.map((base) => {
  const extra = raw.find((e) => e.slug === base.slug) || ({} as RawExam);
  const exam: Exam = {
    ...base,
    official_url: extra.official_url,
    best_for: extra.best_for,
    format: extra.format,
    facts_source_url: extra.facts_source_url,
    checked_at: extra.checked_at,
    free_resources: extra.free_resources || [],
    lessons: extra.lessons || [],
    practice: [],
    bank: (extra.practice || []).map((q) => ({ ...q, type: q.type || "mcq" })),
    mocks: extra.mocks || [],
  };
  if (base.slug === "sat") {
    exam.bank = sat.questions;
    exam.mocks = sat.mocks.map((m) => ({
      ...m,
      questions: m.questions || [...(m.reading_writing || []), ...(m.math || [])],
    }));
  }
  exam.practice = exam.bank.filter((q) => !q.mock_only);
  if (!exam.mocks.length && exam.practice.length >= 10) {
    // A short timed mock from the exam's own practice items.
    exam.mocks = [
      {
        id: base.slug + "-mini-1",
        title: `${base.short} mini mock`,
        kind: "mini",
        minutes: Math.max(8, Math.round(Math.min(15, exam.practice.length) * 1.2)),
        questions: exam.practice.slice(0, Math.min(15, exam.practice.length)).map((q) => q.id),
      },
    ];
  }
  return exam;
});

export const satStructure = sat.structure;
export const examBySlug = (slug: string) => exams.find((e) => e.slug === slug);
export const questionsById = (exam: Exam, ids: string[]) => {
  const map = new Map(exam.bank.map((q) => [q.id, q]));
  return ids.flatMap((id) => (map.has(id) ? [map.get(id)!] : []));
};

/** Grid-in answers accept equivalent forms like "3/4" and "0.75". */
export function gridMatches(input: string, expected: string) {
  const parse = (v: string) => {
    const t = v.trim().replace(/\s+/g, "");
    if (/^-?\d+\/\d+$/.test(t)) {
      const [a, b] = t.split("/").map(Number);
      return b ? a / b : NaN;
    }
    return t === "" ? NaN : Number(t);
  };
  const a = parse(input),
    b = parse(expected);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-3;
}
