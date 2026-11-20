import { type University } from "./domain";
import { chanceFor, type Chance, type ChanceProfile } from "./admission-chance";
import { detectPlatform, ALTERNATIVES, type PlatformData, type PlatformID } from "./application-platforms";
import { applicationChecklist, scoreBands, type ChecklistRow, type ScoreBand, type StudentScores } from "./my-colleges";
import { applyModel, costModel, hasApplyContent, hasCostContent, latestEditionPositions, type ApplyModel, type CostModel, type SectionId } from "./university-profile-data";
import { profileRankingPositions, type ProfileRankingPosition } from "./profile-ranking-positions";
import type { SavedPersonalization } from "./personalize-ai";
import type { ProfileExtras } from "@/server/profile-extras";

/** One view-model for a university, shared by the profile page and the
 * comparison. Every block is either present with real data or null, so the
 * UI never decides about missing data, signed-in state or empty states itself. */

const href = (u?: string | null) => (u && /^https?:\/\//.test(u) ? u : null);

/* ── Dates: "15 Jan 2027" + "in 23 days" ───────────────────────────────── */
const LOCALE: Record<string, string> = { en: "en-GB" };
export function formatDay(iso: string, lang = "en") {
  return new Intl.DateTimeFormat(LOCALE[lang] || lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(iso.slice(0, 10) + "T00:00:00Z"),
  );
}
export const todayISO = () => new Date().toISOString().slice(0, 10);
export function daysUntil(iso: string, today = todayISO()) {
  return Math.round((Date.parse(iso.slice(0, 10) + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
}
export function relativeDays(days: number, lang = "en") {
  return new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(days, "day");
}

/* ── Your chances ─────────────────────────────────────────────────────── */
export type ChanceView =
  | { state: "signed-out"; rate: number | null }
  | { state: "no-scores"; rate: number | null }
  | { state: "no-data" }
  | { state: "ok"; chance: Chance; bands: ScoreBand[] };

export function chanceView(u: University, ctx: { signedIn: boolean; profile: ChanceProfile | null; scores?: StudentScores }): ChanceView {
  const rate = chanceFor({}, u).rate ?? null;
  if (!ctx.signedIn) return { state: "signed-out", rate };
  const p = ctx.profile;
  const hasScores = !!p && (p.sat != null || p.act != null || p.ielts != null || p.toefl != null);
  if (!hasScores) return { state: "no-scores", rate };
  const chance = chanceFor(p!, u);
  if (chance.category === "unknown" && !chance.english) return { state: "no-data" };
  return { state: "ok", chance, bands: scoreBands(u, ctx.scores || {}) };
}

/* ── Where to apply ───────────────────────────────────────────────────── */
export type WhereView = {
  platform: { id: PlatformID; name: string; url: string | null; shared: boolean };
  /** The university's own portal: the whole route when direct, the second step after uni-assist (TUMonline). */
  portal: string | null;
  reason: "verified" | "member" | "institution" | "region" | "country" | "fallback";
  reasonSource: string | null;
  alternatives: { name: string; url: string }[];
  official: { url: string; kind: "apply" | "admissions" | "website" } | null;
  deadline: { title: string; date: string; days: number; past: boolean; source_url: string | null } | null;
  deadlineText: string | null;
  /** With nothing upcoming: the latest published date, as a guide to next year's. */
  lastCycle: { title: string; date: string; source_url: string | null } | null;
  fee: { amount: number; currency: string } | null;
};

export function whereView(u: University, apply: ApplyModel, today = todayISO()): WhereView {
  // Built from the record itself (verified route + Common App membership), so no data file ships to the browser.
  const data: PlatformData = {
    generated_from: [],
    common_app: u.common_app ? { [u.id]: { essay: !!u.common_app.essay_required, recs: !!u.common_app.recs_required, fee: !!u.common_app.charges_fee, test_flexible: !!u.common_app.test_flexible, url: u.common_app.url || "" } } : {},
    routes: apply.route ? { [u.id]: { text: apply.route.text, source: apply.route.source_url } } : {},
    dates: {},
  };
  const m = detectPlatform(u, data);
  const reasonSource =
    m.reason.kind === "verified" ? m.reason.source : m.reason.kind === "member" ? m.reason.source : m.reason.kind === "institution" ? m.reason.source : null;
  const official = apply.applyUrl
    ? { url: apply.applyUrl, kind: "apply" as const }
    : apply.admissionsUrl
      ? { url: apply.admissionsUrl, kind: "admissions" as const }
      : href(u.website)
        ? { url: u.website!, kind: "website" as const }
        : null;
  const next = apply.deadlines.find((d) => !d.past) || null;
  return {
    platform: { id: m.platform.id, name: m.platform.name, url: href(m.platform.url), shared: m.platform.shared },
    portal: m.portal ?? null,
    reason: m.reason.kind,
    reasonSource: href(reasonSource),
    alternatives: m.alternatives.map((a) => ALTERNATIVES[a]).filter((a) => a && href(a.url)).slice(0, 2),
    official,
    deadline: next ? { title: next.title, date: next.date, days: daysUntil(next.date, today), past: false, source_url: next.source_url } : null,
    deadlineText: !next ? apply.deadlineText?.text ?? null : null,
    lastCycle: !next && apply.deadlines.length ? (({ title, date, source_url }) => ({ title, date, source_url }))(apply.deadlines[apply.deadlines.length - 1]) : null,
    fee: apply.fees[0] ? { amount: apply.fees[0].amount, currency: apply.fees[0].currency } : null,
  };
}

/* ── From the student's AI report ─────────────────────────────────────── */
export type ReportNote = { tier: string; reason: string } | null;
export function reportNote(u: University, report: SavedPersonalization | null): ReportNote {
  const hit = report?.universities.find((x) => x.slug === u.slug);
  return hit && hit.reason ? { tier: hit.tier, reason: hit.reason } : null;
}

/* ── The whole page ───────────────────────────────────────────────────── */
export type ViewContext = {
  signedIn: boolean;
  profile: ChanceProfile | null;
  scores?: StudentScores;
  report?: SavedPersonalization | null;
  today?: string;
};
export type UniversityView = {
  chances: ChanceView;
  checklist: ChecklistRow[];
  where: WhereView;
  report: ReportNote;
  apply: ApplyModel;
  costs: CostModel;
  positions: ProfileRankingPosition[];
};

export function universityView(u: University, extras: ProfileExtras | undefined, ctx: ViewContext): UniversityView {
  const today = ctx.today || todayISO();
  const apply = applyModel(u, extras, today);
  return {
    chances: chanceView(u, ctx),
    checklist: applicationChecklist(u),
    where: whereView(u, apply, today),
    report: ctx.signedIn ? reportNote(u, ctx.report ?? null) : null,
    apply,
    costs: costModel(u, extras),
    positions: latestEditionPositions(profileRankingPositions(u)),
  };
}

/** Section order below the quick-start: money first, then study, then the rest. */
export function profileSections(
  u: University,
  v: Pick<UniversityView, "apply" | "costs" | "positions">,
  extras: ProfileExtras | undefined,
  has: { programmes: boolean; media: boolean; outcomes: boolean },
): SectionId[] {
  return [
    ...(hasCostContent(v.costs, u, extras) ? (["costs"] as const) : []),
    ...(has.programmes ? (["programmes"] as const) : []),
    ...(extras?.scholarships?.length ? (["scholarships"] as const) : []),
    ...(hasApplyContent(v.apply) ? (["apply"] as const) : []),
    ...(v.positions.length ? (["rankings"] as const) : []),
    ...(has.media ? (["media"] as const) : []),
    "overview" as const,
    ...(has.outcomes ? (["outcomes"] as const) : []),
    "faq" as const,
  ];
}
