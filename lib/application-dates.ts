import type { Deadline } from "./domain";
export function deadlineLabel(d: Deadline): string {
  const date = d.due_date || d.due_at;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date)) + " · date only";
  }
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: d.timezone }).format(new Date(date)) + " · " + d.timezone;
}
export function deadlineDate(d: Deadline): string {
  if (d.due_date) return d.due_date;
  if (d.due_at.length === 10) return d.due_at;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: d.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(d.due_at));
  return ["year", "month", "day"].map(type => parts.find(p => p.type === type)?.value).join("-");
}
