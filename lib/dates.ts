/** The one place dates are formatted: an absolute date, a relative phrase and a status. */
export const localeOf = (lang: string) => ({ en: "en-GB", ru: "ru", uz: "uz", es: "es", de: "de", zh: "zh" })[lang] ?? "en-GB";

export const todayISO = () => new Date().toISOString().slice(0, 10);

/** Whole days from `today` to `iso` (negative when past). Both are YYYY-MM-DD. */
export const daysUntil = (iso: string, today: string) => Math.round((Date.parse(iso) - Date.parse(today)) / 864e5);

/** "15 Jan 2027" (short) or "15 January 2027" (long). Always day, month, year. */
export function formatDate(iso: string, locale: string, style: "short" | "long" = "short") {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: style === "long" ? "long" : "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(iso + "T00:00:00Z"),
  );
}

/** "in 23 days", "tomorrow", "today", "5 days ago", in the reader's language. */
export function relativeDays(iso: string, today: string, locale: string) {
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(daysUntil(iso, today), "day");
}

export type DateState = "upcoming" | "today" | "past";
export const dateState = (iso: string, today: string): DateState => {
  const n = daysUntil(iso, today);
  return n < 0 ? "past" : n === 0 ? "today" : "upcoming";
};
