/** Row types for the v2 schema (supabase/proposals/20261115_data_v2.sql).
 * Dates are ISO strings (`YYYY-MM-DD`), numerics are numbers, jsonb is typed loosely. */
import type { CostCategory, DeadlineRound, Platform, RequirementKind } from "./schema";

export type Uuid = string;
export type IsoDate = string;

/** Per-field provenance: which source and method produced each field of a row. */
export type Provenance = Record<string, { source_id?: Uuid; retrieved_at?: IsoDate; method?: string; origin?: string }>;

export type RequirementStatus = "required" | "optional" | "not_required" | "conditional" | "unknown";
export type DegreeLevel = "Foundation" | "Bachelor" | "Master" | "Doctorate" | "Diploma" | "Other";
export type VerificationStatus = "staged" | "verified";

export interface SourceRow {
  id: Uuid;
  url: string;
  title: string | null;
  publisher: string | null;
  source_type: "official" | "government" | "ranking" | "registry" | "media" | "aggregator" | "provider" | "other";
  licence: string | null;
  retrieved_at: IsoDate;
  method: string | null;
  created_at?: string;
}

export interface UniversityRow {
  id: Uuid;
  slug: string;
  name: string;
  short_name: string | null;
  country_code: string;
  city: string | null;
  region: string | null;
  website: string | null;
  university_type: "Public" | "Private" | "Other" | null;
  founded_year: number | null;
  latitude: number | null;
  longitude: number | null;
  aliases: string[];
  is_target: boolean;
  target_rank: number | null;
  published: boolean;
  source_id: Uuid | null;
  provenance: Provenance;
  updated_at?: string;
}

export interface ProgrammeRow {
  id: Uuid;
  university_id: Uuid;
  name: string;
  field: string | null;
  degree_level: DegreeLevel;
  award: string | null;
  duration_years: number | null;
  language: string | null;
  intake_terms: string[];
  url: string | null;
  verification_status: VerificationStatus;
  source_id: Uuid | null;
  provenance: Provenance;
}

export interface MediaRow {
  id: Uuid;
  university_id: Uuid;
  kind: "logo" | "campus" | "photo" | "video";
  url: string;
  youtube_id: string | null;
  title: string | null;
  alt: string | null;
  creator: string | null;
  licence: string | null;
  licence_url: string | null;
  width: number | null;
  height: number | null;
  surface: "light" | "dark" | null;
  sort_order: number;
  source_id: Uuid | null;
  provenance: Provenance;
}

export interface RankingRow {
  id: Uuid;
  university_id: Uuid;
  publisher: string;
  edition_year: number;
  subject: string;
  region: string;
  rank: number | null;
  rank_label: string;
  is_band: boolean;
  score: string | null;
  url: string | null;
  source_id: Uuid | null;
}

export interface AdmissionRow {
  id: Uuid;
  university_id: Uuid;
  intake_year: number;
  intake_term: "fall" | "spring" | "winter" | "summer" | "rolling" | "any";
  cohort_label: string | null;
  applicants: number | null;
  admitted: number | null;
  enrolled: number | null;
  acceptance_rate: number | null;
  platform: Platform | null;
  platform_note: string | null;
  application_fee: number | null;
  application_fee_currency: string | null;
  sat_act_policy: "required" | "optional" | "not_considered" | "recommended" | "unknown" | null;
  sat_min: number | null;
  sat_max: number | null;
  act_min: number | null;
  act_max: number | null;
  english_waiver_note: string | null;
  foundation_year: string | null;
  aid_for_internationals: boolean | null;
  aid_note: string | null;
  source_id: Uuid | null;
  provenance: Provenance;
}

export interface DeadlineRow {
  id: Uuid;
  university_id: Uuid;
  intake_year: number;
  round: DeadlineRound;
  round_label: string;
  due_date: IsoDate | null;
  due_date_inferred: boolean;
  due_text: string | null;
  timezone: string | null;
  application_url: string | null;
  source_id: Uuid;
  provenance: Provenance;
}

export interface CostRow {
  id: Uuid;
  university_id: Uuid;
  programme_id: Uuid | null;
  academic_year: string;
  category: CostCategory;
  student_category: "international" | "in_state" | "out_of_state" | "domestic" | "all";
  amount: number | null;
  range_min: number | null;
  range_max: number | null;
  currency: string;
  period: "year" | "semester" | "term" | "credit" | "month" | "total";
  amount_usd: number | null;
  fx_rate_usd: number | null;
  fx_date: IsoDate | null;
  basis: string | null;
  varies_by_programme: boolean | null;
  source_id: Uuid;
  provenance: Provenance;
}

export interface ApplicationRequirementRow {
  id: Uuid;
  university_id: Uuid;
  intake_year: number | null;
  kind: RequirementKind;
  status: RequirementStatus;
  label: string;
  minimum: number | null;
  component_minimum: number | null;
  note: string | null;
  source_id: Uuid;
  provenance: Provenance;
}

export interface ProgrammeRequirementRow {
  id: Uuid;
  programme_id: Uuid;
  kind: RequirementKind;
  status: RequirementStatus;
  label: string;
  minimum: number | null;
  component_minimum: number | null;
  note: string | null;
  source_id: Uuid;
  provenance: Provenance;
}

export interface ScholarshipRow {
  id: Uuid;
  slug: string;
  name: string;
  provider: string | null;
  description: string | null;
  country_code: string | null;
  level: string | null;
  funding_type: "full" | "partial" | "tuition" | "stipend" | "other" | null;
  amount: number | null;
  currency: string | null;
  amount_note: string | null;
  coverage: Record<string, boolean | string | null>;
  eligible_nationalities: string | null;
  central_asia_eligible: boolean | null;
  deadline: IsoDate | null;
  deadline_note: string | null;
  application_url: string | null;
  intake_year: number | null;
  published: boolean;
  verification_status: VerificationStatus;
  source_id: Uuid;
  provenance: Provenance;
}

export interface ScholarshipUniversityRow {
  scholarship_id: Uuid;
  university_id: Uuid;
  source_id: Uuid | null;
}

export interface EssayPromptRow {
  id: Uuid;
  university_id: Uuid | null;
  scholarship_id: Uuid | null;
  platform: "common_app" | "ucas" | "coalition" | "direct" | "other" | null;
  intake_year: number;
  prompt: string;
  word_limit: number | null;
  required: boolean;
  sort_order: number;
  source_id: Uuid;
}

// ── Student ──

export type GradeSystem = "five_point" | "percent" | "gpa_4" | "gpa_5" | "ib" | "a_level" | "ten_point" | "twelve_point" | "other";

export interface ProfileRow {
  user_id: Uuid;
  display_name: string | null;
  citizenship: string | null;
  residence_country: string | null;
  school_name: string | null;
  graduation_year: number | null;
  intake_year: number | null;
  grade_system: GradeSystem | null;
  grades_raw: { year?: number; subject?: string; value: number | string; scale?: string }[];
  grade_normalized: number | null;
  gpa_4: number | null;
  tests: { kind: string; score?: number; sections?: Record<string, number>; taken_at?: IsoDate; planned?: boolean }[];
  activities: { title: string; role?: string; hours_per_week?: number; years?: number }[];
  honours: { title: string; level?: string; year?: number }[];
  dream_countries: string[];
  intended_majors: string[];
  budget_usd_per_year: number | null;
  needs_aid: boolean | null;
  created_at?: string;
  updated_at?: string;
}

export type MyCollegeStatus =
  | "saved" | "researching" | "shortlisted" | "applying" | "applied" | "admitted" | "waitlisted" | "rejected" | "enrolled" | "dropped";

export interface MyCollegeRow {
  user_id: Uuid;
  university_id: Uuid;
  status: MyCollegeStatus;
  fit: "reach" | "target" | "safety" | null;
  notes: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface ApplicationRow {
  id: Uuid;
  user_id: Uuid;
  university_id: Uuid;
  programme_id: Uuid | null;
  deadline_id: Uuid | null;
  intake_year: number;
  round: string;
  platform: Platform | null;
  status: "planning" | "in_progress" | "submitted" | "interview" | "admitted" | "waitlisted" | "rejected" | "withdrawn";
  submitted_at: string | null;
  decision_at: string | null;
  fee_paid: boolean;
  checklist: { label: string; done: boolean }[];
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EssayRow {
  id: Uuid;
  user_id: Uuid;
  application_id: Uuid | null;
  prompt_id: Uuid | null;
  title: string;
  body: string;
  word_count: number;
  status: "draft" | "review" | "final";
  created_at?: string;
  updated_at?: string;
}

/** One row of the v2.university_facts view. */
export interface UniversityFactsRow {
  id: Uuid;
  slug: string;
  name: string;
  short_name: string | null;
  country_code: string;
  region: string | null;
  city: string | null;
  university_type: string | null;
  aliases: string[];
  is_target: boolean;
  target_rank: number | null;
  tuition_usd: number | null;
  tuition_year: string | null;
  ielts_min: number | null;
  platform: Platform | null;
  acceptance_rate: number | null;
  qs_rank: number | null;
  the_rank: number | null;
  arwu_rank: number | null;
  next_deadline: IsoDate | null;
}

/** Filters accepted by public.explore_universities_v2. */
export interface ExploreV2Filters {
  q?: string;
  countries?: string[];
  region?: string;
  city?: string;
  type?: string;
  platform?: Platform;
  program?: string;
  degree?: DegreeLevel;
  language?: string;
  scholarships?: boolean;
  targets?: boolean;
  ielts_max?: number;
  tuition_max?: number;
  admission_min?: number;
  admission_max?: number;
  sort?: "rank" | "rank_desc" | "name" | "tuition" | "tuition_desc" | "admission" | "admission_desc" | "rank_the" | "rank_arwu" | "deadline";
}

export interface ExploreV2Result {
  ids: Uuid[];
  total: number;
  medianTuition: number | null;
  medianAdmission: number | null;
  countries: number;
}
