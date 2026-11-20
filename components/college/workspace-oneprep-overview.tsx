"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HomeViewV6 } from "./home-v6";
import { ArrowRight, Check, Flame, Landmark, RefreshCw, Sparkles } from "lucide-react";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useCollege } from "./provider";
import { useI18n, type Translate } from "./i18n";
import { fitLabel, statusLabel, useMyColleges } from "./my-colleges";
import { useChanceProfile } from "./admission-chip";
import {
  Btn,
  Countdown,
  DataTable,
  DateText,
  EmptyState,
  List,
  ListRow,
  Meter,
  Page,
  PageHeader,
  ProgressBar,
  Section,
  Skeleton,
  SkeletonBlock,
  Stat,
  StatGroup,
  StatusPill,
  UniLogo,
  type Column,
  type Tone,
} from "./dash-ui";
import { validPlanDate } from "@/lib/workspace-planner";
import type { ChecklistItem } from "@/services/workspace";
import { countryName, type University } from "@/lib/domain";
import { essayTypes } from "@/lib/essay-types";
import { intakeCompleteness, type IntakePreferences } from "@/lib/student-intake";
import { readLegacyPlan, readPlan } from "@/lib/personal-plan";
import { readPersonalization } from "@/lib/personalize-ai";
import { applicationChecklist, homeGaps, nextDeadline, type Fit, type Gap } from "@/lib/my-colleges";
import { chanceFor } from "@/lib/admission-chance";
import { applicationRoute } from "@/lib/application-routes";
import { useProgress } from "@/lib/progress-store";
import { streakFor, weekFor } from "@/lib/student-progress";
import { effectivePlan, limitsOf, UNLIMITED, type PlanId } from "@/lib/plans";
import { absoluteDate, daysUntil } from "@/lib/date-label";
import type { MessageKey } from "@/lib/i18n/messages";

export type OverviewDate = { id: string; label: string; name: string; date: string; href: string };
export type TrackerItem = {
  id: string;
  status: string;
  deadline: string | null;
  university?: Pick<University, "id" | "name" | "slug" | "country_code" | "website" | "logo_url"> & Partial<University>;
};

type Chance = "reach" | "target" | "likely" | "unknown";
/** Board groups: the student's own reach/target/safety wins over the published-data estimate. */
export type Group = "reach" | "target" | "likely";
export type CollegeRow = {
  id: string;
  name: string;
  href: string;
  university?: University;
  chance: Chance;
  fit?: Fit;
  status?: string;
  apply?: { name: string; url: string };
  deadline?: string;
  /** Application checklist ticked off in My colleges. */
  ready: { done: number; total: number };
};
export type StepId = "profile" | "list" | "sorted" | "report" | "essay" | "deadline";
export type HomeStep = { id: StepId; done: boolean; href: string };
export type HomeReport = { summary?: string; created_at: string; actions: { title: string; due: string }[] } | null;
/** A dated change on a saved university's page (requirements re-checked, new admissions figures, a confirmed deadline). */
export type HomeUpdate = { key: string; name: string; href: string; kind: "requirements" | "admissions" | "deadline"; date: string; detail?: string };
export type WeekDay = { day: string; xp: number; future: boolean; today: boolean };

const STEP_HREF: Record<StepId, string> = {
  profile: "/dashboard/profile",
  list: "/dashboard/universities",
  sorted: "/dashboard?section=Universities",
  report: "/dashboard/profile",
  essay: "/dashboard/prepare?section=Writing",
  deadline: "/dashboard?section=Universities",
};

export const groupOf = (r: CollegeRow): Group | null =>
  r.fit ? (r.fit === "safety" ? "likely" : r.fit) : r.chance === "unknown" ? null : r.chance;

/** Essay drafts started on this device (the writing desk autosaves locally). */
function useEssayCount(owner: string | null): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!owner) return;
    let drafts: Record<string, { body?: string }> = {};
    try {
      drafts = JSON.parse(localStorage.getItem("collegestat-writing:" + owner) || "{}") || {};
    } catch {}
    const count = essayTypes.filter((type) => (drafts[type.id]?.body || "").replace(/^### .*$/gm, "").trim()).length;
    queueMicrotask(() => setN(count));
  }, [owner]);
  return n;
}

/** Dated, sourced changes on the saved universities' pages, newest first. */
export function universityUpdates(list: { university?: University; href: string }[], today: string): HomeUpdate[] {
  const out: HomeUpdate[] = [];
  for (const { university: u, href } of list) {
    if (!u) continue;
    const checked = u.application_brief?.checked_at;
    if (checked) out.push({ key: u.id + ":req", name: u.name, href, kind: "requirements", date: checked.slice(0, 10) });
    const adm = u.admission_summary;
    if (adm?.checked_at) out.push({ key: u.id + ":adm", name: u.name, href, kind: "admissions", date: adm.checked_at.slice(0, 10), detail: String(adm.year) });
    for (const d of u.deadlines || []) {
      if (d.verified_at && (d.due_date || d.due_at || "").slice(0, 10) >= today)
        out.push({ key: u.id + ":dl:" + d.id, name: u.name, href, kind: "deadline", date: d.verified_at.slice(0, 10), detail: d.title });
    }
  }
  return out.filter((x) => validPlanDate(x.date) && x.date <= today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
}

export function gapText(g: Gap, t: Translate) {
  switch (g.id) {
    case "soon":
      return t("oc.gap.soon", { name: g.name, days: g.days });
    case "english_low":
      return t("oc.gap.english_low", { n: g.n });
    case "unsorted":
      return t("oc.gap.unsorted", { n: g.n });
    default:
      return t(("oc.gap." + g.id) as MessageKey);
  }
}
export function gapHref(g: Gap) {
  if (g.id === "soon") return g.href;
  if (g.id === "empty") return "/dashboard/universities";
  if (g.id === "unsorted" || g.id === "safety") return "/dashboard?section=Universities";
  return "/dashboard/profile";
}

type ViewProps = {
  displayName: string;
  today: string;
  dataReady: boolean;
  tasks: ChecklistItem[];
  upcoming: OverviewDate[];
  tracker?: TrackerItem[];
  onCompleteTask: (id: string, done: boolean) => void;
  pendingTaskIds?: ReadonlySet<string>;
  onTab: (tab: "Writing" | "Checklist" | "Universities") => void;
};

/** The student's home: gathers real data, then renders HomeView. */
export function OnePrepOverview(props: ViewProps) {
  const college = useCollege();
  const router = useRouter();
  const profilePrefs = college?.profile?.preferences;
  const prefs = useMemo(() => (profilePrefs || {}) as IntakePreferences, [profilePrefs]);

  // First visit: ask the welcome questions once, until completed or skipped.
  const needsIntake = !!college?.profile && !prefs.intake?.completed_at && !prefs.intake?.skipped_at;
  useEffect(() => {
    if (needsIntake) router.replace("/dashboard/welcome");
  }, [needsIntake, router]);

  const home = useHomeData(props.tracker, props.today);
  return <HomeViewV6 {...props} {...home} />;
}

/** What the workspace controller shares with nested pages (Report reads the same list as Home). */
export type WorkspaceSummary = { tracker?: TrackerItem[]; today: string; tasks: ChecklistItem[] };
export const WorkspaceSummaryContext = createContext<WorkspaceSummary | null>(null);
export const useWorkspaceSummary = () => useContext(WorkspaceSummaryContext);

/** Everything Home shows, computed fresh from the saved list, the profile and today's activity. */
export function useHomeData(tracker: TrackerItem[] | undefined, today: string): HomeData {
  const college = useCollege();
  const owner = college?.user?.id ?? null;
  const profilePrefs = college?.profile?.preferences;
  const prefs = useMemo(() => (profilePrefs || {}) as IntakePreferences, [profilePrefs]);
  const props = { tracker, today };
  const essays = useEssayCount(owner);
  const { events } = useProgress(owner);
  const streak = useMemo(() => streakFor(events, props.today), [events, props.today]);
  const week = useMemo(() => weekFor(events, props.today), [events, props.today]);
  const { entries } = useMyColleges();
  const fits = useMemo(() => Object.fromEntries(Object.entries(entries).map(([id, e]) => [id, e.fit])), [entries]);
  const chanceProfile = useChanceProfile();

  const colleges = useMemo<CollegeRow[]>(
    () =>
      (tracker || []).map((x) => {
        const u = x.university as University | undefined;
        const full = !!u && Array.isArray(u.requirements) && Array.isArray(u.deadlines);
        const route = u ? applicationRoute(u) : undefined;
        const checklist = full ? applicationChecklist(u) : [];
        const done = new Set(entries[x.id]?.done || []);
        return {
          id: x.id,
          name: u?.name || "",
          href: u ? "/dashboard/university/" + u.slug : "/dashboard/universities",
          university: u,
          chance: full && chanceProfile ? chanceFor(chanceProfile, u).category : "unknown",
          fit: fits[x.id],
          status: x.status,
          apply: route ? { name: route.name, url: route.url } : undefined,
          deadline: full ? nextDeadline(u, x.deadline, today)?.date : x.deadline && x.deadline >= today ? x.deadline : undefined,
          ready: { done: checklist.filter((r) => done.has(r.id)).length, total: checklist.length },
        };
      }),
    [tracker, chanceProfile, fits, entries, today],
  );
  const updates = useMemo(() => universityUpdates(colleges, today), [colleges, today]);
  const gaps = useMemo(
    () =>
      homeGaps({
        prefs,
        list: (tracker || []).map((x) => ({ id: x.id, status: x.status, deadline: x.deadline, university: x.university as University | undefined })),
        fits,
        today,
      }),
    [prefs, tracker, fits, today],
  );
  const ai = readPersonalization(prefs);
  const plan = readPlan(prefs);
  const report: HomeReport = ai
    ? { summary: ai.summary, created_at: ai.created_at, actions: ai.actions.map((a) => ({ title: a.title, due: a.due })) }
    : plan
      ? { created_at: plan.created_at, actions: [] }
      : readLegacyPlan(prefs)
        ? { created_at: "", actions: [] }
        : null;
  const profilePct = intakeCompleteness(prefs).pct;
  const list = tracker || [];
  const steps: HomeStep[] = (
    [
      ["profile", !!prefs.intake?.completed_at || profilePct >= 60],
      ["list", list.length >= 3],
      ["sorted", list.length > 0 && list.every((x) => !!fits[x.id])],
      ["report", !!report],
      ["essay", essays > 0],
      ["deadline", colleges.some((c) => !!c.deadline)],
    ] as [StepId, boolean][]
  ).map(([id, done]) => ({ id, done, href: STEP_HREF[id] }));

  return {
    colleges,
    gaps,
    steps,
    report,
    streak: streak.current,
    activeToday: streak.activeToday,
    week,
    essays,
    updates,
    plan: effectivePlan(prefs),
  };
}

export type HomeData = {
  colleges: CollegeRow[];
  gaps: Gap[];
  steps: HomeStep[];
  report: HomeReport;
  streak: number;
  activeToday: boolean;
  week: WeekDay[];
  essays: number;
  updates: HomeUpdate[];
  plan: PlanId;
};

export function HomeView({
  displayName,
  today,
  dataReady,
  tasks,
  upcoming,
  colleges,
  gaps,
  steps,
  report,
  streak,
  activeToday,
  updates,
  plan,
  onCompleteTask,
  pendingTaskIds = new Set<string>(),
}: ViewProps & HomeData) {
  const { t } = useI18n();
  const deadlines = useMemo(() => {
    const own = colleges.filter((c) => c.deadline).map((c) => ({ key: "u" + c.id, date: c.deadline!, name: c.name, href: c.href, apply: c.apply?.name }));
    const extra = upcoming.filter((x) => validPlanDate(x.date)).map((x) => ({ key: x.label + x.id, date: x.date, name: x.name, href: x.href, apply: undefined }));
    const seen = new Set<string>();
    return [...own, ...extra]
      .filter((x) => x.name && x.date >= today && !seen.has(x.date + x.name) && (seen.add(x.date + x.name), true))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [colleges, upcoming, today]);
  const first = (displayName || "").split(" ")[0] || "";
  const done = steps.filter((s) => s.done).length;
  const left = steps.length - done;
  const next = steps.find((s) => !s.done);

  return (
    <Page busy={!dataReady}>
      <PageHeader
        id="d3-hello"
        title={first ? t("d2.home.hi", { name: first }) : t("d2.home.hi_plain")}
        description={left === 0 ? t("d2.home.sub.done") : left === 1 ? t("d2.home.sub.one") : t("d2.home.sub.n", { n: left })}
        actions={
          next ? (
            <Btn variant="primary" href={next.href}>
              {t(`d2.step.${next.id}` as MessageKey)} <ArrowRight aria-hidden="true" />
            </Btn>
          ) : (
            <Btn href="/dashboard?section=Checklist">
              {t("d2.home.week.open")} <ArrowRight aria-hidden="true" />
            </Btn>
          )
        }
      />

      <StatGroup label={t("d2.home.path")}>
        <Stat
          label={t("d4.home.plan")}
          value={
            <span className="dk-num">
              {done}
              <span className="dk-faint">/{steps.length}</span>
            </span>
          }
          hint={<ProgressBar value={(done / Math.max(1, steps.length)) * 100} label={t("d2.home.path.done", { done, total: steps.length })} className="mt-1.5 w-full min-w-24" />}
        />
        <NextDeadlineStat first={deadlines[0]} today={today} dataReady={dataReady} />
        <BalanceStat rows={colleges} dataReady={dataReady} />
        <Stat
          label={t("d4.home.streak")}
          icon={<Flame className={cn("size-3.5", streak > 0 ? "text-[var(--dk-warning)]" : "")} aria-hidden="true" />}
          value={streak > 0 ? t("d4.home.days", { n: streak }) : "0"}
          hint={streak > 0 && activeToday ? t("d2.streak.kept") : t("d2.streak.keep")}
        />
      </StatGroup>

      <CollegesTable rows={colleges} dataReady={dataReady} plan={plan} today={today} />

      <div className="dk-grid-2">
        <NextTasks tasks={tasks} gaps={gaps} steps={steps} today={today} dataReady={dataReady} pending={pendingTaskIds} onComplete={onCompleteTask} />
        <ReportPanel report={report} today={today} />
      </div>

      {updates.length > 0 && <UpdatesList updates={updates} />}
    </Page>
  );
}

/** Reach / target / safety counts as one segmented bar, with the one thing the list is missing. */
function BalanceStat({ rows, dataReady }: { rows: CollegeRow[]; dataReady: boolean }) {
  const { t } = useI18n();
  if (!dataReady) return <Stat label={t("d5.balance")} value={<Skeleton className="h-6 w-28" />} />;
  const n = { reach: 0, target: 0, likely: 0 };
  for (const r of rows) {
    const g = groupOf(r);
    if (g && g in n) n[g as keyof typeof n] += 1;
  }
  const total = n.reach + n.target + n.likely;
  const hint = !total ? "d5.balance.empty" : !n.likely ? "d5.balance.safety" : !n.target ? "d5.balance.target" : "d5.balance.ok";
  const parts = [
    { g: "reach", c: n.reach },
    { g: "target", c: n.target },
    { g: "likely", c: n.likely },
  ] as const;
  return (
    <Stat
      label={t("d5.balance")}
      href="/dashboard/universities"
      value={
        <span className="dk-balance-nums dk-num">
          {parts.map((p) => (
            <span key={p.g} title={groupLabel(t, p.g)}>
              <i className={"is-" + p.g} aria-hidden="true" />
              {p.c}
              <span className="sr-only"> {groupLabel(t, p.g)}</span>
            </span>
          ))}
        </span>
      }
      hint={
        <span className="grid w-full gap-1.5">
          <span className="dk-balance-bar" aria-hidden="true">
            {total > 0 && parts.map((p) => p.c > 0 && <i key={p.g} className={"is-" + p.g} style={{ flexGrow: p.c }} />)}
          </span>
          {t(hint as MessageKey)}
        </span>
      }
    />
  );
}

type DeadlineItem = { key: string; date: string; name: string; href: string; apply?: string };

function NextDeadlineStat({ first, today, dataReady }: { first?: DeadlineItem; today: string; dataReady: boolean }) {
  const { t } = useI18n();
  if (!dataReady) return <Stat label={t("d3.home.deadline")} value={<Skeleton className="h-6 w-28" />} />;
  if (!first) return <Stat label={t("d3.home.deadline")} value="—" hint={t("oc.mc.board.none")} href="/dashboard/universities" />;
  const days = daysUntil(first.date, today);
  return (
    <Stat
      label={t("d3.home.deadline")}
      href={first.href}
      value={first.name}
      hint={
        <span className="flex items-center gap-2">
          <Countdown days={days} />
          <DateText date={first.date} />
        </span>
      }
    />
  );
}

/* ── Next steps: open tasks first, then the gaps that matter ────────── */

function NextTasks({
  tasks,
  gaps,
  steps,
  today,
  dataReady,
  pending,
  onComplete,
}: {
  tasks: ChecklistItem[];
  gaps: Gap[];
  steps: HomeStep[];
  today: string;
  dataReady: boolean;
  pending: ReadonlySet<string>;
  onComplete: (id: string, done: boolean) => void;
}) {
  const { t, lang } = useI18n();
  const open = tasks
    .filter((x) => !x.done)
    .sort((a, b) => (a.due_at && validPlanDate(a.due_at) ? a.due_at : "9999").localeCompare(b.due_at && validPlanDate(b.due_at) ? b.due_at : "9999"))
    .slice(0, 4);
  const nextStep = steps.find((s) => !s.done);
  const fill: { key: string; text: string; href: string; urgent?: boolean }[] = [
    ...gaps.map((g) => ({ key: "g" + g.id, text: gapText(g, t), href: gapHref(g), urgent: g.id === "soon" })),
    ...(nextStep && !gaps.some((g) => gapHref(g) === nextStep.href) ? [{ key: "s" + nextStep.id, text: t(`d2.step.${nextStep.id}` as MessageKey), href: nextStep.href }] : []),
  ].slice(0, Math.max(0, 4 - open.length));
  return (
    <Section id="d3-next" title={t("d3.home.next")} href="/dashboard?section=Checklist" link={t("d2.home.week.open")}>
      {!dataReady ? (
        <SkeletonBlock className="h-40" />
      ) : !open.length && !fill.length ? (
        <div className="dk-panel">
          <EmptyState icon={<Check />} text={t("oc.gap.none")} action={t("d2.home.week.cta")} href="/dashboard?section=Checklist" />
        </div>
      ) : (
        <List label={t("d3.home.next")}>
          {open.map((task) => {
            const late = !!task.due_at && validPlanDate(task.due_at) && task.due_at < today;
            return (
              <ListRow
                key={task.id}
                leading={<Checkbox checked={task.done} disabled={pending.has(task.id)} aria-label={task.title} onCheckedChange={(v) => onComplete(task.id, v === true)} />}
                title={task.title}
                trailing={
                  task.due_at && validPlanDate(task.due_at) ? (
                    late ? (
                      <StatusPill tone="danger">{t("db.late", { n: -daysUntil(task.due_at, today) })}</StatusPill>
                    ) : (
                      <span>{absoluteDate(task.due_at, lang)}</span>
                    )
                  ) : undefined
                }
              />
            );
          })}
          {fill.map((f) => (
            <ListRow
              key={f.key}
              href={f.href}
              leading={<span className={cn("dk-dot ml-[5px] mr-[5px]", f.urgent ? "is-warning" : "is-accent")} aria-hidden="true" />}
              title={f.text}
              trailing={<ArrowRight className="size-4 text-[var(--dk-faint)]" aria-hidden="true" />}
            />
          ))}
        </List>
      )}
    </Section>
  );
}

/* ── My colleges: one table ────────────────────────────────────────── */

const GROUP_TONE: Record<Group, Tone> = { reach: "warning", target: "accent", likely: "success" };
export const groupLabel = (t: Translate, g: Group) => fitLabel(t, g === "likely" ? "safety" : g);
const GROUP_ORDER: Record<string, number> = { reach: 0, target: 1, likely: 2, none: 3 };

export function ChancePill({ group }: { group: Group | null }) {
  const { t } = useI18n();
  return group ? (
    <StatusPill tone={GROUP_TONE[group]} dot>
      {groupLabel(t, group)}
    </StatusPill>
  ) : (
    <StatusPill>{t("oc.mc.fit.unsorted")}</StatusPill>
  );
}

function CollegesTable({ rows, dataReady, plan, today }: { rows: CollegeRow[]; dataReady: boolean; plan: PlanId; today: string }) {
  const { t } = useI18n();
  const listLimit = limitsOf(plan).listSize;
  const columns: Column<CollegeRow>[] = [
    {
      key: "name",
      header: t("d4.col.university"),
      sort: (r) => r.name,
      cell: (r) => {
        const g = groupOf(r);
        return (
          <div className="dk-cell-id">
            {r.university && <UniLogo university={r.university} />}
            <span>
              <Link href={r.href} className="dk-row-link">
                <strong>{r.name}</strong>
              </Link>
              <small>
                {[r.university?.country_code ? countryName(r.university.country_code) : "", r.status ? statusLabel(t, r.status) : ""].filter(Boolean).join(" · ")}
                <span className="sm:hidden">{" · " + (g ? groupLabel(t, g) : t("oc.mc.fit.unsorted"))}</span>
              </small>
            </span>
          </div>
        );
      },
    },
    { key: "chance", header: t("d4.col.chance"), hide: "sm", width: "8.5rem", sort: (r) => GROUP_ORDER[groupOf(r) || "none"], cell: (r) => <ChancePill group={groupOf(r)} /> },
    {
      key: "ready",
      header: t("d3.home.ready"),
      hide: "md",
      width: "9rem",
      sort: (r) => (r.ready.total ? r.ready.done / r.ready.total : 0),
      cell: (r) => <Meter done={r.ready.done} total={r.ready.total} label={t("d2.home.ready")} />,
    },
    {
      key: "deadline",
      header: t("d4.col.deadline"),
      align: "end",
      width: "7.5rem",
      sort: (r) => r.deadline || "9999",
      cell: (r) => (r.deadline ? <Countdown days={daysUntil(r.deadline, today)} /> : <span className="dk-faint text-[12.5px]">{t("oc.mc.board.none")}</span>),
    },
  ];
  return (
    <Section
      id="d3-colleges"
      title={t("d2.nav.colleges")}
      count={rows.length || undefined}
      tools={
        listLimit !== UNLIMITED && rows.length > 0 ? (
          <Link href="/dashboard/plans" className="dk-link dk-num dk-hide-sm">
            {t("d2.home.colleges.used", { n: rows.length, max: listLimit })}
          </Link>
        ) : undefined
      }
      href="/dashboard?section=Universities"
      link={t("d2.home.open")}
    >
      {!dataReady ? (
        <SkeletonBlock className="h-48" />
      ) : (
        <DataTable
          label={t("d2.nav.colleges")}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          initialSort={{ key: "deadline", dir: "asc" }}
          empty={<EmptyState icon={<Landmark />} text={t("d2.home.colleges.empty")} action={t("d2.home.colleges.cta")} href="/dashboard/universities" />}
        />
      )}
    </Section>
  );
}

/* ── Report + updates ──────────────────────────────────────────────── */

function ReportPanel({ report, today }: { report: HomeReport; today: string }) {
  const { t, lang } = useI18n();
  const actions = (report?.actions || []).filter((a) => a.due >= today).slice(0, 2);
  return (
    <Section
      id="d3-report"
      title={t("d2.home.report")}
      tools={report?.created_at ? <span className="dk-faint dk-num">{absoluteDate(report.created_at, lang)}</span> : undefined}
    >
      {report ? (
        <div className="dk-panel dk-panel--pad grid gap-3">
          {report.summary && <p className="line-clamp-4 text-[13.5px] leading-relaxed text-pretty">{report.summary}</p>}
          {actions.length > 0 && (
            <ul className="dk-list dk-list--divided dk-list--flush border-t border-[var(--dk-line)]">
              {actions.map((a) => (
                <li key={a.title} className="flex min-h-9 items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate">{a.title}</span>
                  <DateText date={a.due} className="shrink-0 text-[12.5px] dk-muted" />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" href="/dashboard/report">
              {t("d2.home.report.open")}
            </Btn>
            <Btn size="sm" variant="ghost" href="/dashboard/assistant">
              <Sparkles aria-hidden="true" /> {t("d3.home.ask")}
            </Btn>
          </div>
        </div>
      ) : (
        <div className="dk-panel">
          <EmptyState icon={<Sparkles />} text={t("d2.home.report.none")} action={t("d2.home.report.cta")} href="/dashboard/profile" />
        </div>
      )}
    </Section>
  );
}

function UpdatesList({ updates }: { updates: HomeUpdate[] }) {
  const { t } = useI18n();
  return (
    <Section id="d3-updates" title={t("d3.home.updates")}>
      <List label={t("d3.home.updates")}>
        {updates.map((u) => (
          <ListRow
            key={u.key}
            href={u.href}
            leading={<RefreshCw className="size-4 shrink-0 text-[var(--dk-faint)]" aria-hidden="true" />}
            title={u.name}
            meta={u.kind === "admissions" ? t("d3.upd.admissions", { year: u.detail || "" }) : u.kind === "deadline" ? t("d3.upd.deadline", { title: u.detail || "" }) : t("d3.upd.requirements")}
            trailing={<DateText date={u.date} />}
          />
        ))}
      </List>
    </Section>
  );
}
