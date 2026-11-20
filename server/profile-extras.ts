import admissionsMerged from "@/data/review/segment-admissions-nov14-merged.json";
import programmesCosts from "@/data/review/programmes-costs-nov14.json";
import { tuitionEntry, type TuitionEntry } from "./tuition-index";

/** Reviewed, per-university extras the profile shows beside the catalogue record.
 * They are resolved on the server and passed to the page as one small prop, so
 * the review files never ship to the browser. Each loader below is one source;
 * add a source by adding a loader and one line to `profileExtras`. */

type Src<T> = { value: T; source_url: string | null };
export type ApplyExtras = {
  route?: Src<string>;
  waivers?: Src<string>;
  duolingo?: Src<number>;
  foundation_year?: Src<string>;
  aid?: Src<{ international: boolean | null; type: string | null; note: string | null }>;
  /** Free-text deadline wording, only when the university states it in prose. */
  deadline_text?: Src<string>;
};
export type ExtraProgramme = {
  name: string;
  level: string;
  field: string | null;
  years: number | null;
  language: string | null;
  url: string;
  checked_at: string | null;
};
export type CostExtras = {
  tuition?: { amount: number; currency: string; year: string | null; basis: string | null; varies: boolean; source_url: string };
  living?: { amount: number | null; currency: string; basis: string | null; source_url: string };
  /** Tuition from the shared index (server/tuition-index.ts) when the record has none. */
  indexed?: TuitionEntry;
};
export type ProfileExtras = {
  apply?: ApplyExtras;
  programmes: ExtraProgramme[];
  costs?: CostExtras;
} & ProfileMore;

const httpUrl = (u: unknown): u is string => {
  if (typeof u !== "string") return false;
  try {
    return ["https:", "http:"].includes(new URL(u).protocol);
  } catch {
    return false;
  }
};

type Field = { value: unknown; source_url?: string | null; status?: string };
type Merged = { university_id: string; fields?: Record<string, Field> };
const merged = new Map<string, Merged>();
for (const r of admissionsMerged as unknown as Merged[]) merged.set(r.university_id, r);

/** Only fields the review marked "verified" are read; staged and empty ones are ignored. */
function applyExtras(id: string): ApplyExtras | undefined {
  const fields = merged.get(id)?.fields;
  if (!fields) return undefined;
  const get = (key: string): Field | null => {
    const f = fields[key];
    return f && f.status === "verified" && f.value != null ? f : null;
  };
  const text = (key: string): Src<string> | undefined => {
    const f = get(key);
    return f && typeof f.value === "string" && f.value.trim()
      ? { value: f.value.trim(), source_url: httpUrl(f.source_url) ? f.source_url : null }
      : undefined;
  };
  const out: ApplyExtras = {};
  const route = text("application_route");
  // Review notes sometimes trail a "… not found." clause; that is a note to us, not a route.
  if (route) out.route = { ...route, value: route.value.replace(/[;,]?\s*[^;.]*\bnot found\.?\s*$/i, "").trim() || route.value };
  const waivers = text("english_waivers");
  if (waivers) out.waivers = waivers;
  const foundation = text("foundation_year");
  if (foundation) out.foundation_year = foundation;
  const duolingo = get("duolingo");
  const duo = (duolingo?.value as { minimum?: number } | undefined)?.minimum;
  if (duolingo && typeof duo === "number" && duo > 0)
    out.duolingo = { value: duo, source_url: httpUrl(duolingo.source_url) ? duolingo.source_url : null };
  const aid = get("aid");
  if (aid && typeof aid.value === "object") {
    const a = aid.value as { available_to_international_students?: boolean | null; type?: string | null; note?: string | null };
    out.aid = {
      value: { international: a.available_to_international_students ?? null, type: a.type ?? null, note: a.note ?? null },
      source_url: httpUrl(aid.source_url) ? aid.source_url : null,
    };
  }
  const deadlines = get("deadlines");
  if (deadlines && typeof deadlines.value === "string")
    out.deadline_text = { value: deadlines.value, source_url: httpUrl(deadlines.source_url) ? deadlines.source_url : null };
  return Object.keys(out).length ? out : undefined;
}

type StagedProgramme = {
  name?: string; field?: string | null; degree?: string | null; duration_years?: number | null;
  language?: string | null; url?: string; source_url?: string; checked_at?: string;
};
type StagedCost = { amount?: number | null; currency?: string; academic_year?: string; basis?: string | null; varies_by_programme?: boolean; source_url?: string };
type StagedRecord = { university_id: string; programmes?: StagedProgramme[]; tuition?: StagedCost | null; living_cost?: StagedCost | null };
const staged = new Map<string, StagedRecord>();
for (const r of programmesCosts as unknown as StagedRecord[]) staged.set(r.university_id, r);

const levelOf = (p: StagedProgramme): string => {
  const d = p.degree || "";
  if (/^(b|bachelor)/i.test(d)) return "Bachelor’s";
  if (/^(m|master)/i.test(d)) return "Master’s";
  if (/^(ph|doctor)/i.test(d)) return "Doctoral";
  return /undergrad|bachelor|bsc|-ba\b/i.test(p.url || "") ? "Bachelor’s" : "Programme";
};
// Rows that point at a finder page instead of naming a programme are not programmes.
const placeholder = /see (the )?(official )?finder|capped pending|programmes? \(|^undergraduate (degree )?programmes/i;

function programmesFor(id: string): ExtraProgramme[] {
  return (staged.get(id)?.programmes || []).flatMap((p) =>
    p.name && httpUrl(p.url) && !placeholder.test(p.name)
      ? [{
          name: p.name.trim(),
          level: levelOf(p),
          field: p.field && p.field !== "varies" ? p.field : null,
          years: typeof p.duration_years === "number" && p.duration_years > 0 && p.duration_years < 10 ? p.duration_years : null,
          language: p.language || null,
          url: p.url,
          checked_at: p.checked_at || null,
        }]
      : [],
  );
}

const annual = /(per|a) (academic )?year|annual/i;
const notAnnual = /per (credit|semester|month|term)/i;
function costsFor(id: string): CostExtras | undefined {
  const r = staged.get(id);
  const out: CostExtras = {};
  const t = r?.tuition;
  // A tuition figure counts only with a source page and an annual basis.
  if (t && httpUrl(t.source_url) && typeof t.amount === "number" && t.amount > 0 && t.amount < 400000 && t.basis && annual.test(t.basis) && !notAnnual.test(t.basis.split(";")[0]))
    out.tuition = {
      amount: t.amount, currency: t.currency || "USD", year: t.academic_year || null,
      basis: t.basis.replace(/\s*\(illustrative[^)]*\)/i, ""), varies: !!t.varies_by_programme, source_url: t.source_url,
    };
  const l = r?.living_cost;
  if (l && httpUrl(l.source_url) && (l.basis || l.amount) && (l.amount == null || (l.amount > 0 && l.amount < 200000)))
    out.living = { amount: l.amount ?? null, currency: l.currency || "USD", basis: l.basis || null, source_url: l.source_url };
  const indexed = tuitionEntry(id);
  if (indexed) out.indexed = indexed;
  return Object.keys(out).length ? out : undefined;
}

export function profileExtras(id: string): ProfileExtras {
  return { apply: applyExtras(id), programmes: programmesFor(id), costs: costsFor(id) };
}

/** Open structured facts (Wikidata, CC0) and the cross-links the profile adds.
 * Loaded per university by server/profile-more.ts; each value keeps its source page. */
type Dated = { date: string | null; source_url: string };
export type ProfileFacts = {
  students?: Dated & { value: number };
  /** Teachers (P10610); a student/staff ratio is derived from this only. */
  academic_staff?: Dated & { value: number };
  /** All employees (P1128) when no teacher count exists. */
  employees?: Dated & { value: number };
  founded?: { year: number; source_url: string };
  type?: { value: string; source_url: string };
  affiliation?: { value: string; source_url: string };
  motto?: { value: string; source_url: string };
  campus_area_km2?: { value: number; source_url: string };
  coordinates?: { lat: number; lon: number; source_url: string };
  endowment?: Dated & { amount: number; currency: string };
};
export type ProfileScholarship = {
  slug: string;
  name: string;
  provider: string | null;
  covers: string | null;
  funding: "full" | "partial";
  deadline: string | null;
};
export type ProfileGuide = {
  slug: string;
  title: string;
  publisher: string | null;
  minutes: number | null;
  /** External guides open the publisher's page. */
  url: string | null;
};
export type ProfileMore = {
  facts?: ProfileFacts;
  scholarships?: ProfileScholarship[];
  guides?: ProfileGuide[];
};
