// Confidence (0–1) and a short human "basis" for every resolved fact.
//
//   confidence = best(tier × freshness) in the agreeing cluster + agreement − disagreement − cross-check penalties, capped (derived ≤ 0.7)
//   tier:      official dataset 1.0 · community dataset (Wikidata) 0.7 · official fetched page 0.85 (0.9 reviewed) · search snippet 0.4
//   freshness: 2026/27+ (or timeless) 1.0 · 2025/26 0.9 · older → never current (history only); no year → the year of retrieved_at
//   agreement: +0.1 × (tier / 0.85, max 1) per other independent source family in the cluster, max +0.2 (a snippet agreeing adds ~0.05)
//   disagreement: −0.2 when a tie is kept, −0.05 per lower-ranked source that disagreed (resolved conflict)
//
// The UI reads `trustOf(confidence)`: verified ≥ 0.85 · likely ≥ 0.6 · otherwise "check official site".
import type { Observation } from "./model";
import { yearStatus } from "./normalise";

export const DERIVED_CAP = 0.7;
export type Trust = "verified" | "likely" | "check";
export const trustOf = (c: number): Trust => (c >= 0.85 ? "verified" : c >= 0.6 ? "likely" : "check");

type Src = Pick<Observation, "method" | "verified" | "academic_year" | "collector"> & { derived?: boolean; retrieved_at?: string | null };

export function tierScore(o: Pick<Observation, "method" | "verified">): number {
  if (o.method === "dataset") return o.verified ? 1 : 0.7;
  if (o.method === "fetched") return o.verified ? 0.9 : 0.85;
  return 0.4;
}
/** Academic year (Aug–Jul) containing a day: 2026-11-16 → 2026/27. */
export const academicYearOfDay = (day: string) => {
  const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7));
  const start = m >= 8 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
};
export function freshness(ay: string | null, timeless = false, retrievedAt: string | null = null): number {
  if (timeless) return 1;
  const s = yearStatus(ay ?? (retrievedAt && /^\d{4}-\d{2}/.test(retrievedAt) ? academicYearOfDay(retrievedAt) : null));
  return s === "preferred" ? 1 : s === "accepted" ? 0.9 : s === "unknown" ? 0.95 : 0;
}
/** oc-shard-3 → oc-shard; published/requirements-current → published. Two members of one family are not independent. */
export const collectorFamily = (c: string) => c.replace(/\/.*$/, "").replace(/-(nov|oct)\d+.*$/, "").replace(/[-\d]+$/, "");

export interface ConfidenceInput { head: Src; agreeing: Src[]; tie: boolean; disagreeingResolved: number; timeless?: boolean; penalty?: number }

const strength = (o: Src, timeless?: boolean) => tierScore(o) * freshness(o.academic_year, timeless, o.retrieved_at ?? null);
/** The cluster ordered strongest first (head + agreeing values), one entry per collector family. */
export function supporters(x: Pick<ConfidenceInput, "head" | "agreeing" | "timeless">): Src[] {
  const all = [x.head, ...x.agreeing.filter((a) => a !== x.head)].sort((a, b) => strength(b, x.timeless) - strength(a, x.timeless));
  const seen = new Set<string>();
  return all.filter((o) => { const f = collectorFamily(o.collector); if (seen.has(f)) return false; seen.add(f); return true; });
}
/** Number of agreeing sources that are independent of the head (other family). */
export function independentCount(head: Src, agreeing: Src[]) {
  return supporters({ head, agreeing }).length - 1;
}

export function scoreConfidence(x: ConfidenceInput): number {
  const [best, ...others] = supporters(x);
  let c = strength(best, x.timeless) + Math.min(0.2, others.reduce((s, o) => s + 0.1 * Math.min(1, tierScore(o) / 0.85), 0));
  if (x.tie) c -= 0.2;
  c -= 0.05 * x.disagreeingResolved;
  c -= x.penalty ?? 0;
  if (best.derived) c = Math.min(c, DERIVED_CAP);
  return Math.round(Math.max(0, Math.min(1, c)) * 100) / 100;
}

// ── basis ──
const LABELS: [RegExp, string][] = [
  [/^scorecard$/, "College Scorecard"], [/^ipeds/, "IPEDS"], [/^cds$/, "Common Data Set"], [/^cricos$/, "CRICOS (data.gov.au)"],
  [/^duo$/, "DUO open data"], [/^wikidata$/, "Wikidata"], [/^published\//, "reviewed dataset"], [/^nov16b/, "official dataset"],
];
export function sourceLabel(o: Src): string {
  const hit = LABELS.find(([re]) => re.test(o.collector));
  if (hit) return hit[1];
  return o.method === "snippet" ? "search snippet" : o.method === "dataset" ? "dataset" : "official page";
}
const yearLabel = (o: Src) => (o.collector === "cds" && o.academic_year ? o.academic_year.replace("/", "-") : o.academic_year ?? "");
const label = (o: Src) => `${sourceLabel(o)} ${yearLabel(o)}`.trim();

export function basisOf(x: ConfidenceInput & { other?: Src | null; note?: string | null }): string {
  const sup = supporters(x);
  const parts = sup.slice(0, 3).map(label);
  let s = parts.length > 1 ? `${parts.join(" + ")} agree` : parts[0];
  if (sup[0].derived) s += " (derived estimate)";
  if (x.tie && x.other) s += `; ${label(x.other)} disagrees — check official site`;
  else if (sup[0].method === "snippet") s += " — check official site";
  if (x.note) s += `; ${x.note}`;
  return s;
}
