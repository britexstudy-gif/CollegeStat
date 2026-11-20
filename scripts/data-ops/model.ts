// Canonical curated record model (one per university) with per-field provenance.
// Validated with zod so every line of data/curated/universities.ndjson can be checked.
import { z } from "zod";
import { DEADLINE_ROUNDS, PLATFORMS } from "../../server/data-v2/schema";

export const INTAKE = 2027;
/** Owner rule: show only the latest data — 2026/27 preferred, else 2025/26. Older = stale (history only). */
export const PREFERRED_YEAR = 2026;
export const OLDEST_CURRENT_YEAR = 2025;

export const METHODS = ["fetched", "snippet", "dataset"] as const;
export type Method = (typeof METHODS)[number];
export const TEST_STATUS = ["required", "optional", "not_required", "conditional", "unknown"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const academicYear = z.string().regex(/^\d{4}\/\d{2}$/);
const money = z.number().finite().nonnegative();

export const Provenance = z.object({
  source_url: z.string().regex(/^https?:\/\//),
  retrieved_at: isoDate,
  method: z.enum(METHODS),
  collector: z.string().min(1),
  confidence: z.number().min(0).max(1),
  verified: z.boolean(),
  academic_year: academicYear.nullable(),
  flags: z.array(z.string()),
  note: z.string().nullable(),
  /** Short human summary of why we trust the value ("College Scorecard 2025/26 + CDS 2025-26 agree"). */
  basis: z.string().optional(),
  /** Computed from other source values (e.g. CRICOS total cost ÷ duration). Confidence is capped. */
  derived: z.boolean().optional(),
});
export type Provenance = z.infer<typeof Provenance>;

// ── Field value schemas ──
export const Tuition = z.object({
  amount: money.nullable(), range_min: money.nullable(), range_max: money.nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/), period: z.enum(["year", "semester", "credit", "month", "total"]),
  /** Annual USD (amount or range_min), null when FX is missing or the period cannot be annualised. */
  usd: money.nullable(), fx: z.object({ usd_per_unit: z.number().positive(), date: isoDate, source: z.string() }).nullable(),
  basis: z.string().nullable(),
});
export const Money = z.object({ amount: money.nullable(), currency: z.string().regex(/^[A-Z]{3}$/).nullable(), usd: money.nullable(), text: z.string().nullable() });
export const Deadline = z.object({
  round: z.enum(DEADLINE_ROUNDS), label: z.string(), date: isoDate.nullable(), date_inferred: z.boolean(), text: z.string().nullable(),
  intake_year: z.number().int(), source_url: z.string(), retrieved_at: isoDate, method: z.enum(METHODS), collector: z.string(),
});
export const Platform = z.object({ code: z.enum(PLATFORMS), label: z.string() });
export const Ielts = z.object({ status: z.enum(TEST_STATUS), overall: z.number().nullable(), component: z.number().nullable(), text: z.string().nullable() });
/** TOEFL iBT: classic 0–120 score and the 1–6 band scale used for tests from 21 Jan 2026. */
export const Toefl = z.object({ status: z.enum(TEST_STATUS), ibt: z.number().nullable(), ibt_component: z.number().nullable(), band_2026: z.number().nullable(), text: z.string().nullable() });
export const Duolingo = z.object({ status: z.enum(TEST_STATUS), minimum: z.number().nullable(), text: z.string().nullable() });
export const SatAct = z.object({ policy: z.enum(["required", "optional", "not_considered", "recommended", "unknown"]), text: z.string().nullable() });
export const Acceptance = z.object({ percent: z.number().min(0).max(100), year: z.number().int().nullable() });
export const Programme = z.object({ name: z.string(), faculty: z.string().nullable(), degree: z.string().nullable(), years: z.number().nullable(), requires: z.string().nullable(), source_url: z.string().nullable() });
export const Count = z.object({ value: z.number().nonnegative(), year: z.number().int().nullable() });
export const C7_LEVELS = ["very_important", "important", "considered", "not_considered"] as const;
/** International (non-resident) financial aid, e.g. Common Data Set H6. */
export const IntlAid = z.object({ available: z.boolean().nullable(), count: z.number().nonnegative().nullable(), avg_usd: z.number().nonnegative().nullable(), text: z.string().nullable() });

export const FIELD_SCHEMAS = {
  tuition: Tuition,
  mandatory_fees: Money,
  living_cost: Money,
  application_fee: Money,
  deadlines: z.array(Deadline),
  platform: Platform,
  ielts: Ielts,
  toefl: Toefl,
  duolingo: Duolingo,
  sat_act: SatAct,
  acceptance_rate: Acceptance,
  documents: z.array(z.string()),
  programmes: z.array(Programme),
  founded_year: z.number().int().min(800).max(2035),
  student_count: Count,
  // US federal data (College Scorecard / IPEDS)
  sat_scores: z.object({ reading_25: z.number().nullable(), reading_75: z.number().nullable(), math_25: z.number().nullable(), math_75: z.number().nullable(), average: z.number().nullable(),
    /** Composite percentiles (Common Data Set C9); optional, Scorecard has none. */
    composite_25: z.number().nullable().optional(), composite_50: z.number().nullable().optional(), composite_75: z.number().nullable().optional() }),
  act_scores: z.object({ p25: z.number().nullable(), p75: z.number().nullable() }),
  cost_of_attendance: Money,
  net_price: Money,
  undergrads: Count,
  international_share: z.number().min(0).max(1),
  grad_rate: z.number().min(0).max(1),
  median_earnings_10y: Money,
  bachelor_fields: z.array(z.string()),
  // Common Data Set / national datasets (Nov 2026)
  applicants: Count,
  admitted: Count,
  /** Average high-school GPA of enrolled first-years (CDS C12; 4.0 scale, weighted can exceed 4). */
  gpa_avg: z.number().min(0).max(5),
  /** CDS C7: relative importance of admission factors, keyed by factor (snake_case). */
  c7_factors: z.record(z.string(), z.enum(C7_LEVELS)),
  room_board: Money,
  intl_aid: IntlAid,
  intl_students: Count,
} as const;
export type FieldName = keyof typeof FIELD_SCHEMAS;
export const FIELDS = Object.keys(FIELD_SCHEMAS) as FieldName[];
export type FieldValue<F extends FieldName> = z.infer<(typeof FIELD_SCHEMAS)[F]>;

/** Fields a student needs to apply. Missing ones put a university at the front of the collection queue. */
export const CORE_FIELDS: FieldName[] = ["tuition", "deadlines", "platform", "ielts", "documents"];
/** Fields merged as a union of all sources instead of picking one winner. */
export const UNION_FIELDS: FieldName[] = ["documents", "programmes", "bachelor_fields"];
/** Fields whose value belongs to an academic year (owner's "latest data only" rule applies). */
export const YEAR_FIELDS: FieldName[] = ["tuition", "mandatory_fees", "living_cost", "application_fee", "acceptance_rate", "deadlines",
  "sat_scores", "act_scores", "cost_of_attendance", "net_price", "undergrads", "international_share", "grad_rate", "median_earnings_10y",
  "applicants", "admitted", "gpa_avg", "c7_factors", "room_board", "intl_aid", "intl_students"];
/** Facts without a year (identity-like); everything else is labelled with an academic year. */
export const TIMELESS_FIELDS: FieldName[] = ["founded_year"];

export type Fact<F extends FieldName = FieldName> = Provenance & { value: FieldValue<F> };

export const CuratedRecord = z.object({
  id: z.string().uuid(),
  slug: z.string().nullable(),
  name: z.string(),
  country_code: z.string().nullable(),
  website: z.string().nullable(),
  is_target: z.boolean(),
  target_rank: z.number().int().nullable(),
  /** Current view: one resolved fact per field (latest academic year only). */
  facts: z.record(z.string(), Provenance.extend({ value: z.unknown() })),
  /** Tie conflicts: other candidates kept next to the chosen fact. */
  alternatives: z.record(z.string(), z.array(Provenance.extend({ value: z.unknown() }))),
  aliases: z.array(z.string()),
  /** Other catalogue ids merged into this one (true duplicates). */
  merged_ids: z.array(z.string()),
  collectors: z.array(z.string()),
});
export type CuratedRecord = z.infer<typeof CuratedRecord>;

/** What an adapter emits: one candidate value for one field of one university. */
export interface Observation<F extends FieldName = FieldName> {
  university_id: string | null;
  slug?: string | null;
  name?: string | null;
  country_code?: string | null;
  field: F;
  value: FieldValue<F>;
  source_url: string | null;
  retrieved_at: string | null;
  method: Method;
  collector: string;
  verified: boolean;
  academic_year: string | null;
  flags: string[];
  note: string | null;
  /** Value computed from other values (confidence capped). */
  derived?: boolean;
  /** File the observation came from (for the run report). */
  input: string;
}

export function validateFieldValue(field: FieldName, value: unknown): string | null {
  const r = FIELD_SCHEMAS[field].safeParse(value);
  return r.success ? null : r.error.issues.map((i) => `${i.path.join(".") || field}: ${i.message}`).join("; ");
}

/** Start year of "2026/27" → 2026. */
export const yearStart = (ay: string | null | undefined) => (ay && /^\d{4}/.test(ay) ? Number(ay.slice(0, 4)) : null);
