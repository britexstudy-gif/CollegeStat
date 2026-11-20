import type { IntakePreferences } from "./student-intake";

/** Things a student does that move their admissions prep forward. The
 * database assigns the same XP (see the student_progress migration); these
 * values only drive the optimistic UI. */
export type ActivityKind =
  | "practice"
  | "article"
  | "task"
  | "shortlist"
  | "ai"
  | "writing"
  | "profile"
  | "checkin";

export type ActivityEvent = {
  kind: ActivityKind;
  ref: string;
  /** UTC calendar day, YYYY-MM-DD. */
  day: string;
  xp: number;
};

const XP: Record<ActivityKind, number> = {
  practice: 20,
  writing: 15,
  task: 15,
  profile: 25,
  article: 10,
  ai: 10,
  checkin: 10,
  shortlist: 5,
};
const DAILY_CAP: Record<ActivityKind, number> = {
  article: 5,
  ai: 3,
  shortlist: 5,
  checkin: 1,
  profile: 1,
  practice: 10,
  writing: 10,
  task: 10,
};
export const DAILY_GOAL = 40;

export const isActivityKind = (v: unknown): v is ActivityKind =>
  typeof v === "string" && Object.hasOwn(XP, v);

export const utcDay = (date = new Date()) => date.toISOString().slice(0, 10);
export const addDays = (day: string, n: number) =>
  utcDay(new Date(Date.parse(day + "T00:00:00Z") + n * 86400000));

/** XP the next event would earn, mirroring the database trigger. */
export function awardFor(
  events: readonly ActivityEvent[],
  kind: ActivityKind,
  ref: string,
  day: string,
): number | null {
  if (events.some((e) => e.kind === kind && e.ref === ref && e.day === day))
    return null;
  const used = events.filter((e) => e.kind === kind && e.day === day).length;
  return used >= DAILY_CAP[kind] ? 0 : XP[kind];
}

const LEVELS = [
  { name: "Explorer", at: 0 },
  { name: "Researcher", at: 100 },
  { name: "Planner", at: 250 },
  { name: "Strategist", at: 500 },
  { name: "Applicant", at: 900 },
  { name: "Finalist", at: 1500 },
  { name: "Admit-ready", at: 2400 },
] as const;

export function levelFor(xp: number) {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].at) index = i;
  const current = LEVELS[index],
    next = LEVELS[index + 1];
  return {
    level: index + 1,
    name: current.name,
    floor: current.at,
    next: next?.at ?? null,
    nextName: next?.name ?? null,
    pct: next
      ? Math.round(((xp - current.at) / (next.at - current.at)) * 100)
      : 100,
  };
}

function totalXP(events: readonly ActivityEvent[]) {
  return events.reduce((sum, e) => sum + e.xp, 0);
}

export function xpOn(events: readonly ActivityEvent[], day: string) {
  return events.reduce((sum, e) => sum + (e.day === day ? e.xp : 0), 0);
}

/** Consecutive active days. Today not done yet keeps yesterday's streak alive. */
export function streakFor(events: readonly ActivityEvent[], today: string) {
  const days = new Set(events.map((e) => e.day));
  let cursor = days.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  let best = 0,
    run = 0,
    previous = "";
  for (const day of [...days].sort()) {
    run = previous && addDays(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return { current, best, activeToday: days.has(today) };
}

/** Monday-first week containing `today`, with XP per day. */
export function weekFor(events: readonly ActivityEvent[], today: string) {
  const weekday = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7;
  const monday = addDays(today, -weekday);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    return {
      day,
      label: "MTWTFSS"[i],
      xp: xpOn(events, day),
      future: day > today,
      today: day === today,
    };
  });
}

export function weeklySummary(events: readonly ActivityEvent[], today: string) {
  const week = weekFor(events, today);
  const start = week[0].day;
  const thisWeek = events.filter((e) => e.day >= start && e.day <= today);
  const lastStart = addDays(start, -7);
  const lastWeek = events.filter((e) => e.day >= lastStart && e.day < start);
  const byKind = {} as Record<ActivityKind, number>;
  for (const e of thisWeek) byKind[e.kind] = (byKind[e.kind] || 0) + 1;
  return {
    xp: totalXP(thisWeek),
    lastXp: totalXP(lastWeek),
    activeDays: new Set(thisWeek.map((e) => e.day)).size,
    byKind,
  };
}

export type JourneyInput = {
  prefs: IntakePreferences | undefined;
  profilePct: number;
  savedCount: number;
  events: readonly ActivityEvent[];
  openTasks: number;
  doneTasks: number;
};

export type JourneyStage = {
  id: "profile" | "shortlist" | "tests" | "essays" | "apply";
  title: string;
  hint: string;
  done: boolean;
  progress: number;
};

/** The five admissions stages and how far along the student is in each. */
export function journeyFor(input: JourneyInput) {
  const count = (kind: ActivityKind) =>
    input.events.filter((e) => e.kind === kind).length;
  const intake = input.prefs?.intake;
  const hasScore =
    !!intake?.english_score ||
    !!intake?.sat ||
    intake?.english_test === "native";
  const practice = count("practice");
  const writing = count("writing");
  const stages: JourneyStage[] = [
    {
      id: "profile",
      title: "Profile",
      hint: "Tell us your goals",
      progress: input.profilePct,
      done: input.profilePct >= 75,
    },
    {
      id: "shortlist",
      title: "Shortlist",
      hint: "Save 5 universities",
      progress: Math.min(100, input.savedCount * 20),
      done: input.savedCount >= 5,
    },
    {
      id: "tests",
      title: "Tests",
      hint: "Practise & set scores",
      progress: hasScore ? 100 : Math.min(100, practice * 25),
      done: hasScore || practice >= 4,
    },
    {
      id: "essays",
      title: "Essays",
      hint: "Draft your statement",
      progress: Math.min(100, writing * 34),
      done: writing >= 3,
    },
    {
      id: "apply",
      title: "Apply",
      hint: "Track every deadline",
      progress:
        input.doneTasks + input.openTasks
          ? Math.round(
              (input.doneTasks / (input.doneTasks + input.openTasks)) * 100,
            )
          : 0,
      done: input.doneTasks > 0 && input.openTasks === 0,
    },
  ];
  const currentIndex = Math.max(
    0,
    stages.findIndex((s) => !s.done),
  );
  const readiness = Math.round(
    stages.reduce((sum, s) => sum + s.progress, 0) / stages.length,
  );
  return {
    stages,
    current: stages.every((s) => s.done) ? stages.length - 1 : currentIndex,
    readiness,
  };
}

export type Quest = {
  id: string;
  kind: ActivityKind;
  ref?: string;
  title: string;
  detail: string;
  xp: number;
  href?: string;
  action?: "practice" | "writing" | "intake" | "ai";
  track?: string;
  done: boolean;
};

const TRACKS = ["math", "reading", "ielts"] as const;

/** Three small things to do today, rotated by day so the list stays fresh. */
export function dailyQuests(input: {
  today: string;
  events: readonly ActivityEvent[];
  profilePct: number;
  savedCount: number;
  nextTask?: { id: string; title: string };
  article?: { slug: string; title: string; minutes?: number };
  trackNames: Record<string, string>;
}): Quest[] {
  const doneToday = (kind: ActivityKind, ref?: string) =>
    input.events.some(
      (e) =>
        e.day === input.today && e.kind === kind && (!ref || e.ref === ref),
    );
  const seed = Number(input.today.replaceAll("-", "")) || 0;
  const track = TRACKS[seed % TRACKS.length];
  const list: Quest[] = [];
  if (input.profilePct < 75)
    list.push({
      id: "profile",
      kind: "profile",
      title: "Finish your profile",
      detail: "2 minutes · unlocks better matches",
      xp: XP.profile,
      action: "intake",
      done: doneToday("profile"),
    });
  list.push({
    id: "practice",
    kind: "practice",
    ref: track,
    title: `Practise ${input.trackNames[track] || track}`,
    detail: "4 questions · about 5 minutes",
    xp: XP.practice,
    action: "practice",
    track,
    done: doneToday("practice"),
  });
  if (input.article)
    list.push({
      id: "article",
      kind: "article",
      ref: input.article.slug,
      title: `Read: ${input.article.title}`,
      detail: `${input.article.minutes || 5} min read`,
      xp: XP.article,
      href: `/dashboard/library/articles?read=${encodeURIComponent(input.article.slug)}`,
      done: doneToday("article", input.article.slug),
    });
  if (input.nextTask)
    list.push({
      id: "task",
      kind: "task",
      ref: input.nextTask.id,
      title: `Tick off: ${input.nextTask.title}`,
      detail: "From your application plan",
      xp: XP.task,
      done: doneToday("task"),
    });
  else if (input.savedCount < 5)
    list.push({
      id: "shortlist",
      kind: "shortlist",
      title: "Save a university you like",
      detail: "Build a shortlist of five",
      xp: XP.shortlist,
      href: "/dashboard/universities",
      done: doneToday("shortlist"),
    });
  list.push({
    id: "writing",
    kind: "writing",
    title: "Write a few lines of your statement",
    detail: "Writing desk · saved privately",
    xp: XP.writing,
    action: "writing",
    done: doneToday("writing"),
  });
  list.push({
    id: "ai",
    kind: "ai",
    title: "Ask your AI coach one question",
    detail: "Uses your profile as context",
    xp: XP.ai,
    action: "ai",
    done: doneToday("ai"),
  });
  return list.slice(0, 3);
}


/** Plain-language weekly check-in that works without an AI key. */
export function localCheckin(input: {
  summary: ReturnType<typeof weeklySummary>;
  streak: number;
  journey: ReturnType<typeof journeyFor>;
}) {
  const { summary, streak, journey } = input;
  const stage = journey.stages[journey.current];
  const delta = summary.xp - summary.lastXp;
  const headline = !summary.xp
    ? "A fresh week. One small step today gets you going."
    : delta > 0
      ? `Great week: ${summary.xp} XP, ${delta} more than last week.`
      : `${summary.xp} XP this week across ${summary.activeDays} active ${summary.activeDays === 1 ? "day" : "days"}.`;
  const steps: string[] = [];
  if (stage) steps.push(`Focus on ${stage.title.toLowerCase()}: ${stage.hint.toLowerCase()}.`);
  if (!summary.byKind.practice)
    steps.push("Do one practice set. Short sessions add up.");
  if (!summary.byKind.writing)
    steps.push("Write a first paragraph of your personal statement.");
  if (!summary.byKind.article)
    steps.push("Read one guide about your destination country.");
  if (streak < 3) steps.push("Come back tomorrow to start a streak.");
  return { headline, steps: steps.slice(0, 3) };
}
