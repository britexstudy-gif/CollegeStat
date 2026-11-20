/** "Data coverage": the three essentials a family checks first (next deadline,
 * international tuition, IELTS minimum), each verified only when it has an
 * official source. Shared by the profile box, the badge and the D1 build. */
import { deadlineDate } from "./application-dates";
import { latest, tuition, type Deadline, type Requirement, type Sourced, type University } from "./domain";

export const sourceUrl = (r?: Sourced | null) => r?.source_url || r?.data_sources?.url || null;
export const isVerified = (r?: Sourced | null) => !!r && r.verification_status === "verified" && !!sourceUrl(r);

export function nextDeadline(u: University): (Deadline & { due_date: string }) | null {
  // Rows carry a date (due_date) or a timestamp (due_at); deadlineDate reads either.
  const rows = (u.deadlines || [])
    .filter((d) => d.due_date || d.due_at)
    .map((d) => ({ row: d, date: deadlineDate(d) }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const pick = upcoming[0] ?? rows.sort((a, b) => b.date.localeCompare(a.date))[0];
  return pick ? { ...pick.row, due_date: pick.date } : null;
}

export const ieltsMinimum = (u: University): Requirement | undefined =>
  latest((u.requirements || []).filter((r) => r.kind === "IELTS" && !r.program_id && r.minimum != null));

/** Verified essentials, 0-3. Card rows carry a precomputed `coverage` (D1 build). */
export function coverageCount(u: University): number {
  if (typeof u.coverage === "number" && !u.deadlines?.length && !u.requirements?.length) return u.coverage;
  return [nextDeadline(u), tuition(u), ieltsMinimum(u)].filter((r) => isVerified(r)).length;
}
