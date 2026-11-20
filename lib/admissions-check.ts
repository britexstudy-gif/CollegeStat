/** Compares a student's test score with a university's published middle-50%
 * range and admit rate (NCES IPEDS). It describes how a profile sits against
 * a past entering class; it never predicts an admission decision. */

export type AdmissionsRow = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  applicants: number | null;
  admitted: number | null;
  acceptance_rate: number | null;
  sat_ebrw_25: number | null;
  sat_ebrw_75: number | null;
  sat_math_25: number | null;
  sat_math_75: number | null;
  sat_total_25: number | null;
  sat_total_75: number | null;
  act_25: number | null;
  act_75: number | null;
  test_policy: "required" | "test_optional" | "not_considered" | "considered" | null;
};

export type ScoreInput = { sat?: number; act?: number };
export type Band = "below" | "within" | "above" | "unknown";
export type Category = "reach" | "target" | "likely" | "unknown";

export function rowsFrom(data: { fields: string[]; rows: unknown[][] }): AdmissionsRow[] {
  return data.rows.map(
    (row) => Object.fromEntries(data.fields.map((f, i) => [f, row[i] ?? null])) as AdmissionsRow,
  );
}

/** Where the score falls against the 25th–75th percentile range. */
export function scorePosition(score: ScoreInput, row: AdmissionsRow) {
  const useSat = !!score.sat && row.sat_total_25 != null && row.sat_total_75 != null;
  const useAct = !useSat && !!score.act && row.act_25 != null && row.act_75 != null;
  if (!useSat && !useAct) return { band: "unknown" as Band, test: null, low: null, high: null, value: null };
  const [low, high, value, min, max] = useSat
    ? [row.sat_total_25!, row.sat_total_75!, score.sat!, 400, 1600]
    : [row.act_25!, row.act_75!, score.act!, 1, 36];
  const band: Band = value < low ? "below" : value > high ? "above" : "within";
  return { band, test: useSat ? ("SAT" as const) : ("ACT" as const), low, high, value, min, max };
}

/** Reach / target / likely, using the published rate as a ceiling: when fewer
 * than 15% of applicants are admitted, every applicant should treat it as a
 * reach, whatever their scores. */
export function categoryFor(score: ScoreInput, row: AdmissionsRow): Category {
  const rate = row.acceptance_rate;
  const { band } = scorePosition(score, row);
  if (rate == null) return "unknown";
  if (rate < 15) return "reach";
  if (band === "unknown") return rate >= 60 ? "likely" : rate >= 30 ? "target" : "reach";
  if (band === "below") return "reach";
  if (band === "above") return rate >= 40 ? "likely" : "target";
  return rate >= 70 ? "likely" : "target";
}

export const CATEGORY_TEXT: Record<Category, { label: string; hint: string }> = {
  reach: { label: "Reach", hint: "Admission is uncertain for most applicants here." },
  target: { label: "Target", hint: "Your score is in line with admitted students." },
  likely: { label: "Likely", hint: "Your score is above most admitted students and the admit rate is high." },
  unknown: { label: "Not enough data", hint: "This university doesn’t publish enough admissions data." },
};

/** A balanced list usually mixes all three. */
export function listBalance(categories: Category[]) {
  const count = (c: Category) => categories.filter((x) => x === c).length;
  const reach = count("reach"),
    target = count("target"),
    likely = count("likely");
  const tips: string[] = [];
  if (categories.length && !likely) tips.push("Add at least one or two likely options.");
  if (categories.length && !target) tips.push("Add a few targets where your score fits the middle range.");
  if (reach > target + likely) tips.push("Your list leans heavily on reaches.");
  return { reach, target, likely, tips };
}
