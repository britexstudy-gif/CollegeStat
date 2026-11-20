import { withReviewedCampusMedia } from "./reviewed-campus-media";
import { withReviewedProgrammeOffers } from "./reviewed-programme-offers";
import type { ReportedProgram, ResearchIdentity } from "./profile-library";
import directoryCountries from "@/data/published/directory-countries.json";
export type Verification =
  "verified" | "needs_review" | "outdated" | "missing_source";
export type Source = {
  id: string;
  name: string;
  organization: string | null;
  url: string;
  source_type: string;
  license_notes: string | null;
  retrieved_at: string | null;
};
export type Sourced = {
  evidence?: {
    university_wide?: boolean;
    scope?: string;
    population?: string;
    reporting_period?: string;
    publication_year?: number | null;
    retrieved_at?: string;
    source_record_id?: string;
    raw_field?: string;
    raw_value?: unknown;
    dataset_sha256?: string;
    dictionary_url?: string;
    license_note?: string;
    [key: string]: unknown;
  };
  source_url?: string;
  id: string;
  year: number | null;
  source_id: string | null;
  verification_status: Verification;
  verified_at: string | null;
  notes: string | null;
  canonical?: boolean;
  confidence?: "high" | "medium" | "low";
  data_sources?: Source | null;
};
export type DataPoint = Sourced & {
  university_id: string;
  metric: string;
  value: number | null;
  text_value: string | null;
  unit: string | null;
};
export type Cost = Sourced & {
  university_id: string;
  category: string;
  amount: number;
  currency: string;
  period: string;
  student_category: string;
  program_id: string | null;
};
export type Admission = Sourced & {
  university_id: string;
  program_id: string | null;
  acceptance_rate: number | null;
  sat_min: number | null;
  sat_max: number | null;
  act_min?: number | null;
  act_max?: number | null;
  ielts_min: number | null;
  toefl_min: number | null;
  requirements: string | null;
  language: string | null;
  deadline: string | null;
  application_fee: number | null;
};
export type Program = {
  id: string;
  name: string;
  subject: string;
  degree_level: string;
  language: string | null;
};
export type ProgramOffer = { programs: Program; university_id?: string; reporting_year?: number | null; duration_months?: number | null; campus_id?: string | null; intakes?: string[]; availability?: string } & Partial<Sourced>;
export type ResearchMetric = {
  id: string; university_id: string; metric: string; value: number; unit: string | null;
  period: string; field: string | null; edition: string | null; source_id?: string;
  source_url: string; retrieved_at: string; last_verified_at?: string; verification_status: Verification;
  evidence?: Sourced['evidence']; notes?: string | null;
};
export type RankingProvider = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  license_status: string;
  methodology: string | null;
};
export type RankingEdition = {
  id: string;
  provider_id: string;
  year: number;
  subject: string;
  region: string;
  permitted: boolean;
  ranking_providers?: RankingProvider;
};
export type RankingEntry = Sourced & {
  university_id: string;
  edition_id: string;
  rank: number | null;
  rank_label: string | null;
  score: number | null;
  ranking_editions?: RankingEdition;
};
export type Department = Sourced & {
  university_id: string;
  name: string;
  official_url: string;
};
export type Professor = Sourced & {
  university_id: string;
  name: string;
  title: string | null;
  department_id: string | null;
  research_areas: string[];
  profile_url: string;
  biography: string | null;
};
export type Research = Sourced & {
  university_id: string;
  title: string;
  department_id: string | null;
  research_areas: string[];
  summary: string | null;
  official_url: string;
};
export type Deadline = Sourced & {
  university_id: string;
  title: string;
  student_category: string;
  cycle: string;
  due_at: string;
  due_date?: string | null;
  timezone: string;
  application_url: string;
};
export type Requirement = Sourced & {
  university_id: string;
  program_id?: string | null;
  kind: string;
  label: string;
  minimum: number | null;
  maximum: number | null;
  student_category: string;
  required: boolean | null;
};
export type FinancialAid = Sourced & {
  university_id: string;
  name: string;
  eligibility: string;
  student_category: string;
  application_url: string;
  amount: number | null;
  currency: string | null;
};
export type Media = Sourced & {
  university_id: string;
  professor_id: string | null;
  kind: "campus" | "logo" | "faculty";
  url: string;
  alt: string;
  creator: string;
  license: string;
  license_url: string;
  reuse_permitted: boolean;
  width: number | null;
  height: number | null;
};
export type ImportedRecord = {
  id: string;
  source: string;
  source_name: string;
  source_record_id: string;
  source_url: string;
  release: string;
  reporting_year: number | null;
  period: string | null;
  cohort: string | null;
  retrieved_at: string | null;
  last_verified_at: string | null;
  license_note: string;
  metric: string;
  value: number | string;
  unit: string | null;
  notes: string | null;
  verification_status: Verification;
  publication_status: "published" | "review";
  imputation_flag?: string;
};
export type OfficialVideo = {
  youtube_id: string;
  title: string;
  kind: "campus_tour" | "admissions" | "student_life" | "introduction" | string;
  channel: string;
  channel_url: string;
  source_url: string;
  checked_at: string;
};
export type University = {
  /** Verified essentials 0-3, precomputed for card rows (lib/coverage.ts). */
  coverage?: number;
  official_videos?: OfficialVideo[];
  /** Reviewed background facts (server-attached). */
  history?: UniversityHistory;
  /** Server-resolved official site icon URL (see server/auto-logos.ts); null = none exists. */
  auto_logo?: string | null;
  /** Reviewed founding year (server-attached) so Compare reads what the profile's Established row shows. */
  reviewed_identity?: { founded_year: number };
  /** Present on a lite profile: the long lists were left out of the page and
   * these counts stand in for them until the section is opened (lib/profile-defer.ts). */
  deferred?: { official_programmes: number; current_programmes: number };
  us_stats?: USStats;
  scorecard?: ScorecardFacts;
  /** Latest US federal figures with their academic year (review/scorecard-2026-11.json). */
  us_current?: UsCurrentFacts;
  common_app?: CommonAppProfile;
  cds?: CommonDataSet;
  rankings?: import('./ranking-highlights').RankHighlight[];
  profile_resources?: Partial<Pick<University, 'reported_programs' | 'research_identity' | 'publisher_students' | 'official_web' | 'application_brief' | 'admission_summary' | 'social_links' | 'contact_email' | 'contact_source_url' | 'social_source_url' | 'institution_image_url'>>;
  reported_programs?: ReportedProgram[];
  admission_summary?: {year:number;cohort:string;applicants:number;admitted:number;enrolled:number;source_url:string;checked_at:string} | null;
  application_brief?: {checked_at:string;scope?:string;requirements_source:string;requirements:string[];scholarships:{name:string;eligibility:string;url:string}[]} | null;
  website_icon_url?: string | null;
  official_web?: {source_url:string;checked_at:string;links:Record<string,{url:string;label:string}>} | null;
  research_identity?: ResearchIdentity | null;
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  country_code: string;
  city: string | null;
  region: string | null;
  website: string | null;
  logo_url: string | null;
  logo_source_url?: string | null;
  logo_usage_notes?: string | null;
  university_type: string | null;
  founded_year: number | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  brand_color?: string;
  published: boolean;
  reference_url?: string;
  reference_retrieved_at?: string;
  admissions_url?: string | null;
  application_url?: string | null;
  financial_aid_url?: string | null;
  net_price_url?: string | null;
  address?: string | null;
  phone?: string | null;
  identity_release?: string | null;
  contact_email?: string | null;
  institution_image_url?: string | null;
  publisher_students?: {
    evidence?: Sourced["evidence"];
    subjects?: string[];
    edition: number;
    source_url: string;
    students: number | null;
    student_staff_ratio: number | null;
    international_percent: number | null;
    female_male_ratio: string | null;
  } | null;
  social_source_url?: string | null;
  contact_source_url?: string | null;
  social_links?: { label: string; url: string; source_url: string }[];
  departments: Department[];
  professors: Professor[];
  research: Research[];
  deadlines: Deadline[];
  requirements: Requirement[];
  research_metrics?: ResearchMetric[];
  financial_aid: FinancialAid[];
  media: Media[];
  university_scholarships: { scholarships: Scholarship | null }[];
  data_points: DataPoint[];
  costs: Cost[];
  admissions: Admission[];
  university_programs: ProgramOffer[];
  ranking_entries: RankingEntry[];
  campuses: { id: string; name: string; city: string | null }[];
  imported_records?: ImportedRecord[];
  identifiers?: Record<string, string | null>;
  aliases?: string[];
};
export type Scholarship = Sourced & {
  slug?: string | null;
  name: string;
  description: string | null;
  amount: number | null;
  currency: string;
  funding_type: string;
  country_code: string | null;
  level: string;
  international: boolean | null;
  deadline: string | null;
  application_url: string | null;
  published: boolean;
  university_scholarships: { university_id: string; universities?: { id: string; name: string; slug: string } | null }[];
};
export const countries: Record<string, string> = {
  ...directoryCountries,
  US: "United States",
  GB: "United Kingdom",
  DE: "Germany",
  CA: "Canada",
  UZ: "Uzbekistan",
  CH: "Switzerland",
  SG: "Singapore",
  AU: "Australia",
  FR: "France",
  JP: "Japan",
  KR: "South Korea",
  NL: "Netherlands",
  IT: "Italy",
};
export const countryName = (code: string) => countries[code] || code;
export const latest = <T extends { year: number | null }>(records: T[]) =>
  [...records].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];
export const metric = (u: University, key: string) =>
  latest(u.data_points.filter((p) => p.metric === key));
export const tuition = (u: University) =>
  latest(
    u.costs.filter(
      (c) =>
        !c.program_id &&
        c.category === "tuition" &&
        c.period === "year" &&
        c.student_category === "international",
    ),
  );
export const admission = (u: University) =>
  latest(u.admissions.filter((a) => !a.program_id));
export const ranking = (u: University) =>
  latest(
    u.ranking_entries.filter(
      (r) =>
        r.ranking_editions?.permitted &&
        r.ranking_editions?.subject === "Overall" &&
        r.ranking_editions?.region === "Global",
    ),
  );
export const currency = (
  value: number | null | undefined,
  code = "USD",
  compact = false,
) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: code,
        maximumFractionDigits: 0,
        ...(compact ? { notation: "compact" as const } : {}),
      }).format(value);
export const number = (value: number | null | undefined, suffix = "") =>
  value == null ? "—" : new Intl.NumberFormat("en-US").format(value) + suffix;
export const dateLabel = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not available";
/** A same-origin, path-only return URL; anything else becomes /dashboard. */
export function safeNext(value: string | null) {
  if (
    !value ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    // Browsers drop tabs and newlines inside URLs, so "/\t/evil.com" would become "//evil.com".
    /[\u0000-\u001f\u007f\s]/.test(value)
  )
    return "/dashboard";
  try {
    const base = "https://collegestat.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return "/dashboard";
    const path = url.pathname + url.search + url.hash;
    return path.startsWith("/auth/") ? "/dashboard" : path;
  } catch {
    return "/dashboard";
  }
}
const publishedEvidence = <T extends Sourced>(rows: T[] | undefined) =>
  (rows ?? []).filter(
    (r) =>
      r.verification_status === "verified" &&
      r.canonical !== false &&
      r.source_id &&
      r.verified_at,
  );
export const normalizeUniversity = (u: Partial<University>): University =>
  ({
    ...u.profile_resources,
    ...u,
    data_points: publishedEvidence(u.data_points),
    costs: publishedEvidence(u.costs),
    admissions: publishedEvidence(u.admissions),
    university_programs: withReviewedProgrammeOffers(u.id, (u.university_programs ?? []).filter(
      (p) =>
        p.verification_status === "verified" && p.source_id && p.verified_at,
    )),
    ranking_entries: publishedEvidence(u.ranking_entries),
    campuses: u.campuses ?? [],
    departments: publishedEvidence(u.departments),
    professors: publishedEvidence(u.professors),
    research: publishedEvidence(u.research),
    deadlines: publishedEvidence(u.deadlines).map(d => ({ ...d, due_at: d.due_date || d.due_at })),
    requirements: publishedEvidence(u.requirements),
    research_metrics: (u.research_metrics ?? []).filter(r => r.verification_status === 'verified' && r.source_url?.startsWith('https://') && r.retrieved_at),
    financial_aid: publishedEvidence(u.financial_aid),
    media: withReviewedCampusMedia(u.id, publishedEvidence(u.media).filter((m) => m.reuse_permitted)),
    university_scholarships: (u.university_scholarships ?? []).filter(
      (l) =>
        l.scholarships?.published &&
        l.scholarships.verification_status === "verified",
    ),
  }) as University;

export const languageMinimum = (u: University, kind: string) =>
  latest(u.requirements.filter((r) => r.kind === kind && !r.program_id && r.evidence?.university_wide !== false))
    ?.minimum ??
  (kind === "IELTS" ? admission(u)?.ielts_min : null) ??
  null;

export type USEnrollment = {
  total: number;
  men: number | null;
  women: number | null;
  race: Record<string, number>;
};
/** NCES IPEDS 2023 facts for US universities. */
export type USStats = {
  app_fee_ug?: number | null;
  app_fee_grad?: number | null;
  tuition_in_state?: number | null;
  fees_in_state?: number | null;
  tuition_out_state?: number | null;
  fees_out_state?: number | null;
  tuition_grad_in_state?: number | null;
  tuition_grad_out_state?: number | null;
  room_board?: number | null;
  books?: number | null;
  enrollment?: { all?: USEnrollment; undergraduate?: USEnrollment; graduate?: USEnrollment };
  student_faculty_ratio?: number | null;
  retention_full_time?: number | null;
  programs?: [string, string, number][];
  program_count?: number;
};
/** US Department of Education College Scorecard (most recent release). */
export type UsCurrentFacts = {
  academic_year: string;
  source: string;
  retrieved_at: string;
  tuition_fees_in_state?: number | null;
  tuition_fees_out_of_state?: number | null;
  cost_of_attendance?: number | null;
  acceptance_rate?: number | null;
  sat_reading_25?: number | null;
  sat_reading_75?: number | null;
  sat_math_25?: number | null;
  sat_math_75?: number | null;
  sat_avg?: number | null;
  act_25?: number | null;
  act_75?: number | null;
  undergrads?: number | null;
  international_share?: number | null;
  grad_rate?: number | null;
  median_earnings_10y?: number | null;
  net_price_private?: number | null;
  net_price_public?: number | null;
  bachelor_fields?: string[];
};
export type ScorecardFacts = {
  net_price?: number;
  net_price_by_income?: Record<string, number>;
  cost_of_attendance?: number;
  earnings_1yr?: number;
  earnings_6yr?: number;
  earnings_10yr?: number;
  earning_above_hs_pct?: number;
  median_debt?: number;
  completion_4yr_pct?: number;
  completion_6yr_pct?: number;
  retention_pct?: number;
  pell_pct?: number;
  federal_loan_pct?: number;
  international_pct?: number;
  undergrads?: number;
  student_faculty_ratio?: number;
  sat_avg?: number;
  act_mid?: number;
  admission_rate_pct?: number;
  endowment?: number;
  net_price_calculator?: string;
};
/** Public Common App member profile: what applying through Common App needs. */
export type CommonAppProfile = {
  url: string;
  test_flexible: boolean | null;
  charges_fee: boolean | null;
  essay_required: boolean | null;
  recs_required: boolean | null;
  self_reported_scores: boolean | null;
  transfer: boolean;
  need_aid: boolean | null;
  merit_aid: boolean | null;
  international_aid: boolean | null;
  first_year_note?: string;
  majors?: string[];
  student_life?: string[];
  setting?: string;
  size?: string;
  designations?: string[];
};
type CDSFactor = "very_important" | "important" | "considered" | "not_considered" | null;
/** Figures copied from the university's own Common Data Set. */
export type CommonDataSet = {
  cds_year: string;
  cds_url: string;
  applicants?: { men?: number | null; women?: number | null; total?: number | null };
  admitted?: { men?: number | null; women?: number | null; total?: number | null };
  enrolled_first_year?: number | null;
  waitlist?: { offered?: number | null; accepted_place?: number | null; admitted?: number | null };
  factors?: Record<string, CDSFactor>;
  test_policy?: string | null;
  pct_submitting_sat?: number | null;
  pct_submitting_act?: number | null;
  sat_composite?: (number | null)[] | null;
  act_composite?: (number | null)[] | null;
  class_rank?: { top10_pct?: number | null; top25_pct?: number | null };
  gpa_distribution?: Record<string, number | null>;
  avg_gpa?: number | null;
  application_fee?: number | null;
  deadlines?: Record<string, string | null>;
};
export type UniversityHistory = {
  founded_year: number | null;
  type: "public" | "private" | "other" | null;
  history: string;
  known_for: string[] | null;
  students_total: number | null;
  students_year: string | null;
  international_students_pct: number | null;
  campus_setting: "urban" | "suburban" | "rural" | "multiple" | null;
  motto: string | null;
  sources: { url: string; label: string }[];
};
