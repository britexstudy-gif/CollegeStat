import { admission, languageMinimum, type University } from "./domain";
import { valueOf } from "./research";
import { toUSD } from "./fx";
import { categoryFor, type AdmissionsRow, type Category } from "./admissions-check";

/**
 * The personal Reach / Target / Likely chip on university lists. It reuses
 * the admissions check's model (categoryFor: published admit rate as a
 * ceiling, SAT/ACT against the middle-50% range) on the list record, and adds
 * one rule the onboarding plan already uses: a taken English score below the
 * university-wide minimum makes it a reach. Tuition over budget is reported
 * beside the category, never folded into it. This is a guide to list
 * balance, not a prediction.
 */

export type ChanceProfile = {
  sat?: number;
  act?: number;
  ielts?: number;
  toefl?: number;
  /** Yearly budget in USD; undefined = no limit or full funding needed. */
  budget?: number;
  /** From profileStrength(): olympiads, class rank, grades, scores and activity depth. */
  strength?: StrengthLevel;
};

export type StrengthLevel = "strong" | "solid" | "building";

/** What profileStrength reads; every field optional (planned scores never count). */
export type StrengthInput = {
  /** Grade as a percentage (lib/grades/convert.ts normalizeGrade). */
  gradePct?: number;
  classRank?: string;
  honours?: { level: string; medal?: string }[];
  sat?: number;
  act?: number;
  ielts?: number;
  toefl?: number;
  research?: string;
  /** Activity areas with years "0"–"3" and hours "low" | "mid" | "high". */
  depth?: { years: string; hours?: string }[];
};

export type Strength = { level: StrengthLevel; points: number; reasons: string[] };

/**
 * A rough read of how competitive the profile is, used only to nudge the
 * Reach / Target / Likely chip one step on rate-only estimates. Returns null
 * when there is too little to judge (no grade and no taken score).
 */
export function profileStrength(x: StrengthInput): Strength | null {
  const hasScore = x.sat != null || x.act != null || x.ielts != null || x.toefl != null;
  if (x.gradePct == null && !hasScore && !x.honours?.length) return null;
  const reasons: string[] = [];
  let points = 0;
  const add = (n: number, why: string) => {
    if (n > 0) {
      points += n;
      reasons.push(why);
    }
  };
  if (x.gradePct != null) add(x.gradePct >= 95 ? 2 : x.gradePct >= 88 ? 1 : 0, "grades");
  add(x.classRank === "top1" || x.classRank === "top5" ? 2 : x.classRank === "top10" ? 1 : 0, "rank");
  let olympiad = 0;
  for (const h of x.honours || []) {
    const medal = !!h.medal && h.medal !== "participant";
    const n =
      h.level === "international" ? (medal ? 4 : 2) : h.level === "national" ? (medal ? 3 : 1) : h.level === "region" ? (medal ? 1 : 0) : 0;
    olympiad = Math.max(olympiad, n);
  }
  add(olympiad, "olympiad");
  add(x.sat != null ? (x.sat >= 1450 ? 2 : x.sat >= 1350 ? 1 : 0) : x.act != null ? (x.act >= 32 ? 2 : x.act >= 29 ? 1 : 0) : 0, "sat");
  add((x.ielts != null && x.ielts >= 7.5) || (x.toefl != null && x.toefl >= 105) ? 1 : 0, "english");
  add(x.research === "published" ? 2 : x.research === "research" ? 1 : 0, "research");
  const deep = (x.depth || []).filter((d) => d.years === "3" || (d.years === "2" && d.hours !== "low"));
  add(Math.min(2, deep.length + ((x.depth || []).some((d) => d.years === "3" && d.hours === "high") ? 1 : 0)), "activities");
  return { level: points >= 7 ? "strong" : points >= 4 ? "solid" : "building", points, reasons };
}

export type Chance = {
  category: Category;
  rate?: number;
  sat?: { low: number; high: number; band: "below" | "within" | "above" };
  english?: { test: "IELTS" | "TOEFL iBT"; minimum: number; meets?: boolean };
  tuition?: number;
  overBudget?: boolean;
};

/** Yearly tuition for international students in USD, when published. */
export function tuitionUSD(u: University) {
  // Latest federal tuition and fees (international students pay the out-of-state rate).
  if (u.us_current?.tuition_fees_out_of_state) return u.us_current.tuition_fees_out_of_state;
  const intl = valueOf(u, "tuition");
  if (intl.value != null && intl.currency === "USD") return intl.value;
  // Other currencies: an approximate conversion, good enough for a budget comparison.
  if (intl.value != null && intl.currency) {
    const per = (intl.record as { period?: string } | undefined)?.period;
    const usd = toUSD(intl.value * (per === "semester" ? 2 : per === "month" ? 12 : 1), intl.currency);
    if (usd !== undefined && per !== "total") return usd;
  }
  // US public universities: international students pay the out-of-state rate.
  if (u.country_code === "US") {
    const out = valueOf(u, "tuition_out_of_state");
    if (out.value != null) return out.value;
  }
  return undefined;
}

/** The list record as an admissions-check row. */
export function admissionsRow(u: University): AdmissionsRow {
  const a = u.admissions?.length ? admission(u) : undefined;
  // The latest federal year wins over older records when the profile carries it.
  const cur = u.us_current;
  const curSat = cur?.sat_reading_25 && cur.sat_math_25 && cur.sat_reading_75 && cur.sat_math_75 ? [cur.sat_reading_25 + cur.sat_math_25, cur.sat_reading_75 + cur.sat_math_75] : null;
  const rate = cur?.acceptance_rate ?? valueOf(u, "admission").value;
  return {
    id: u.id,
    slug: u.slug,
    name: u.name,
    city: u.city,
    state: null,
    applicants: null,
    admitted: null,
    acceptance_rate: rate != null && rate > 0 && rate <= 100 ? rate : null,
    sat_ebrw_25: null,
    sat_ebrw_75: null,
    sat_math_25: null,
    sat_math_75: null,
    sat_total_25: curSat?.[0] ?? a?.sat_min ?? null,
    sat_total_75: curSat?.[1] ?? a?.sat_max ?? null,
    act_25: cur?.act_25 ?? a?.act_min ?? null,
    act_75: cur?.act_75 ?? a?.act_max ?? null,
    test_policy: null,
  };
}

export function chanceFor(p: ChanceProfile, u: University): Chance {
  const row = admissionsRow(u);
  let category = categoryFor({ sat: p.sat, act: p.act }, row);
  const out: Chance = { category };
  if (row.acceptance_rate != null) out.rate = row.acceptance_rate;
  if (p.sat && row.sat_total_25 != null && row.sat_total_75 != null)
    out.sat = {
      low: row.sat_total_25,
      high: row.sat_total_75,
      band: p.sat < row.sat_total_25 ? "below" : p.sat > row.sat_total_75 ? "above" : "within",
    };
  const kind = p.ielts == null && p.toefl != null ? "TOEFL" : "IELTS";
  const minimum = u.requirements ? languageMinimum(u, kind) : null;
  // Some TOEFL minimums use the new 1–6 band scale; only compare like with like.
  if (minimum != null && !(kind === "TOEFL" && minimum <= 6)) {
    const score = kind === "IELTS" ? p.ielts : p.toefl;
    out.english = { test: kind === "IELTS" ? "IELTS" : "TOEFL iBT", minimum, meets: score != null ? score >= minimum : undefined };
    if (out.english.meets === false && category !== "unknown") category = "reach";
  }
  const tuition = tuitionUSD(u);
  if (tuition != null) {
    out.tuition = tuition;
    if (p.budget != null) out.overBudget = tuition > p.budget;
  }
  // Profile strength moves a rate-only estimate one step, never past the score
  // evidence (an SAT below range or a missed English minimum keeps it a reach)
  // and never at the most selective universities (under 15% stays a reach).
  const rateOnly = !out.sat && out.english?.meets !== false && row.acceptance_rate != null;
  if (rateOnly && p.strength === "strong") {
    if (category === "reach" && row.acceptance_rate! >= 20) category = "target";
    else if (category === "target" && row.acceptance_rate! >= 45) category = "likely";
  } else if (rateOnly && p.strength === "building" && category === "likely" && row.acceptance_rate! < 75) category = "target";
  out.category = category;
  return out;
}
