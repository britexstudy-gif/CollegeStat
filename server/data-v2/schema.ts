/** Column order of every v2 table, exactly as in
 * supabase/proposals/20261115_data_v2.sql. The ingest scripts write CSV in this
 * order (COPY needs it) and tests/data-v2.test.ts fails if the SQL drifts. */
export const CATALOGUE_COLUMNS = {
  sources: ["id", "url", "title", "publisher", "source_type", "licence", "retrieved_at", "method", "created_at"],
  universities: [
    "id", "slug", "name", "short_name", "country_code", "city", "region", "website", "university_type",
    "founded_year", "latitude", "longitude", "aliases", "is_target", "target_rank", "published", "source_id",
    "provenance", "updated_at",
  ],
  programmes: [
    "id", "university_id", "name", "field", "degree_level", "award", "duration_years", "language",
    "intake_terms", "url", "verification_status", "source_id", "provenance",
  ],
  university_media: [
    "id", "university_id", "kind", "url", "youtube_id", "title", "alt", "creator", "licence", "licence_url",
    "width", "height", "surface", "sort_order", "source_id", "provenance",
  ],
  rankings: [
    "id", "university_id", "publisher", "edition_year", "subject", "region", "rank", "rank_label", "is_band",
    "score", "url", "source_id",
  ],
  admissions: [
    "id", "university_id", "intake_year", "intake_term", "cohort_label", "applicants", "admitted", "enrolled",
    "acceptance_rate", "platform", "platform_note", "application_fee", "application_fee_currency",
    "sat_act_policy", "sat_min", "sat_max", "act_min", "act_max", "english_waiver_note", "foundation_year",
    "aid_for_internationals", "aid_note", "source_id", "provenance",
  ],
  deadlines: [
    "id", "university_id", "intake_year", "round", "round_label", "due_date", "due_date_inferred", "due_text",
    "timezone", "application_url", "source_id", "provenance",
  ],
  costs: [
    "id", "university_id", "programme_id", "academic_year", "category", "student_category", "amount",
    "range_min", "range_max", "currency", "period", "amount_usd", "fx_rate_usd", "fx_date", "basis",
    "varies_by_programme", "source_id", "provenance",
  ],
  application_requirements: [
    "id", "university_id", "intake_year", "kind", "status", "label", "minimum", "component_minimum", "note",
    "source_id", "provenance",
  ],
  programme_requirements: [
    "id", "programme_id", "kind", "status", "label", "minimum", "component_minimum", "note", "source_id",
    "provenance",
  ],
  scholarships: [
    "id", "slug", "name", "provider", "description", "country_code", "level", "funding_type", "amount",
    "currency", "amount_note", "coverage", "eligible_nationalities", "central_asia_eligible", "deadline",
    "deadline_note", "application_url", "intake_year", "published", "verification_status", "source_id",
    "provenance",
  ],
  scholarship_universities: ["scholarship_id", "university_id", "source_id"],
  essay_prompts: [
    "id", "university_id", "scholarship_id", "platform", "intake_year", "prompt", "word_limit", "required",
    "sort_order", "source_id",
  ],
} as const;

export const STUDENT_COLUMNS = {
  profiles: [
    "user_id", "display_name", "citizenship", "residence_country", "school_name", "graduation_year",
    "intake_year", "grade_system", "grades_raw", "grade_normalized", "gpa_4", "tests", "activities", "honours",
    "dream_countries", "intended_majors", "budget_usd_per_year", "needs_aid", "created_at", "updated_at",
  ],
  my_colleges: ["user_id", "university_id", "status", "fit", "notes", "sort_order", "created_at", "updated_at"],
  applications: [
    "id", "user_id", "university_id", "programme_id", "deadline_id", "intake_year", "round", "platform",
    "status", "submitted_at", "decision_at", "fee_paid", "checklist", "notes", "created_at", "updated_at",
  ],
  essays: [
    "id", "user_id", "application_id", "prompt_id", "title", "body", "word_count", "status", "created_at",
    "updated_at",
  ],
} as const;

export type CatalogueTable = keyof typeof CATALOGUE_COLUMNS;
export type StudentTable = keyof typeof STUDENT_COLUMNS;
export type V2Table = CatalogueTable | StudentTable;

/** COPY order: parents before children. */
export const LOAD_ORDER: CatalogueTable[] = [
  "sources", "universities", "programmes", "university_media", "rankings", "admissions", "deadlines", "costs",
  "application_requirements", "programme_requirements", "scholarships", "scholarship_universities",
  "essay_prompts",
];

export const PLATFORMS = [
  "common_app", "ucas", "coalition", "direct", "national_portal", "studielink", "uni_assist", "universitaly", "other",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const DEADLINE_ROUNDS = [
  "early_action", "restrictive_early_action", "early_decision", "early_decision_2", "regular", "priority",
  "rolling", "first_round", "second_round", "third_round", "scholarship", "document", "open", "close", "other",
] as const;
export type DeadlineRound = (typeof DEADLINE_ROUNDS)[number];

export const REQUIREMENT_KINDS = [
  "IELTS", "TOEFL", "DUOLINGO", "PTE", "CAMBRIDGE", "SAT", "ACT", "AP", "IB", "A_LEVEL", "ENGLISH_WAIVER",
  "TRANSCRIPT", "RECOMMENDATION", "ESSAY", "CV", "PORTFOLIO", "INTERVIEW", "ENTRANCE_EXAM", "OTHER",
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export const COST_CATEGORIES = [
  "tuition", "mandatory_fees", "living", "housing", "room_board", "food", "books", "personal", "insurance", "total",
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];
