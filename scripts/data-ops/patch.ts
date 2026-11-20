// Describes what would change in data/published/global-directory.json (US Scorecard refresh +
// exclusions). Never writes published files: the owner approves and applies it.
import { existsSync } from "node:fs";
import { path, readJson } from "../ingest/lib";
import type { Identity } from "./identity";
import type { CuratedRecord } from "./model";
import type { Exclusion } from "./merge";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const DIRECTORY = "data/published/global-directory.json";

export function buildPublishedPatch(current: CuratedRecord[], excluded: (Exclusion & { record: unknown })[], canonicalOf: Map<string, string>, ids: Map<string, Identity>) {
  const dir = existsSync(path(DIRECTORY)) ? readJson<Any[]>(DIRECTORY) : [];
  const byId = new Map(dir.map((r) => [r.id as string, r]));
  const updates: { id: string; name: string; changes: Record<string, { from: unknown; to: unknown }>; source: string; academic_year: string | null }[] = [];
  for (const rec of current) {
    const d = byId.get(rec.id);
    if (!d || rec.country_code !== "US") continue;
    const f = rec.facts as Record<string, { value: Any; collector: string; academic_year: string | null }>;
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const set = (key: string, to: unknown) => { if (to != null && d[key] !== to) changes[key] = { from: d[key] ?? null, to }; };
    if (f.tuition?.collector === "scorecard") set("tuition_fees_out_of_state", f.tuition.value.amount);
    if (f.acceptance_rate?.collector === "scorecard") set("acceptance_rate", f.acceptance_rate.value.percent);
    if (f.sat_scores?.collector === "scorecard") {
      const s = f.sat_scores.value;
      set("sat_reading_25", s.reading_25); set("sat_reading_75", s.reading_75); set("sat_math_25", s.math_25); set("sat_math_75", s.math_75);
    }
    if (f.act_scores?.collector === "scorecard") { set("act_25", f.act_scores.value.p25); set("act_75", f.act_scores.value.p75); }
    if (Object.keys(changes).length) updates.push({ id: rec.id, name: rec.name, changes, source: "College Scorecard (file dated 2026-11-02)", academic_year: f.tuition?.academic_year ?? f.acceptance_rate?.academic_year ?? null });
  }
  const merges = new Map<string, string[]>();
  for (const [dup, canon] of canonicalOf) merges.set(canon, [...(merges.get(canon) ?? []), dup]);
  return {
    target: DIRECTORY,
    status: "PROPOSED — not applied. Apply only after owner approval.",
    notes: [
      "tuition_fees_out_of_state is Scorecard TUITIONFEE_OUT (tuition + required fees, 2025/26) — a new key; existing tuition_* keys (IPEDS tuition only) stay as history.",
      "Exclusions hide records (set published=false or move to an excluded list); nothing is deleted.",
    ],
    counts: { updates: updates.length, exclusions: excluded.length, duplicate_merges: merges.size },
    updates,
    exclusions: excluded.map((e) => ({ id: e.id, name: e.name, reason: e.reason, detail: e.detail, in_directory: byId.has(e.id) })),
    duplicate_merges: [...merges].sort().map(([canon, dups]) => ({ keep: canon, keep_name: ids.get(canon)?.name ?? null, merge: dups.map((d) => ({ id: d, name: ids.get(d)?.name ?? null })) })),
  };
}
