/** Typed reads for the v2 schema. Not wired into the app yet: everything here
 * takes a client, so it works with a Supabase client (`createClient(...)`) or a
 * test double. RLS does the access control; these functions only shape queries. */
import { PLATFORMS } from "./schema";
import type {
  AdmissionRow, ApplicationRequirementRow, CostRow, DeadlineRow, ExploreV2Filters, ExploreV2Result,
  MediaRow, MyCollegeRow, ProgrammeRow, RankingRow, ScholarshipRow, UniversityRow, Uuid,
} from "./types";

type QueryError = { message: string } | null;
type Rows = { data: unknown[] | null; error: QueryError };

/** The subset of the supabase-js query builder these reads use. */
export interface V2Query extends PromiseLike<Rows> {
  eq(column: string, value: unknown): V2Query;
  in(column: string, values: readonly unknown[]): V2Query;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): V2Query;
  limit(count: number): V2Query;
}
export interface V2Client {
  schema(name: "v2"): { from(table: string): { select(columns?: string): V2Query } };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: QueryError }>;
}

export class DataV2Error extends Error {}

async function rows<T>(query: PromiseLike<Rows>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new DataV2Error(error.message);
  return (data ?? []) as T[];
}
const from = (client: V2Client, table: string) => client.schema("v2").from(table);

// ── Explorer ──

/** Turns typed filters into the jsonb the RPC accepts; throws on values the RPC would reject. */
export function toRpcFilters(filters: ExploreV2Filters): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const text = (key: string, value: string | undefined) => {
    const v = value?.trim();
    if (!v) return;
    if (v.length > 200) throw new DataV2Error(key + " is too long");
    out[key] = v;
  };
  const num = (key: string, value: number | undefined, max: number) => {
    if (value === undefined) return;
    if (!Number.isFinite(value) || value < 0 || value > max) throw new DataV2Error(key + " is out of range");
    out[key] = value;
  };
  text("q", filters.q);
  if (filters.countries?.length) {
    const codes = [...new Set(filters.countries.map((c) => c.trim().toUpperCase()))];
    if (codes.some((c) => !/^[A-Z]{2}$/.test(c))) throw new DataV2Error("countries must be ISO 3166 alpha-2 codes");
    out.countries = codes.join(",");
  }
  text("region", filters.region);
  text("city", filters.city);
  text("type", filters.type);
  if (filters.platform) {
    if (!(PLATFORMS as readonly string[]).includes(filters.platform)) throw new DataV2Error("unknown platform");
    out.platform = filters.platform;
  }
  text("program", filters.program);
  text("degree", filters.degree);
  text("language", filters.language);
  if (filters.scholarships) out.scholarships = "true";
  if (filters.targets) out.targets = "true";
  num("ielts_max", filters.ielts_max, 9);
  num("tuition_max", filters.tuition_max, 1_000_000);
  num("admission_min", filters.admission_min, 100);
  num("admission_max", filters.admission_max, 100);
  text("sort", filters.sort);
  return out;
}

export async function exploreUniversitiesV2(client: V2Client, filters: ExploreV2Filters, page = 1): Promise<ExploreV2Result> {
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new DataV2Error("page is out of range");
  const { data, error } = await client.rpc("explore_universities_v2", { filters: toRpcFilters(filters), page_number: page });
  if (error) throw new DataV2Error(error.message);
  const r = (data ?? {}) as Partial<ExploreV2Result>;
  return {
    ids: Array.isArray(r.ids) ? r.ids : [],
    total: Number(r.total ?? 0),
    medianTuition: r.medianTuition == null ? null : Number(r.medianTuition),
    medianAdmission: r.medianAdmission == null ? null : Number(r.medianAdmission),
    countries: Number(r.countries ?? 0),
  };
}

// ── Catalogue ──

export async function getUniversityBySlug(client: V2Client, slug: string): Promise<UniversityRow | null> {
  const [row] = await rows<UniversityRow>(from(client, "universities").select("*").eq("slug", slug).limit(1));
  return row ?? null;
}

export interface UniversityDetail {
  university: UniversityRow;
  admissions: AdmissionRow[];
  deadlines: DeadlineRow[];
  costs: CostRow[];
  requirements: ApplicationRequirementRow[];
  programmes: ProgrammeRow[];
  media: MediaRow[];
  rankings: RankingRow[];
}

/** Everything the university page needs, in one round of parallel reads. */
export async function getUniversityDetail(client: V2Client, slug: string): Promise<UniversityDetail | null> {
  const university = await getUniversityBySlug(client, slug);
  if (!university) return null;
  const byUni = (table: string) => from(client, table).select("*").eq("university_id", university.id);
  const [admissions, deadlines, costs, requirements, programmes, media, rankings] = await Promise.all([
    rows<AdmissionRow>(byUni("admissions").order("intake_year", { ascending: false })),
    rows<DeadlineRow>(byUni("deadlines").order("due_date", { ascending: true, nullsFirst: false })),
    rows<CostRow>(byUni("costs").order("academic_year", { ascending: false })),
    rows<ApplicationRequirementRow>(byUni("application_requirements")),
    rows<ProgrammeRow>(byUni("programmes").order("name")),
    rows<MediaRow>(byUni("university_media").order("sort_order")),
    rows<RankingRow>(byUni("rankings").order("edition_year", { ascending: false })),
  ]);
  return { university, admissions, deadlines, costs, requirements, programmes, media, rankings };
}

export async function listDeadlines(client: V2Client, universityIds: readonly Uuid[]): Promise<DeadlineRow[]> {
  if (!universityIds.length) return [];
  return rows<DeadlineRow>(
    from(client, "deadlines").select("*").in("university_id", universityIds).order("due_date", { ascending: true, nullsFirst: false }),
  );
}

export async function listScholarshipsForUniversity(client: V2Client, universityId: Uuid): Promise<ScholarshipRow[]> {
  const links = await rows<{ scholarship_id: Uuid }>(
    from(client, "scholarship_universities").select("scholarship_id").eq("university_id", universityId),
  );
  if (!links.length) return [];
  return rows<ScholarshipRow>(from(client, "scholarships").select("*").in("id", links.map((l) => l.scholarship_id)));
}

// ── Student (RLS limits every read to the signed-in owner) ──

export async function listMyColleges(client: V2Client, userId: Uuid): Promise<MyCollegeRow[]> {
  return rows<MyCollegeRow>(from(client, "my_colleges").select("*").eq("user_id", userId).order("sort_order"));
}

// ── Pure helpers over fetched rows ──

/** First deadline on or after `today` (YYYY-MM-DD); undated rounds are skipped. */
export function nextDeadline(deadlines: readonly DeadlineRow[], today: string): DeadlineRow | null {
  return (
    deadlines
      .filter((d) => d.due_date && d.due_date >= today)
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : 0))[0] ?? null
  );
}

/** Latest university-wide tuition for international students (falls back to out-of-state, then any). */
export function latestTuition(costs: readonly CostRow[]): CostRow | null {
  const tuition = costs.filter((c) => c.category === "tuition" && !c.programme_id);
  const rank = (c: CostRow) => (c.student_category === "international" ? 0 : c.student_category === "out_of_state" ? 1 : 2);
  return (
    tuition.sort((a, b) => (a.academic_year === b.academic_year ? rank(a) - rank(b) : a.academic_year < b.academic_year ? 1 : -1))[0] ??
    null
  );
}

/** Lowest stated minimum for an English test, or null when not stated / not required. */
export function englishMinimum(requirements: readonly ApplicationRequirementRow[], kind: "IELTS" | "TOEFL" | "DUOLINGO"): number | null {
  const values = requirements.filter((r) => r.kind === kind && r.minimum != null).map((r) => r.minimum!);
  return values.length ? Math.min(...values) : null;
}

/** Logo first (light surface preferred), then nothing. */
export function pickLogo(media: readonly MediaRow[]): MediaRow | null {
  const logos = media.filter((m) => m.kind === "logo");
  return logos.find((m) => m.surface !== "dark") ?? logos[0] ?? null;
}
