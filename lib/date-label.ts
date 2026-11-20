/** Dates everywhere read the same way: "15 Jan 2027", plus "in 23 days". */

const formats = new Map<string, Intl.DateTimeFormat>();

/** "15 Jan 2027" in the interface language. `iso` is YYYY-MM-DD or a full ISO time. */
/** Browsers without Uzbek date data print "2026 M11 27"; spell it the Uzbek way instead. */
const UZ_MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];

export function absoluteDate(iso: string, lang: string): string {
  if (lang === "uz") {
    const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
    return Number.isNaN(d.getTime()) ? iso : `${d.getUTCDate()} ${UZ_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  // English reads day-first ("15 Jan 2027"), as the owner asked, not US order.
  const key = lang === "en" ? "en-GB" : lang;
  let f = formats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(key, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    formats.set(key, f);
  }
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  return Number.isNaN(d.getTime()) ? iso : f.format(d);
}

/** Whole days from `today` (YYYY-MM-DD) to `iso`; negative when past. */
export function daysUntil(iso: string, today: string): number {
  return Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(today)) / 86400000);
}
