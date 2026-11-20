// Conflict resolution (pure). Rules, in order (see data/README.md → "Curated data"):
//   0. latest only: values for academic years before 2025/26 never enter the current view (history only);
//   1. official fetched > search snippet (between research collectors);
//   2. newer academic year / intake > older;
//   3. verified dataset > research;
//   4. otherwise a tie: keep both (alternatives) and flag.
// Compatible values (same facts, one maybe more specific) are agreement, not conflict.
import { CORE_FIELDS, UNION_FIELDS, yearStart, type FieldName, type FieldValue, type Observation, type Provenance } from "./model";
import { deadlineAcademicYear, normName, yearStatus } from "./normalise";
import { isOldYear } from "./gates";
import { basisOf, scoreConfidence, supporters } from "./confidence";
import { TIMELESS_FIELDS } from "./model";

export type Rule = "fetched>snippet" | "newer-academic-year" | "verified-dataset>research";
export interface ResolvedFact extends Provenance { value: unknown }
export interface HistoryEntry extends ResolvedFact { field: string; reason: string }
export interface ConflictEntry {
  field: string;
  status: "resolved" | "tie";
  rule: Rule | null;
  chosen: CandidateSummary;
  other: CandidateSummary;
}
export interface CandidateSummary { value: unknown; source_url: string | null; method: string; collector: string; retrieved_at: string | null; academic_year: string | null; verified: boolean }
export interface FieldResolution { fact: ResolvedFact | null; alternatives: ResolvedFact[]; history: HistoryEntry[]; conflicts: ConflictEntry[] }

type Cand = Observation & { source_url: string; retrieved_at: string };
type Kind = FieldName | "deadline_item";

// ── ranking ──
const tier = (o: Pick<Observation, "method" | "verified">) => (o.method === "dataset" ? (o.verified ? 4 : 1.5) : o.method === "fetched" ? (o.verified ? 3 : 2.5) : 1);
const rankKey = (o: Cand) => [tier(o), yearStart(o.academic_year) ?? 0, o.retrieved_at, o.collector] as const;
export function byRank(a: Cand, b: Cand) {
  const ka = rankKey(a), kb = rankKey(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] > kb[i] ? -1 : 1;
  return JSON.stringify(a.value) < JSON.stringify(b.value) ? -1 : 1;
}

/** Applies rules 1–3. Null = tie. */
export function compare(a: Pick<Observation, "method" | "verified" | "academic_year">, b: Pick<Observation, "method" | "verified" | "academic_year">): { winner: "a" | "b"; rule: Rule } | null {
  if (a.method !== "dataset" && b.method !== "dataset" && a.method !== b.method)
    return { winner: a.method === "fetched" ? "a" : "b", rule: "fetched>snippet" };
  const ya = yearStart(a.academic_year), yb = yearStart(b.academic_year);
  if (ya != null && yb != null && ya !== yb) return { winner: ya > yb ? "a" : "b", rule: "newer-academic-year" };
  const da = a.method === "dataset" && a.verified, db = b.method === "dataset" && b.verified;
  if (da !== db && (a.method !== "dataset" || b.method !== "dataset")) return { winner: da ? "a" : "b", rule: "verified-dataset>research" };
  return null;
}

// ── value comparison ──
const near = (a: number | null | undefined, b: number | null | undefined, tol = 0.02) =>
  a == null || b == null || a === b || Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));
const eqOrNull = (a: unknown, b: unknown) => a == null || b == null || a === b;
const statusOk = (a: string, b: string) => a === b || a === "unknown" || b === "unknown" || (["required", "conditional"].includes(a) && ["required", "conditional"].includes(b));

/** Same facts (nulls are "not stated", not disagreement). */
export function compatible(kind: Kind, a: any, b: any): boolean { // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (kind) {
    case "tuition":
      if (a.usd != null && b.usd != null) {
        // CDS tuition-only vs Scorecard tuition + required fees: compare like with like.
        const withFees = (x: { usd: number; basis?: string | null }) => { const m = /tuition \+ fees (\d+)/.exec(x.basis ?? ""); return m ? [x.usd, Number(m[1])] : [x.usd]; };
        return withFees(a).some((x) => withFees(b).some((y) => near(x, y)));
      }
      return a.currency === b.currency && near(a.amount ?? a.range_min, b.amount ?? b.range_min, 0.01);
    case "mandatory_fees": case "living_cost": case "application_fee": case "cost_of_attendance": case "net_price": case "median_earnings_10y":
      if (a.usd != null && b.usd != null) return near(a.usd, b.usd);
      return a.amount == null || b.amount == null || (a.currency === b.currency && near(a.amount, b.amount, 0.01));
    case "platform": return a.code === b.code || a.code === "other" || b.code === "other";
    case "ielts": return statusOk(a.status, b.status) && eqOrNull(a.overall, b.overall) && eqOrNull(a.component, b.component);
    case "toefl": return statusOk(a.status, b.status) && eqOrNull(a.ibt, b.ibt) && eqOrNull(a.band_2026, b.band_2026);
    case "duolingo": return statusOk(a.status, b.status) && eqOrNull(a.minimum, b.minimum);
    case "sat_act": return a.policy === b.policy || a.policy === "unknown" || b.policy === "unknown";
    case "acceptance_rate": return (a.year == null || b.year == null || a.year === b.year) && Math.abs(a.percent - b.percent) < 0.5;
    case "founded_year": return a === b;
    case "student_count": case "undergrads": return near(a.value, b.value, 0.05);
    case "international_share": case "grad_rate": return Math.abs(a - b) < 0.005;
    case "deadline_item": return eqOrNull(a.date, b.date);
    case "sat_scores": // CDS and Scorecard round differently: within 20 points per stated percentile
      return (["reading_25", "reading_75", "math_25", "math_75", "average", "composite_25", "composite_75"] as const).every((k) => a[k] == null || b[k] == null || Math.abs(a[k] - b[k]) <= 20);
    case "act_scores": return (["p25", "p75"] as const).every((k) => a[k] == null || b[k] == null || Math.abs(a[k] - b[k]) <= 1);
    case "applicants": case "admitted": case "intl_students": return near(a.value, b.value, 0.05);
    case "gpa_avg": return Math.abs(a - b) <= 0.05;
    case "room_board":
      if (a.usd != null && b.usd != null) return near(a.usd, b.usd, 0.05);
      return a.amount == null || b.amount == null || (a.currency === b.currency && near(a.amount, b.amount, 0.05));
    case "intl_aid": return eqOrNull(a.available, b.available) && near(a.count, b.count, 0.1) && near(a.avg_usd, b.avg_usd, 0.1);
    default: return JSON.stringify(a) === JSON.stringify(b);
  }
}
/** More stated facts → higher. Picks the cluster head among compatible values. */
export function specificity(kind: Kind, v: any): number { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (v == null || typeof v !== "object") return v == null ? 0 : 1;
  if (kind === "deadline_item") return (v.date ? 2 : 0) + (v.date && !v.date_inferred ? 1 : 0);
  if (kind === "platform") return v.code === "other" ? 0 : 1;
  if (["ielts", "toefl", "duolingo", "sat_act"].includes(kind) && (v.status === "unknown" || v.policy === "unknown")) return 0;
  return Object.entries(v).filter(([k, x]) => x != null && k !== "text" && k !== "basis").length;
}

const summary = (o: Cand): CandidateSummary => ({ value: o.value, source_url: o.source_url, method: o.method, collector: o.collector, retrieved_at: o.retrieved_at, academic_year: o.academic_year, verified: o.verified });

interface Support { agreeing?: Cand[]; tie?: boolean; disagreeingResolved?: number; other?: Cand | null; timeless?: boolean }
function toFact(o: Cand, extraFlags: string[], sup: Support = {}): ResolvedFact {
  const flags = new Set([...o.flags, ...extraFlags]);
  if (o.method === "snippet") flags.add("snippet-verify");
  const agreeing0 = (sup.agreeing ?? []).filter((a) => a !== o);
  const derived = !!supporters({ head: o, agreeing: agreeing0, timeless: sup.timeless })[0].derived;
  if (derived) flags.add("derived");
  if (yearStatus(o.academic_year) === "accepted") flags.add("year-2025/26");
  const agreeing = agreeing0;
  const x = { head: o, agreeing, tie: !!sup.tie, disagreeingResolved: sup.disagreeingResolved ?? 0, timeless: sup.timeless };
  return {
    value: o.value, source_url: o.source_url, retrieved_at: o.retrieved_at, method: o.method, collector: o.collector,
    confidence: scoreConfidence(x), verified: o.verified, academic_year: o.academic_year,
    flags: [...flags].sort(), note: o.note, basis: basisOf({ ...x, other: sup.other ?? null }), ...(derived ? { derived: true } : {}),
  };
}

/** Resolves candidates of one scalar kind. `history` gets old-year values and losers. */
export function resolveScalar(kind: Kind, field: string, all: Cand[]): FieldResolution {
  const history: HistoryEntry[] = [];
  const conflicts: ConflictEntry[] = [];
  const current: Cand[] = [];
  for (const o of all) {
    if (isOldYear(o.academic_year)) history.push({ ...toFact(o, ["stale"]), field, reason: `older academic year (${o.academic_year}); owner rule: latest only` });
    else current.push(o);
  }
  // Dedupe: one candidate per collector+value.
  const seen = new Set<string>();
  const cands = current.sort(byRank).filter((o) => {
    const k = o.collector + "|" + JSON.stringify(o.value);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!cands.length) return { fact: null, alternatives: [], history, conflicts };
  const clusters: Cand[][] = [];
  for (const o of cands) {
    const c = clusters.find((cl) => cl.every((m) => compatible(kind, m.value, o.value)));
    if (c) c.push(o);
    else clusters.push([o]);
  }
  // Cluster head: an official (non-snippet) member when the cluster has one, then the most specific value.
  const head = (cl: Cand[]) => [...cl].sort((a, b) => Number(a.method === "snippet") - Number(b.method === "snippet") || specificity(kind, b.value) - specificity(kind, a.value) || byRank(a, b))[0];
  const heads = clusters.map((cl) => ({ cl, h: head(cl) }));
  let champ = heads[0];
  for (const x of heads.slice(1)) {
    const r = compare(champ.h, x.h);
    if (r?.winner === "b") champ = x;
  }
  const alternatives: ResolvedFact[] = [];
  let tie = false, resolvedLosers = 0;  // non-snippet sources that disagreed and lost
  let rival: Cand | null = null;
  const timeless = TIMELESS_FIELDS.includes(kind as FieldName);
  for (const x of heads) {
    if (x === champ) continue;
    const r = compare(champ.h, x.h);
    const loserFact = toFact(x.h, [], { agreeing: x.cl, other: champ.h, timeless });
    if (r && r.winner === "a") {
      if (x.h.method !== "snippet") resolvedLosers++;
      conflicts.push({ field, status: "resolved", rule: r.rule, chosen: summary(champ.h), other: summary(x.h) });
      history.push({ ...loserFact, field, reason: `lost conflict (${r.rule}) to ${champ.h.collector}` });
    } else {
      tie = true;
      rival ??= x.h;
      conflicts.push({ field, status: "tie", rule: null, chosen: summary(champ.h), other: summary(x.h) });
      alternatives.push(toFact(x.h, ["conflict-tie"], { agreeing: x.cl, tie: true, other: champ.h, timeless }));
    }
  }
  // Agreement: distinct URLs inside the winning cluster (independence is judged by collector family in confidence.ts).
  const n = new Set(champ.cl.map((m) => m.source_url)).size - 1;
  const flags = [...(n > 0 ? [`corroborated:${n + 1}`] : []), ...(tie ? ["conflict-tie"] : [])];
  // A lower-ranked source that disagreed costs a little; snippets losing to official pages cost nothing.
  return { fact: toFact(champ.h, flags, { agreeing: champ.cl, tie, disagreeingResolved: resolvedLosers, other: rival, timeless }), alternatives, history, conflicts };
}

/** Deadlines: resolved per round, each item keeps its own provenance. */
export function resolveDeadlines(all: Cand[]): FieldResolution {
  type Item = FieldValue<"deadlines">[number];
  const byKey = new Map<string, Cand[]>();
  for (const o of all) for (const d of o.value as Item[]) {
    // Round code joins items across sources; when one source lists several items of a round
    // (UCAS 15 Oct vs 13 Jan, winter vs summer entry) the label keeps them apart.
    const sameRound = (o.value as Item[]).filter((x) => x.round === d.round).length > 1;
    const key = sameRound || ["other", "document", "open", "close"].includes(d.round) ? `${d.round}:${normName(d.label)}` : d.round;
    const c: Cand = { ...o, value: d as unknown as Cand["value"], source_url: d.source_url || o.source_url, retrieved_at: d.retrieved_at || o.retrieved_at, academic_year: deadlineAcademicYear(d.intake_year), flags: d.date_inferred ? [...o.flags, "date-year-inferred"] : o.flags };
    byKey.set(`${key}`, [...(byKey.get(key) ?? []), c]);
  }
  const items: ResolvedFact[] = [];
  const out: FieldResolution = { fact: null, alternatives: [], history: [], conflicts: [] };
  for (const [key, cands] of [...byKey].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const r = resolveScalar("deadline_item", `deadlines.${key}`, cands);
    out.history.push(...r.history);
    out.conflicts.push(...r.conflicts);
    out.alternatives.push(...r.alternatives);
    if (r.fact) items.push(r.fact);
  }
  if (!items.length) return out;
  // Only the newest intake present is current; older intakes go to history.
  const newest = Math.max(...items.map((f) => (f.value as Item).intake_year));
  const keep = items.filter((f) => (f.value as Item).intake_year === newest);
  for (const f of items) if (!keep.includes(f)) out.history.push({ ...f, field: "deadlines", reason: `older intake (${(f.value as Item).intake_year}); newest is ${newest}` });
  const best = [...keep].sort((a, b) => b.confidence - a.confidence || (a.collector < b.collector ? -1 : 1))[0];
  const value = keep.map((f) => ({ ...(f.value as Item), source_url: f.source_url, retrieved_at: f.retrieved_at, method: f.method, collector: f.collector }))
    .sort((a, b) => (a.date ?? "9999") < (b.date ?? "9999") ? -1 : (a.date ?? "9999") > (b.date ?? "9999") ? 1 : a.label < b.label ? -1 : 1);
  const flags = new Set(keep.flatMap((f) => f.flags));
  const conf = Math.round((keep.reduce((s, f) => s + f.confidence, 0) / keep.length) * 100) / 100;
  const weakest = [...keep].sort((a, b) => a.confidence - b.confidence)[0];
  out.fact = { ...best, value, confidence: conf, flags: [...flags].sort(),
    basis: keep.length > 1 && weakest.confidence < best.confidence ? `${best.basis}; weakest round: ${weakest.basis}` : best.basis };
  return out;
}

/** Documents / programmes: union of the current candidates, best-ranked first. */
export function resolveUnion(field: "documents" | "programmes" | "bachelor_fields", all: Cand[]): FieldResolution {
  const sorted = [...all].sort(byRank);
  if (!sorted.length) return { fact: null, alternatives: [], history: [], conflicts: [] };
  const seen = new Set<string>();
  const items: unknown[] = [];
  const contributors = new Set<string>();
  for (const o of sorted) for (const item of o.value as unknown[]) {
    const k = normName(typeof item === "string" ? item : (item as { name: string }).name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    items.push(field === "programmes" && !(item as { source_url: string | null }).source_url ? { ...(item as object), source_url: o.source_url } : item);
    contributors.add(o.collector);
  }
  const flags = contributors.size > 1 ? [`union:${contributors.size}`] : [];
  const head = toFact(sorted[0], flags, { agreeing: sorted.filter((o) => contributors.has(o.collector)) });
  if (contributors.size > 1) head.basis = `union of ${contributors.size} sources (best: ${head.basis!.replace(/ agree$/, "")})`;
  return { fact: { ...head, value: items }, alternatives: [], history: [], conflicts: [] };
}

export function resolveField(field: FieldName, cands: Cand[]): FieldResolution {
  if (field === "deadlines") return resolveDeadlines(cands);
  if (UNION_FIELDS.includes(field)) return resolveUnion(field as "documents" | "programmes" | "bachelor_fields", cands);
  return resolveScalar(field, field, cands);
}
export { CORE_FIELDS };
