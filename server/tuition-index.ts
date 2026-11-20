import type { Cost, University } from "@/lib/domain";
import { tuition } from "@/lib/domain";
import ipedsFees from "@/data/published/ipeds-fees-2023.json";
import segmentAdmissions from "@/data/review/segment-admissions-nov14-merged.json";
// import programmesCosts from "@/data/review/programmes-costs-nov14.json"; // staged; add programmesCostsTuition below when verified

/** One annual tuition figure for international students, with where it came from. */
export type TuitionEntry = {
  amount: number;
  currency: string;
  year: number | null;
  source: string;
  source_url: string | null;
  note: string;
};
type Source = (id: string) => TuitionEntry | undefined;

const ipedsSource: Source = (id) => {
  const row = (ipedsFees.records as Record<string, (number | null)[]>)[id];
  return row && row[1] != null
    ? {
        amount: row[1],
        currency: "USD",
        year: 2023,
        source: "IPEDS NCES",
        source_url: "https://nces.ed.gov/ipeds/",
        note: "Out-of-state tuition and required fees (the rate international students pay), IPEDS 2023.",
      }
    : undefined;
};

type Merged = {
  university_id: string;
  verification_status?: string;
  parsed?: { tuition?: { amount: number; currency: string; period?: string; note?: string } };
  fields?: { tuition?: { source_url?: string; checked_at?: string } };
};
const segmentTuition = new Map<string, TuitionEntry>();
for (const r of segmentAdmissions as unknown as Merged[]) {
  const t = r.parsed?.tuition;
  if (r.verification_status === "verified" && t && t.period === "year" && t.amount > 0)
    segmentTuition.set(r.university_id, {
      amount: t.amount,
      currency: t.currency,
      year: Number(t.note?.match(/^(\d{4})/)?.[1]) || null,
      source: "University tuition page",
      source_url: r.fields?.tuition?.source_url ?? null,
      note: t.note ?? "Annual tuition as the university states it.",
    });
}
const segmentSource: Source = (id) => segmentTuition.get(id);

/** First source with a figure wins, so list the most current and specific first.
 * A later source (for example data/review/programmes-costs-nov14.json once verified)
 * is one more entry here. */
const TUITION_SOURCES: Source[] = [segmentSource, ipedsSource];

export function tuitionEntry(id: string): TuitionEntry | undefined {
  for (const source of TUITION_SOURCES) {
    const entry = source(id);
    if (entry) return entry;
  }
  return undefined;
}

/** Adds the indexed tuition as an international-tuition cost when the record has none,
 * so the list, filter, sort and compare read it through the usual `tuition()` accessor. */
export function withTuition(u: University): University {
  if (tuition(u)) return u;
  const entry = tuitionEntry(u.id);
  if (!entry) return u;
  const cost: Cost = {
    id: u.id + ":tuition-index",
    university_id: u.id,
    category: "tuition",
    amount: entry.amount,
    currency: entry.currency,
    period: "year",
    student_category: "international",
    program_id: null,
    year: entry.year,
    source_id: null,
    verification_status: "verified",
    verified_at: null,
    notes: entry.note,
    source_url: entry.source_url ?? undefined,
  };
  return { ...u, costs: [...u.costs, cost] };
}
