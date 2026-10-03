import type { Sourced } from "./domain";
export type HistoryObservation = Sourced & { value: number | null; student_category?: string; program_id?: string | null; period?: string };
export function historySeries(records: HistoryObservation[]) {
  const groups = new Map<string, HistoryObservation[]>();
  for (const record of records) {
    if (record.value == null || !Number.isFinite(record.value) || record.year == null || record.verification_status !== "verified") continue;
    const scope = [record.student_category || "Reported population", record.program_id ? "Program " + record.program_id : "", record.period || ""].filter(Boolean).join(" · ");
    const group = groups.get(scope) || []; group.push(record); groups.set(scope, group);
  }
  return [...groups].map(([scope, observations]) => {
    const years = new Map<number, HistoryObservation[]>();
    observations.forEach(record => { const rows = years.get(record.year!) || []; rows.push(record); years.set(record.year!, rows); });
    // Conflicting values for one year remain available in the source table, never a fabricated line point.
    const points = [...years].flatMap(([year, rows]) => new Set(rows.map(r => r.value)).size === 1 ? [{ ...rows[0], year }] : []).sort((a,b) => a.year - b.year);
    return { scope, observations:observations.sort((a,b) => a.year! - b.year!), points };
  });
}
