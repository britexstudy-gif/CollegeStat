/**
 * School grades in the student's own system, plus one comparable figure.
 *
 * Every result has two numbers:
 *   pct  0–100, a percentage-style mark
 *   gpa  0–4.0, a US-style unweighted GPA
 *
 * These are rough equivalents for planning a list, never an official
 * evaluation. Universities and credential evaluators (WES, ECE, UK ENIC)
 * make their own conversions, and many read the original grades directly.
 *
 * How each scale converts
 * -----------------------
 * five      Uzbekistan, Kazakhstan, Kyrgyzstan and Tajikistan school marks
 *           (2 = fail, 3 = satisfactory, 4 = good, 5 = excellent).
 *           Credential evaluators read 5 as A, 4 as B and 3 as C, so
 *           gpa = average − 1 (5.0 → 4.0, 4.5 → 3.5, 4.0 → 3.0), pct from the
 *           GPA curve below.
 * hundred   A percentage average. gpa from the GPA curve below.
 * ib        IB Diploma points out of 45. pct = points / 45. gpa follows
 *           the bands US admissions offices commonly quote:
 *           38+ ≈ 4.0, 35 ≈ 3.8, 30 ≈ 3.5, 24 (the pass mark) ≈ 3.0.
 * alevel    A-level letters, e.g. "A*AA". Each grade maps to a GPA
 *           (A* and A → 4.0, B → 3.3, C → 2.7, D → 2.0, E → 1.3, U → 0)
 *           and the average is taken. pct from the GPA curve.
 * ap        AP exam scores, e.g. "5, 4, 5". 5 → 4.0, 4 → 3.5, 3 → 3.0,
 *           2 → 2.0, 1 → 1.0, averaged. pct from the GPA curve.
 * gpa       A 4.0-scale GPA (weighted GPAs above 4.0 are capped at 4.0).
 *
 * The GPA curve is the usual US letter table: 93%+ A (4.0), 90 A− (3.7),
 * 87 B+ (3.3), 83 B (3.0), 80 B− (2.7), 77 C+ (2.3), 73 C (2.0), 70 C− (1.7),
 * 67 D+ (1.3), 65 D (1.0), interpolated linearly between those points.
 *
 * National entrance exams are kept as a separate score (see EXAMS): they are
 * a test result, not a school average, so they never change the GPA.
 */

export const GRADE_SCALES = {
  five: { max: 5, example: "4.8" },
  hundred: { max: 100, example: "92" },
  ib: { max: 45, example: "38" },
  alevel: { max: 0, example: "A*AA" },
  ap: { max: 5, example: "5, 4, 5" },
  gpa: { max: 4, example: "3.8" },
} as const;
export type GradeScale = keyof typeof GRADE_SCALES;
export type Normalized = { pct: number; gpa: number };

/** (pct, gpa) points of the US letter table, highest first. */
const CURVE: [number, number][] = [
  [100, 4.0],
  [93, 4.0],
  [90, 3.7],
  [87, 3.3],
  [83, 3.0],
  [80, 2.7],
  [77, 2.3],
  [73, 2.0],
  [70, 1.7],
  [67, 1.3],
  [65, 1.0],
  [0, 0],
];

const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) =>
  x1 === x0 ? y0 : y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);

export function pctToGpa(pct: number) {
  const p = Math.max(0, Math.min(100, pct));
  for (let i = 0; i < CURVE.length - 1; i++) {
    const [hiP, hiG] = CURVE[i];
    const [loP, loG] = CURVE[i + 1];
    if (p >= loP) return lerp(p, loP, hiP, loG, hiG);
  }
  return 0;
}

/** Inverse of the curve; 4.0 reads as the middle of the A band (96%). */
export function gpaToPct(gpa: number) {
  const g = Math.max(0, Math.min(4, gpa));
  if (g >= 4) return 96;
  const points = CURVE.slice(1); // skip the flat 93–100 segment
  for (let i = 0; i < points.length - 1; i++) {
    const [hiP, hiG] = points[i];
    const [loP, loG] = points[i + 1];
    if (g >= loG) return lerp(g, loG, hiG, loP, hiP);
  }
  return 0;
}

const round = (pct: number, gpa: number): Normalized => ({
  pct: Math.round(Math.max(0, Math.min(100, pct))),
  gpa: Math.round(Math.max(0, Math.min(4, gpa)) * 100) / 100,
});
const fromGpa = (gpa: number) => round(gpaToPct(gpa), gpa);
const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const A_LEVEL: Record<string, number> = { "A*": 4.0, A: 4.0, B: 3.3, C: 2.7, D: 2.0, E: 1.3, U: 0 };
const AP: Record<number, number> = { 5: 4.0, 4: 3.5, 3: 3.0, 2: 2.0, 1: 1.0 };

/** "A*AA", "A* A B" or "a*,a,b" → ["A*", "A", "A"]; null when anything else is in the text. */
export function parseALevels(raw: string) {
  const text = raw.toUpperCase().replace(/[\s,;/]+/g, "");
  const grades = text.match(/A\*|[A-EU]/g) || [];
  return grades.length && grades.join("") === text ? grades : null;
}

/** "5, 4, 5" or "545" → [5, 4, 5]; null when any score is outside 1–5. */
export function parseAPScores(raw: string) {
  const parts = raw.includes(",") || raw.includes(" ") ? raw.split(/[\s,;]+/).filter(Boolean) : raw.trim().split("");
  const scores = parts.map(Number);
  return scores.length && scores.every((n) => Number.isInteger(n) && n >= 1 && n <= 5) ? scores : null;
}

const decimal = (raw: string) => {
  const t = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};

/** One comparable figure for a school grade, or null when the text doesn't fit the scale. */
export function normalizeGrade(scale: GradeScale, raw: string): Normalized | null {
  if (!raw?.trim()) return null;
  if (scale === "alevel") {
    const grades = parseALevels(raw);
    return grades ? fromGpa(average(grades.map((g) => A_LEVEL[g]))) : null;
  }
  if (scale === "ap") {
    const scores = parseAPScores(raw);
    return scores ? fromGpa(average(scores.map((s) => AP[s]))) : null;
  }
  const n = decimal(raw);
  if (n == null) return null;
  switch (scale) {
    case "five":
      return n >= 1 && n <= 5 ? fromGpa(n - 1) : null;
    case "hundred":
      return n >= 0 && n <= 100 ? round(n, pctToGpa(n)) : null;
    case "ib": {
      if (n < 0 || n > 45) return null;
      const gpa =
        n >= 38 ? 4 : n >= 35 ? lerp(n, 35, 38, 3.8, 4) : n >= 30 ? lerp(n, 30, 35, 3.5, 3.8) : n >= 24 ? lerp(n, 24, 30, 3.0, 3.5) : (n / 24) * 3;
      return round((n / 45) * 100, gpa);
    }
    case "gpa":
      return n >= 0 && n <= 5 ? fromGpa(Math.min(4, n)) : null;
  }
}

/**
 * National university entrance exams, by home country.
 *   unt  Kazakhstan, ЕНТ / UNT: 140 points in total (NTC of Kazakhstan).
 *   ort  Kyrgyzstan, ОРТ / ORT main test: 245 points at most (CEATM).
 *   ntc  Tajikistan, centralised entrance exam (National Testing Centre).
 *        Its total differs by subject cluster, so the raw score is kept
 *        without a percentage.
 * Uzbekistan's DTM test is subject-based and has no single total, so it is not asked.
 */
export const EXAMS = {
  unt: { country: "KZ", label: "UNT", max: 140 },
  ort: { country: "KG", label: "ORT", max: 245 },
  ntc: { country: "TJ", label: "NTC", max: undefined },
} as const satisfies Record<string, { country: string; label: string; max: number | undefined }>;
export type NationalExam = keyof typeof EXAMS;

export function examFor(country: string | undefined): NationalExam | undefined {
  return (Object.keys(EXAMS) as NationalExam[]).find((k) => EXAMS[k].country === country);
}

/** Exam score as a share of its maximum, when the exam has one. */
export function examPercent(exam: NationalExam, raw: string): number | null {
  const n = decimal(raw);
  const max: number | undefined = EXAMS[exam].max;
  if (n == null || n < 0) return null;
  if (!max) return null;
  return n <= max ? Math.round((n / max) * 100) : null;
}

/** Whether a raw exam score is plausible: within the maximum, or any positive number without one. */
export function examValid(exam: NationalExam, raw: string) {
  const n = decimal(raw);
  const max: number | undefined = EXAMS[exam].max;
  return n != null && n >= 0 && (!max || n <= max) && n <= 1000;
}
