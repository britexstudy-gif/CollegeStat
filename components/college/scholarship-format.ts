import { countryName } from "@/lib/domain";
import { formatDate, relativeDays } from "@/lib/dates";
import { CENTRAL_ASIA, SOON_DAYS, deadlineInfo, type CentralAsiaCode, type Scholarship } from "@/lib/scholarships-data";
import type { Translate } from "./i18n";

export function levelLabel(level: string, t: Translate) {
  const key = ({ Bachelor: "sch.level.bachelor", Master: "sch.level.master", PhD: "sch.level.phd", Any: "sch.level.any" } as const)[level as "Bachelor"];
  return key ? t(key) : level;
}

/** "Central Asia" when all four countries qualify, else the countries by name. */
export function centralAsiaLabel(codes: CentralAsiaCode[], t: Translate) {
  return codes.length === CENTRAL_ASIA.length ? t("sch.ca.all") : t("sch.ca.some", { list: codes.map(countryName).join(", ") });
}

export type DeadlineView = {
  /** "15 Jan 2027", or null when no date is published. */
  date: string | null;
  /** "in 23 days" / "5 days ago". */
  relative: string | null;
  /** "Open", "Closed", "Next round" or "Date not announced yet". */
  status: string;
  /** "Next date: 7 Jan 2027" when a later step is dated. */
  next: string | null;
  tone: "open" | "soon" | "closed" | "none";
  /** "~Jan 2027": when a past deadline usually comes round again (same month, next year). */
  expected: string | null;
};

/** Regional-indicator flag for a two-letter country code ("UZ" -> the flag emoji). */
export const flagOf = (code: string | null | undefined) =>
  code && /^[A-Z]{2}$/.test(code) && code !== "EU" ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : code === "EU" ? "\u{1F1EA}\u{1F1FA}" : "";

/** The same month a year (or more) later, once that date is still ahead of today. */
export function expectedRound(iso: string, today: string): string {
  let y = Number(iso.slice(0, 4));
  const md = iso.slice(4);
  while (`${y}${md}` < today) y += 1;
  return `${y}${md}`;
}

/** What the deadline tile, the cards and the sidebar all show, from one source. */
export function deadlineView(s: Pick<Scholarship, "deadline" | "timeline">, today: string, t: Translate, locale: string, long = false): DeadlineView {
  const info = deadlineInfo(s, today);
  const fmt = (iso: string) => formatDate(iso, locale, long ? "long" : "short");
  const next = info.next?.date && info.next.date !== info.date ? t("sch.next.date", { date: fmt(info.next.date) }) : null;
  if (!info.date) return { date: null, relative: null, status: t(info.state === "next" ? "sch.state.next" : "sch.deadline.tba"), next, tone: "none", expected: null };
  const status = t(info.state === "open" ? "sch.state.open" : info.state === "next" ? "sch.state.next" : "sch.state.closed");
  const tone = info.state === "open" ? ((info.days ?? 0) <= SOON_DAYS ? "soon" : "open") : "closed";
  const expected =
    info.state === "closed"
      ? "~" + new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(expectedRound(info.date, today) + "T00:00:00Z"))
      : null;
  return { date: fmt(info.date), relative: relativeDays(info.date, today, locale), status, next, tone, expected };
}
