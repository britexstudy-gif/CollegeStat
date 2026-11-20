import type { RankHighlight } from "./ranking-highlights";

// Stable dataset shapes keep compiler work independent of the number of rows.
export type DirectoryRecord = {
  id: string;
  slug: string;
  name: string;
  country_code: string;
  country: string;
  website: string;
  state?: string | null;
  domains: string[];
  ror?: string;
  identity_source?: string;
  identity_release?: string;
  identity_retrieved_at?: string;
  founded_year?: number;
  aliases?: string[];
  external_ids?: Record<string, string>;
  application_url?: string;
  financial_aid_url?: string;
  net_price_url?: string;
  address?: string;
  phone?: string;
  current_observations?: {
    metric: string;
    value: number;
    unit: string;
    table: string;
    year: number;
    period: string;
    cohort: string;
  }[];
  unitid?: string;
  city?: string;
  university_type?: string;
  latitude?: number;
  longitude?: number;
  admissions_url?: string;
  tuition_in_state?: number;
  tuition_out_of_state?: number;
  fees_out_of_state?: number;
  room_board_on_campus?: number;
  enrollment_12_month?: number;
  nonresident_enrollment_12_month?: number;
  acceptance_rate?: number;
  applicants?: number;
  admitted?: number;
  act_25?: number;
  act_75?: number;
  sat_reading_25?: number;
  sat_reading_75?: number;
  sat_math_25?: number;
  sat_math_75?: number;
  /** Scorecard TUITIONFEE_OUT (tuition + required fees); see field_sources for its year. */
  tuition_fees_out_of_state?: number;
  /** Per-field provenance for values refreshed after IPEDS 2023 (e.g. Scorecard 2025/26). */
  field_sources?: Record<string, { academic_year: string; source: string; source_url: string; retrieved_at: string }>;
  /** false = hidden (excluded by data-ops; kept, never deleted). Absent = published. */
  published?: boolean;
  exclusion?: { reason: string; detail: string; decided_at: string; merged_into?: string };
};

export type PublishedRankingRecord = Omit<RankHighlight, "domain"> & {
  name: string;
  country: string;
  country_code: string;
  university_id: string | null;
  logo_url?: string | null;
};
