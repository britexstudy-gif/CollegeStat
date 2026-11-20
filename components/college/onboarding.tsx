"use client";
import { Mascot } from "./mascot";
import { AIMark } from "./ai-mark";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, ArrowUp, Check, CornerDownLeft, Plus, Search, Sparkles, X } from "lucide-react";
import { useCollege } from "@/components/college/provider";
import { Progress } from "@/components/ui/progress";
import { saveProfile } from "@/services/profile-account";
import { recordActivity } from "@/lib/progress-store";
import type { IntakePreferences } from "@/lib/student-intake";
import { Personalize, regionName } from "./onboarding-personalize";
import { LanguageSwitcher, useI18n } from "./i18n";
import { EXAMS, examFor, normalizeGrade } from "@/lib/grades/convert";
import {
  INTEREST_QUESTIONS,
  MAX_PROGRAMMES,
  PROGRAMMES,
  PROGRAMME_GROUPS,
  groupKey,
  programme,
  programmeKey,
  searchProgrammes,
  suggestGroups,
  type InterestQuestion,
  type Programme,
  type ProgrammeGroup,
} from "@/lib/programmes";
import {
  ACTIVITY_TYPES,
  APP_HOURS,
  BUDGETS,
  CAREERS,
  CERTIFICATES,
  CERT_TESTS,
  CITY_SIZES,
  CITY_SUGGESTIONS,
  CLASS_RANKS,
  CORE_TESTS,
  DEFAULT_SCALE,
  DEPTH_AREAS,
  DEPTH_HOURS,
  DEPTH_YEARS,
  DESTINATIONS,
  DISTANCES,
  EXAM_STATUS,
  FUNDING,
  GRADE_SCALES,
  HOME_FIRST,
  HOME_OTHER,
  HONOUR_LEVELS,
  IMPORTANCE,
  INTAKE_TERMS,
  MAX_ACTIVITIES,
  MAX_HONOURS,
  MEDALS,
  RESEARCH_LEVELS,
  SCHOOL_CLASSES,
  SCHOOL_SUBJECTS,
  SCHOOL_TYPES,
  STUDY_LANGS,
  TEST_STATUS,
  WORK_AFTER,
  YES_MAYBE_NO,
  answersFrom,
  certTest,
  graduationYears,
  pastMonths,
  preferencesFrom,
  syncActivities,
  syncTests,
  testScore,
  upcomingMonths,
  type ActivityEntry,
  type Answers,
  type CertId,
  type DepthEntry,
  type GradeScale,
  type HonourEntry,
  type TestEntry,
} from "./onboarding-steps";
import type { MessageKey } from "@/lib/i18n/messages";
import "./onboarding.css";

export type { Answers };

const DRAFT_KEY = "cs-onboarding-draft";
const STEP_KEY = "cs-onboarding-step";
/** "What worries you most?" is kept as the first support topic, which picks what the dashboard shows first. */
const WORRIES = ["money", "english", "visa", "essays", "choosing"] as const;
const WORRY_SUPPORT: Record<(typeof WORRIES)[number], string> = {
  money: "scholarships",
  english: "tests",
  visa: "visas",
  essays: "essays",
  choosing: "shortlist",
};
const START_YEARS = [2027, 2028];

const flag = (code: string) =>
  code.length === 2
    ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)))
    : "";

type Section = "about" | "goals" | "where" | "money" | "academics" | "tests" | "fit" | "activities" | "timeline";
type StepId =
  | "name" | "home" | "school" | "cert" | "year"
  | "subjects" | "countries" | "budget"
  | "gpa" | "strengths" | "tests"
  | "language" | "goals" | "place"
  | "depth" | "activities" | "honours"
  | "worry";

type Step = {
  id: StepId;
  section: Section;
  title: MessageKey;
  hint?: MessageKey;
  /** Rough seconds to answer, for "about X min left". */
  secs: number;
  /** Required steps block Continue until answered; optional ones can be skipped. */
  ready?: (a: Answers) => boolean;
  empty?: (a: Answers) => boolean;
  /** Adaptive: the step is only asked when this holds. */
  when?: (a: Answers) => boolean;
};

const anyDepth = (a: Answers) => Object.values(a.activity_depth || {}).some((d) => d && d.years !== "0");

/** Easy and required first (who, what, where, how much), then grades and tests, then the longer optional ones.
 * Answers that never changed a plan or a chance (climate, campus type, helpers) are no longer asked. */
const STEPS: Step[] = [
  { id: "name", section: "about", title: "ob.name.title", hint: "obd.name.hint", secs: 8, ready: (a) => a.name.trim().length > 0 },
  { id: "home", section: "about", title: "ob.home.title", hint: "ob.home.hint", secs: 12, ready: (a) => !!a.home_country },
  { id: "school", section: "about", title: "ob.school.title", secs: 15, ready: (a) => !!a.school_type },
  { id: "cert", section: "about", title: "ob.cert.title", secs: 8, ready: (a) => !!a.certificate },
  { id: "year", section: "about", title: "ob.year.title", hint: "ob.year.hint", secs: 12, ready: (a) => !!a.graduation_year },
  { id: "subjects", section: "goals", title: "ob.subjects.title", hint: "obd.subjects.hint", secs: 30, ready: (a) => a.subjects.length > 0 },
  { id: "countries", section: "where", title: "ob.countries.title", hint: "obd.countries.hint", secs: 15, ready: (a) => a.countries.length > 0 },
  {
    id: "budget",
    section: "money",
    title: "ob.budget.title",
    hint: "ob.budget.hint",
    secs: 20,
    ready: (a) => !!a.funding && (a.budget !== undefined || a.funding === "full"),
  },
  { id: "gpa", section: "academics", title: "ob.gpa.title", hint: "ob.gpa.hint", secs: 25, empty: (a) => !a.grade.trim() && !a.class_rank },
  { id: "strengths", section: "academics", title: "obd.strengths.title", hint: "obd.strengths.hint", secs: 18, empty: (a) => !a.strong_subjects?.length && !a.research },
  { id: "tests", section: "tests", title: "obd.tests.title", hint: "obd.tests.hint", secs: 40, empty: (a) => !a.tests.length && !a.tests_declined?.length && !a.exam_status },
  { id: "language", section: "fit", title: "obd.lang.title", hint: "obd.lang.hint", secs: 12, empty: (a) => !a.study_langs?.length && !a.foundation },
  { id: "goals", section: "fit", title: "obd.goals.title", hint: "obd.goals.hint", secs: 15, empty: (a) => !a.career && !a.work_after && !a.return_home },
  { id: "place", section: "fit", title: "obd.place.title", hint: "obd.place.hint", secs: 15, empty: (a) => !a.city_size && !a.safety && !a.distance && !a.halal },
  { id: "depth", section: "activities", title: "obd.depth.title", hint: "obd.depth.hint", secs: 25, empty: (a) => !Object.keys(a.activity_depth || {}).length },
  {
    id: "activities",
    section: "activities",
    title: "ob.activities.title",
    hint: "obd.activities.hint",
    secs: 45,
    empty: (a) => !a.activity_list.length,
    when: (a) => anyDepth(a) || a.activity_list.length > 0,
  },
  { id: "honours", section: "activities", title: "obd.honours.title", hint: "obd.honours.hint", secs: 30, empty: (a) => !a.honours.some((h) => h.title.trim()) },
  { id: "worry", section: "timeline", title: "ob.worry.title", hint: "ob.worry.hint", secs: 14, empty: (a) => !a.support.length && !a.app_hours },
];
/** Older links and saved steps: the merged questions now live in these. */
const LEGACY_STEP: Record<string, StepId> = { values: "place", timeline: "worry" };
const STEP_IDS = [...STEPS.map((x) => x.id), ...Object.keys(LEGACY_STEP)] as string[];
const resolveStep = (id: string): StepId => LEGACY_STEP[id] ?? (id as StepId);

/** Foundation years matter for an 11-year certificate, mostly in the UK. */
const asksFoundation = (a: Answers) => a.certificate === "attestat" || a.certificate === "other" || a.countries.includes("GB");

/** Full-screen, one-question-at-a-time onboarding shown right after sign-up. */
export function Onboarding() {
  const s = useCollege();
  if (!s.profile)
    return (
      <div className="ob" aria-busy="true">
      </div>
    );
  return <OnboardingForm key={s.profile.id} />;
}

function readDraft(): Partial<Answers> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Partial<Answers>) : null;
  } catch {
    return null;
  }
}

/** The questions. `save` replaces saving to the account (local preview only). */
export function OnboardingForm({
  save,
  startAt,
  initial,
}: {
  save?: (answers: Answers) => Promise<void>;
  /** Preview only: open on this question with these answers. */
  startAt?: string;
  initial?: Partial<Answers>;
} = {}) {
  const s = useCollege();
  const router = useRouter();
  const { t, lang } = useI18n();
  const mainRef = useRef<HTMLElement>(null);
  const prefs = useMemo(() => (s.profile?.preferences || {}) as IntakePreferences, [s.profile]);
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  const params = useSearchParams();
  // ?step=tests edits one answer and returns to the profile (links from the profile and the chance chips).
  const singleId = save ? null : (params.get("step") as StepId | null);
  const single = singleId && STEP_IDS.includes(singleId) ? resolveStep(singleId) : null;
  const [stepId, setStepId] = useState<StepId>(() => {
    if (single) return single;
    if (startAt && STEP_IDS.includes(startAt)) return resolveStep(startAt);
    // Resume where this browser left off, unless the questions were already finished.
    if ((prefs.intake as { completed_at?: string } | undefined)?.completed_at) return "name";
    try {
      const saved = localStorage.getItem(STEP_KEY) || "";
      return STEP_IDS.includes(saved) ? resolveStep(saved) : "name";
    } catch {
      return "name";
    }
  });
  useEffect(() => {
    try {
      if (!single) localStorage.setItem(STEP_KEY, stepId);
    } catch {}
  }, [stepId, single]);
  const [openActivity, setOpenActivity] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [personalizing, setPersonalizing] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<ProgrammeGroup | null>(null);
  const [helping, setHelping] = useState(false);
  const [a, setA] = useState<Answers>(() => {
    const base = answersFrom(prefs, s.profile?.display_name);
    // Sign-up asks the country; start the "home" question from it.
    const signupCountry = s.user?.user_metadata?.country;
    if (!base.home_country && typeof signupCountry === "string" && /^[A-Z]{2}$/.test(signupCountry)) base.home_country = signupCountry;
    // A draft from this browser only fills in what the account does not have yet.
    const draft = save || (prefs.intake as { details?: unknown } | undefined)?.details ? null : readDraft();
    return { ...base, ...(draft || {}), ...(initial || {}), interface_lang: base.interface_lang ?? draft?.interface_lang };
  });
  const [savedAt, setSavedAt] = useState(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const set = (patch: Partial<Answers>) => setA((x) => ({ ...x, ...patch }));

  // Adaptive flow: steps whose `when` fails are left out of the order and the progress.
  const visible = STEPS.filter((x) => !x.when || x.when(a) || x.id === single);
  let index = visible.findIndex((x) => x.id === stepId);
  if (index < 0) {
    // The current step just became hidden: continue with the next one in the full order.
    const order = STEPS.map((x) => x.id);
    const pos = order.indexOf(stepId);
    index = Math.max(0, visible.findIndex((x) => order.indexOf(x.id) > pos));
  }
  const current = visible[index];
  const last = index === visible.length - 1;
  const optional = !current.ready;
  const skipping = optional && !!current.empty?.(a);
  const ok = current.ready ? current.ready(a) : true;
  const pct = Math.round(((index + 1) / visible.length) * 100);
  const secondsLeft = visible.slice(index).reduce((n, x) => n + x.secs, 0);
  const minutesLeft = Math.round(secondsLeft / 60);
  const stepsLeft = visible.length - index;
  const goTo = (i: number) => setStepId(visible[Math.max(0, Math.min(visible.length - 1, i))].id);

  /** Save the answers so far. Failures stay quiet until the final save; the draft is kept locally. */
  const persist = (answers: Answers, complete: boolean) => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(answers));
    } catch {}
    if (save) return complete ? save(answers) : Promise.resolve();
    const owner = s.accountScope.capture();
    if (!s.user || owner.owner !== s.user.id) return Promise.reject(new Error("signed out"));
    const run = async () => {
      await saveProfile(
        s.accountScope,
        {
          display_name: answers.name.trim().slice(0, 120) || s.profile?.display_name || null,
          preferences: preferencesFrom(answers, prefsRef.current, complete) as unknown as Record<string, unknown>,
        },
        owner,
      );
      setSavedAt(Date.now());
    };
    const job = queue.current.then(run, run);
    queue.current = job.catch(() => {});
    return job;
  };

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await persist(a, true);
      if (!save) {
        await s.refreshAccount();
        void recordActivity("profile", "intake", { silent: true });
        try {
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem(STEP_KEY);
        } catch {}
      }
      setPersonalizing(true);
    } catch {
      toast.error(t("ob.error"));
    } finally {
      setBusy(false);
    }
  };

  /** Save without finishing, then leave: for "Finish later" and single-answer edits. */
  const saveAndLeave = async (to: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await persist(a, false);
      if (!save) await s.refreshAccount();
      router.push(to);
    } catch {
      toast.error(t("ob.error"));
      setBusy(false);
    }
  };

  const next = () => {
    if (!ok || busy) return;
    if (single) void saveAndLeave("/dashboard/profile");
    else if (last) void finish();
    else {
      if (index > 0) void persist(a, false).catch(() => {});
      goTo(index + 1);
    }
  };
  const back = () => goTo(index - 1);

  useEffect(() => {
    // The plan screens have their own buttons; Enter must not save again.
    if (personalizing) return;
    const onKey = (e: KeyboardEvent) => {
      // Skip keys another control already handled (menus, the programme search) and IME composition (zh).
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
      // Multi-field entries (tests, activities, honours) keep Enter for their own fields.
      if (target instanceof HTMLTextAreaElement || target?.closest(".ob-entry, .ob-tests")) return;
      // Back, Continue and the language menu keep their own Enter; answer buttons
      // use Enter to continue (Space still toggles them).
      if (target?.closest("button, a, [role=menu]") && !target.closest(".ob-option, .ob-chips button")) return;
      if (target instanceof HTMLSelectElement) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        next();
      } else if (e.key === "Escape" && index > 0 && !typing) back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // A new question replaces the focused button; move focus into it so keyboard
  // users keep their place. Next frame: the app shell focuses <main> on route
  // change after our own effects run, which would otherwise take focus from the name field.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const root = mainRef.current;
      if (!root || root.contains(document.activeElement)) return;
      root.querySelector<HTMLElement>('[aria-pressed="true"], input, button')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [current.id]);

  const choice = (selected: boolean, onClick: () => void, children: React.ReactNode, key: string, rank?: number) => (
    <button key={key} type="button" className="ob-option" aria-pressed={selected} onClick={onClick}>
      <span>{children}</span>
      <i aria-hidden="true" className={rank ? "is-rank" : undefined}>
        {rank ? rank : selected && <Check size={14} />}
      </i>
    </button>
  );
  const chip = (selected: boolean, onClick: () => void, label: string, key: string) => (
    <button key={key} type="button" aria-pressed={selected} onClick={onClick}>
      {label}
    </button>
  );
  // At the limit, a new pick does nothing rather than silently dropping the first one.
  const toggle = (list: string[], value: string, max: number) =>
    list.includes(value) ? list.filter((v) => v !== value) : list.length >= max ? list : [...list, value];
  const key = (prefix: string, id: string) => `${prefix}.${id}` as MessageKey;
  /** One labelled row of single-choice chips; tapping the chosen one clears it. */
  const pickOne = <T extends string>(id: string, label: MessageKey, options: readonly T[], value: T | undefined, onPick: (v: T | undefined) => void, prefix: string) => (
    <div key={id} className="ob-q" role="group" aria-labelledby={"obq-" + id}>
      <p className="ob-label" id={"obq-" + id}>
        {t(label)}
      </p>
      <div className="ob-chips ob-chips-lg">{options.map((o) => chip(value === o, () => onPick(value === o ? undefined : o), t(key(prefix, o)), o))}</div>
    </div>
  );
  const moveUp = (list: string[], i: number) => (i <= 0 ? list : [...list.slice(0, i - 1), list[i], list[i - 1], ...list.slice(i + 1)]);
  /** Ranked picks with "move up" and remove; the order is the student's preference. */
  const ranked = (list: string[], label: (v: string) => string, onChange: (next: string[]) => void, id: string) =>
    list.length > 0 && (
      <ol className="ob-ranked" aria-label={t(id === "countries" ? "ob.countries.title" : "ob.subjects.title")}>
        {list.map((v, i) => (
          <li key={v}>
            <em>{i < 5 ? t(key("obd.choice", String(i + 1))) : `#${i + 1}`}</em>
            <span>{label(v)}</span>
            {i > 0 && (
              <button type="button" className="ob-x" aria-label={t("obd.moveup", { item: label(v) })} onClick={() => onChange(moveUp(list, i))}>
                <ArrowUp size={15} aria-hidden="true" />
              </button>
            )}
            <button type="button" className="ob-x" aria-label={t("ob.remove", { item: label(v) })} onClick={() => onChange(list.filter((x) => x !== v))}>
              <X size={15} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    );

  if (personalizing) return <Personalize answers={a} onDone={() => router.replace("/dashboard")} />;

  const scale: GradeScale = a.grade_scale ?? (a.certificate ? DEFAULT_SCALE[a.certificate] : "five");
  const scaleInfo = GRADE_SCALES[scale];
  const norm = a.grade.trim() ? normalizeGrade(scale, a.grade) : null;
  const exam = examFor(a.home_country);
  const years = graduationYears();
  const months = upcomingMonths();
  const past = pastMonths();
  const setTests = (tests: TestEntry[]) => setA((x) => syncTests({ ...x, tests }));
  const patchTest = (id: CertId, patch: Partial<TestEntry>) => setTests(a.tests.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const setActivities = (activity_list: ActivityEntry[]) => setA((x) => syncActivities({ ...x, activity_list }));
  const patchActivity = (i: number, patch: Partial<ActivityEntry>) => setActivities(a.activity_list.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const setHonours = (honours: HonourEntry[]) => setA((x) => syncActivities({ ...x, honours }));
  const patchHonour = (i: number, patch: Partial<HonourEntry>) => setHonours(a.honours.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const classLabel = (c: string) => (c === "done" ? t("ob.class.done") : t("ob.class.n", { n: c }));
  const onlyDigits = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);
  const monthLabel = (m: string) =>
    new Intl.DateTimeFormat(lang, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(m + "-01T00:00:00Z"));
  const city = a.home_country ? CITY_SUGGESTIONS[a.home_country] : undefined;
  const progLabel = (x: Programme) => t(programmeKey(x) as MessageKey);
  const subjectLabel = (v: string) => {
    const x = programme(v);
    return x ? progLabel(x) : v;
  };
  const declined = a.tests_declined ?? [];
  const depth = a.activity_depth ?? {};
  const setDepth = (area: (typeof DEPTH_AREAS)[number], entry: DepthEntry | undefined) => {
    const nextDepth = { ...depth };
    if (entry) nextDepth[area] = entry;
    else delete nextDepth[area];
    set({ activity_depth: nextDepth });
  };

  /** Status of a core test: in the list (taken/planned), declined, or not answered. */
  const testState = (id: CertId) => a.tests.find((x) => x.id === id)?.status ?? (declined.includes(id) ? "none" : undefined);
  const setTestState = (id: CertId, st: "taken" | "planned" | "none") => {
    const has = a.tests.some((x) => x.id === id);
    if (st === "none") {
      setA((x) => syncTests({ ...x, tests: x.tests.filter((y) => y.id !== id), tests_declined: [...new Set([...(x.tests_declined ?? []), id])] }));
    } else
      setA((x) =>
        syncTests({
          ...x,
          tests: has ? x.tests.map((y) => (y.id === id ? { ...y, status: st, date: y.status === st ? y.date : "" } : y)) : [...x.tests, { id, status: st, score: "", date: "" }],
          tests_declined: (x.tests_declined ?? []).filter((y) => y !== id),
        }),
      );
  };
  /** Score and month fields for a test that is taken or planned. */
  const testFields = (x: TestEntry) => {
    const info = certTest(x.id)!;
    const bad = !!x.score.trim() && !testScore(x.id, x.score);
    const list = x.status === "taken" ? past : months;
    return (
      <>
        <div className="ob-pair">
          <label>
            <span>{x.status === "taken" ? t("ob.score.taken") : t("ob.score.planned")}</span>
            <input
              className="ob-input"
              inputMode={info.kind === "number" ? "decimal" : "text"}
              value={x.score}
              maxLength={16}
              placeholder={info.example}
              aria-invalid={bad || undefined}
              onChange={(e) => patchTest(x.id, { score: e.target.value })}
            />
          </label>
          <label>
            <span>{t("ob.date")}</span>
            <select className="ob-input ob-select" value={x.date} onChange={(e) => patchTest(x.id, { date: e.target.value })}>
              <option value="" />
              {list.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {bad && <p className="ob-warn">{t("ob.tests.invalid", { example: info.example })}</p>}
      </>
    );
  };

  const suggested = suggestGroups(a.interests ?? {});
  const results = searchProgrammes(query, progLabel, group ?? undefined);
  const full = a.subjects.length >= MAX_PROGRAMMES;
  const addSubject = (x: Programme) => set({ subjects: toggle(a.subjects, x.label, MAX_PROGRAMMES) });
  const progChip = (x: Programme) => (
    <button key={x.id} type="button" aria-pressed={a.subjects.includes(x.label)} disabled={full && !a.subjects.includes(x.label)} onClick={() => addSubject(x)}>
      {progLabel(x)}
    </button>
  );

  const nearText = stepsLeft <= 1 ? t("obd.near.one") : stepsLeft <= 3 ? t("obd.near", { n: stepsLeft }) : "";

  return (
    <div className="ob" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <Progress
        value={pct}
        className="ob-bar h-[3px] rounded-none bg-[var(--ob-soft)]"
        aria-label={t("ob.progress", { n: index + 1, total: visible.length })}
      />
      <header className="ob-top">
        <span className="ob-brand">
          <AIMark tile size={22} /> CollegeStat
        </span>
        <span className="ob-count" aria-live="polite">
          <b>{t(key("obd.section", current.section))}</b>
          <span className="ob-left">{minutesLeft >= 1 ? t("obd.left", { n: minutesLeft }) : t("obd.left.less")}</span>
        </span>
        {savedAt > 0 && (
          <span className="ob-saved" key={savedAt}>
            <Check size={12} aria-hidden="true" /> {t("ob.saved")}
          </span>
        )}
        <LanguageSwitcher compact />
        {!save && !single && (
          <button type="button" className="ob-later" onClick={() => void saveAndLeave("/dashboard")} disabled={busy}>
            {t("ob.later")}
          </button>
        )}
      </header>

      <main className="ob-main" key={current.id} ref={mainRef}>
        {nearText && !single && (
          <p className="ob-near">
            <Sparkles size={14} aria-hidden="true" /> {nearText}
          </p>
        )}
        <div className="ob-coach">
          <Mascot size={52} busy={busy} />
          <div className="ob-bubble">
            <h1 id="ob-title">{t(current.title)}</h1>
            {(current.hint || optional) && (
              <p className="ob-hint">
                {optional && <em className="ob-tag">{t("ob.optional")}</em>}
                {current.hint && t(current.hint)}
              </p>
            )}
          </div>
        </div>

        <div className="ob-body">
          {current.id === "name" && (
            <input
              className="ob-input"
              autoFocus
              value={a.name}
              maxLength={120}
              placeholder={t("ob.name.placeholder")}
              aria-label={t("ob.name.placeholder")}
              onChange={(e) => set({ name: e.target.value })}
            />
          )}
          {current.id === "home" && (
            <>
              <div className="ob-grid">
                {HOME_FIRST.map((c) =>
                  choice(
                    a.home_country === c,
                    () => set({ home_country: c }),
                    <>
                      <em aria-hidden="true">{flag(c)}</em> {regionName(c, lang)}
                    </>,
                    c,
                  ),
                )}
              </div>
              <select
                className="ob-input ob-select"
                aria-label={t("ob.home.other")}
                value={(HOME_OTHER as readonly string[]).includes(a.home_country || "") ? a.home_country : ""}
                onChange={(e) => e.target.value && set({ home_country: e.target.value })}
              >
                <option value="">{t("ob.home.other")}</option>
                {HOME_OTHER.map((c) => (
                  <option key={c} value={c}>
                    {regionName(c, lang)}
                  </option>
                ))}
              </select>
              <input
                className="ob-input"
                value={a.home_city}
                maxLength={80}
                placeholder={t("ob.home.city")}
                aria-label={t("ob.home.city")}
                onChange={(e) => set({ home_city: e.target.value })}
              />
              {city && (
                <div className="ob-chips">
                  {city.map((c) => chip(a.home_city === c, () => set({ home_city: c }), c, c))}
                </div>
              )}
            </>
          )}
          {current.id === "school" && (
            <>
              <div className="ob-list">
                {SCHOOL_TYPES.map((o) => choice(a.school_type === o, () => set({ school_type: o }), t(key("ob.school", o)), o))}
              </div>
              <input
                className="ob-input"
                value={a.school_name}
                maxLength={120}
                placeholder={t("ob.school.name")}
                aria-label={t("ob.school.name")}
                onChange={(e) => set({ school_name: e.target.value })}
              />
              <p className="ob-label">{t("ob.class.title")}</p>
              <div className="ob-chips ob-chips-lg">
                {SCHOOL_CLASSES.map((c) => chip(a.school_class === c, () => set({ school_class: a.school_class === c ? undefined : c }), classLabel(c), c))}
              </div>
            </>
          )}
          {current.id === "cert" && (
            <div className="ob-list">
              {CERTIFICATES.map((o) =>
                choice(a.certificate === o, () => set({ certificate: o, grade_scale: DEFAULT_SCALE[o], grade: a.certificate === o ? a.grade : "" }), t(key("ob.cert", o)), o),
              )}
            </div>
          )}
          {current.id === "year" && (
            <>
              <div className="ob-row">
                {years.map((y) => choice(a.graduation_year === y, () => set({ graduation_year: y, start_year: a.start_year ?? (START_YEARS.includes(y) ? y : undefined) }), String(y), String(y)))}
              </div>
              <p className="ob-label">{t("ob.timeline.start")}</p>
              <div className="ob-row">
                {START_YEARS.map((y) => choice(a.start_year === y, () => set({ start_year: y }), String(y), String(y)))}
              </div>
              {/* Autumn is the default intake; only ask once a start year is set. */}
              {a.start_year &&
                pickOne("term", "obd.term.title", INTAKE_TERMS, a.intake_term ?? "fall", (v) => set({ intake_term: v ?? "fall" }), "obd.term")}
            </>
          )}
          {current.id === "gpa" && (
            <>
              <div className="ob-chips">
                {(Object.keys(GRADE_SCALES) as GradeScale[]).map((k) =>
                  chip(scale === k, () => set({ grade_scale: k, grade: scale === k ? a.grade : "" }), t(key("ob.scale", k)), k),
                )}
              </div>
              <input
                className="ob-input"
                inputMode={scale === "alevel" || scale === "ap" ? "text" : "decimal"}
                value={a.grade}
                maxLength={20}
                placeholder={scaleInfo.example}
                aria-label={t("ob.gpa.label")}
                aria-describedby="ob-grade-norm"
                onChange={(e) =>
                  set({
                    grade:
                      scale === "alevel"
                        ? e.target.value.toUpperCase()
                        : scale === "ap"
                          ? e.target.value.replace(/[^1-5,\s]/g, "")
                          : e.target.value.replace(/[^\d.,]/g, "").replace(",", "."),
                  })
                }
              />
              <p className="ob-norm" id="ob-grade-norm" aria-live="polite">
                {norm ? t("ob.gpa.norm", { gpa: norm.gpa.toFixed(2), pct: norm.pct }) : a.grade.trim() ? t("ob.gpa.invalid") : t(key("ob.scale.hint", scale))}
              </p>
              <details className="ob-how">
                <summary>{t("ob.gpa.how")}</summary>
                <p>{t("ob.gpa.how.text")}</p>
              </details>
              {pickOne("rank", "obd.rank.title", CLASS_RANKS, a.class_rank, (v) => set({ class_rank: v }), "obd.rank")}
            </>
          )}
          {current.id === "strengths" && (
            <>
              <div className="ob-chips ob-chips-lg" role="group" aria-label={t("obd.strengths.title")}>
                {SCHOOL_SUBJECTS.map((x) =>
                  chip((a.strong_subjects ?? []).includes(x), () => set({ strong_subjects: toggle(a.strong_subjects ?? [], x, 3) }), t(key("obd.ss", x)), x),
                )}
              </div>
              <p className="ob-label" id="obq-research">
                {t("obd.research.title")}
              </p>
              <div className="ob-list" role="group" aria-labelledby="obq-research">
                {RESEARCH_LEVELS.map((r) => choice(a.research === r, () => set({ research: a.research === r ? undefined : r }), t(key("obd.research", r)), r))}
              </div>
            </>
          )}
          {current.id === "honours" && (
            <>
              {a.honours.map((h, i) => (
                <div key={i} className="ob-entry ob-honour">
                  <input
                    className="ob-input"
                    value={h.title}
                    maxLength={100}
                    placeholder={t("ob.honours.example")}
                    aria-label={t("ob.honours.name")}
                    onChange={(e) => patchHonour(i, { title: e.target.value })}
                  />
                  <div className="ob-honour-row">
                    <div className="ob-seg" role="group" aria-label={t("ob.honours.level")}>
                      {HONOUR_LEVELS.map((l) => (
                        <button key={l} type="button" aria-pressed={h.level === l} onClick={() => patchHonour(i, { level: l })}>
                          {t(key("ob.level", l))}
                        </button>
                      ))}
                    </div>
                    <button type="button" className="ob-x" aria-label={t("ob.remove", { item: h.title || t("ob.honours.name") })} onClick={() => setHonours(a.honours.filter((_, n) => n !== i))}>
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="ob-chips" role="group" aria-label={t("obd.medal.label")}>
                    {MEDALS.map((m) => chip(h.medal === m, () => patchHonour(i, { medal: h.medal === m ? undefined : m }), t(key("obd.medal", m)), m))}
                  </div>
                </div>
              ))}
              {a.honours.length < MAX_HONOURS && (
                <button type="button" className="ob-add" onClick={() => setHonours([...a.honours, { title: "", level: "school", grade: "" }])}>
                  <Plus size={16} aria-hidden="true" /> {t("ob.honours.add")}
                </button>
              )}
            </>
          )}
          {current.id === "tests" && (
            <>
              <ul className="ob-tests">
                {CORE_TESTS.map((id) => {
                  const info = certTest(id)!;
                  const st = testState(id);
                  const entry = a.tests.find((x) => x.id === id);
                  return (
                    <li key={id}>
                      <div className="ob-test-head">
                        <strong>{info.label}</strong>
                        <div className="ob-seg" role="group" aria-label={info.label}>
                          {(["taken", "planned", "none"] as const).map((x) => (
                            <button key={x} type="button" aria-pressed={st === x} onClick={() => setTestState(id, x)}>
                              {x === "none" ? t("obd.test.none") : t(key("ob.tests", x))}
                            </button>
                          ))}
                        </div>
                      </div>
                      {entry && testFields(entry)}
                    </li>
                  );
                })}
                {exam && (
                  <li>
                    <div className="ob-test-head">
                      <strong>{t(key("ob.exam", exam))}</strong>
                      <div className="ob-seg" role="group" aria-label={t(key("ob.exam", exam))}>
                        {EXAM_STATUS.map((x) => (
                          <button
                            key={x}
                            type="button"
                            aria-pressed={a.exam_status === x || (x === "taken" && !a.exam_status && !!a.exam_score)}
                            onClick={() => set({ exam_status: x, ...(x === "none" ? { exam_score: "", exam_date: "" } : {}) })}
                          >
                            {x === "none" ? t("obd.test.none") : t(key("ob.tests", x))}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(a.exam_status === "taken" || a.exam_status === "planned" || (!a.exam_status && a.exam_score)) && (
                      <div className="ob-pair">
                        <label>
                          <span>{a.exam_status === "planned" ? t("obd.exam.target") : t("ob.score.taken")}</span>
                          <input
                            className="ob-input"
                            inputMode="numeric"
                            value={a.exam_score}
                            maxLength={4}
                            placeholder={EXAMS[exam].max ? t("ob.exam.max", { max: EXAMS[exam].max! }) : ""}
                            onChange={(e) => set({ exam_score: onlyDigits(e.target.value, 4) })}
                          />
                        </label>
                        {a.exam_status === "planned" && (
                          <label>
                            <span>{t("ob.date")}</span>
                            <select className="ob-input ob-select" value={a.exam_date ?? ""} onChange={(e) => set({ exam_date: e.target.value })}>
                              <option value="" />
                              {months.map((m) => (
                                <option key={m} value={m}>
                                  {monthLabel(m)}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    )}
                  </li>
                )}
              </ul>
              <p className="ob-label">{t("obd.tests.other")}</p>
              <div className="ob-chips ob-chips-lg">
                {CERT_TESTS.filter((x) => !(CORE_TESTS as readonly string[]).includes(x.id)).map((x) =>
                  chip(
                    a.tests.some((y) => y.id === x.id),
                    () =>
                      setTests(
                        a.tests.some((y) => y.id === x.id)
                          ? a.tests.filter((y) => y.id !== x.id)
                          : [...a.tests, { id: x.id, status: "taken", score: "", date: "" }],
                      ),
                    x.label,
                    x.id,
                  ),
                )}
              </div>
              {a.tests.some((x) => !(CORE_TESTS as readonly string[]).includes(x.id)) && (
                <ul className="ob-tests">
                  {a.tests
                    .filter((x) => !(CORE_TESTS as readonly string[]).includes(x.id))
                    .map((x) => {
                      const info = certTest(x.id)!;
                      return (
                        <li key={x.id}>
                          <div className="ob-test-head">
                            <strong>{info.label}</strong>
                            <div className="ob-seg" role="group" aria-label={info.label}>
                              {TEST_STATUS.map((st) => (
                                <button key={st} type="button" aria-pressed={x.status === st} onClick={() => patchTest(x.id, { status: st, date: "" })}>
                                  {t(key("ob.tests", st))}
                                </button>
                              ))}
                            </div>
                            <button type="button" className="ob-x" aria-label={t("ob.remove", { item: info.label })} onClick={() => setTests(a.tests.filter((y) => y.id !== x.id))}>
                              <X size={15} aria-hidden="true" />
                            </button>
                          </div>
                          {testFields(x)}
                        </li>
                      );
                    })}
                </ul>
              )}
            </>
          )}
          {current.id === "depth" && (
            <ul className="ob-tests ob-depth">
              {DEPTH_AREAS.map((area) => {
                const d = depth[area];
                return (
                  <li key={area}>
                    <strong id={"obd-" + area}>{t(key("obd.area", area))}</strong>
                    <div className="ob-chips" role="group" aria-labelledby={"obd-" + area}>
                      {DEPTH_YEARS.map((y) =>
                        chip(d?.years === y, () => setDepth(area, d?.years === y ? undefined : y === "0" ? { years: y } : { years: y, hours: d?.hours }), t(key("obd.years", y)), y),
                      )}
                    </div>
                    {d && d.years !== "0" && (
                      <div className="ob-chips ob-hours" role="group" aria-label={t(key("obd.area", area)) + " · " + t("ob.act.hours")}>
                        {DEPTH_HOURS.map((h) => chip(d.hours === h, () => setDepth(area, { years: d.years, hours: d.hours === h ? undefined : h }), t(key("obd.hours", h)), h))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {current.id === "activities" && (
            <>
              {a.activity_list.map((x, i) =>
                openActivity === i ? (
                  <div key={i} className="ob-entry">
                    <div className="ob-pair">
                      <label>
                        <span>{t("ob.act.type")}</span>
                        <select className="ob-input ob-select" value={x.type} onChange={(e) => patchActivity(i, { type: e.target.value as ActivityEntry["type"] })}>
                          {ACTIVITY_TYPES.map((k) => (
                            <option key={k} value={k}>
                              {t(key("ob.acttype", k))}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>{t("ob.act.role")}</span>
                        <input className="ob-input" value={x.role} maxLength={50} placeholder={t("ob.act.role.example")} onChange={(e) => patchActivity(i, { role: e.target.value })} />
                      </label>
                    </div>
                    <label className="ob-field">
                      <span>{t("ob.act.org")}</span>
                      <input className="ob-input" value={x.org} maxLength={100} onChange={(e) => patchActivity(i, { org: e.target.value })} />
                    </label>
                    <div className="ob-pair ob-pair-3">
                      <label>
                        <span>{t("ob.act.hours")}</span>
                        <input className="ob-input" inputMode="numeric" value={x.hours} maxLength={2} onChange={(e) => patchActivity(i, { hours: onlyDigits(e.target.value, 2) })} />
                      </label>
                      <label>
                        <span>{t("ob.act.weeks")}</span>
                        <input className="ob-input" inputMode="numeric" value={x.weeks} maxLength={2} onChange={(e) => patchActivity(i, { weeks: onlyDigits(e.target.value, 2) })} />
                      </label>
                    </div>
                    <div className="ob-field">
                      <span>{t("ob.act.grades")}</span>
                      <div className="ob-chips">
                        {SCHOOL_CLASSES.filter((c) => c !== "done").map((c) =>
                          chip(x.grades.includes(c), () => patchActivity(i, { grades: x.grades.includes(c) ? x.grades.filter((g) => g !== c) : [...x.grades, c].sort((p, q) => +p - +q) }), classLabel(c), c),
                        )}
                      </div>
                    </div>
                    <label className="ob-field">
                      <span>
                        {t("ob.act.desc")} <small>{x.description.length}/150</small>
                      </span>
                      <textarea className="ob-input ob-area" rows={2} maxLength={150} value={x.description} placeholder={t("ob.act.desc.example")} onChange={(e) => patchActivity(i, { description: e.target.value })} />
                    </label>
                    <div className="ob-entry-foot">
                      <button type="button" className="ob-link" onClick={() => setActivities(a.activity_list.filter((_, n) => n !== i))}>
                        {t("ob.act.delete")}
                      </button>
                      <button type="button" className="ob-back" onClick={() => setOpenActivity(null)}>
                        <Check size={15} aria-hidden="true" /> {t("ob.act.done")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button key={i} type="button" className="ob-option ob-summary" onClick={() => setOpenActivity(i)}>
                    <span>
                      <b>{x.role.trim() || t(key("ob.acttype", x.type))}</b>
                      <small>
                        {[x.role.trim() ? t(key("ob.acttype", x.type)) : "", x.org.trim(), x.hours && t("ob.act.perweek", { n: x.hours })].filter(Boolean).join(" · ")}
                      </small>
                    </span>
                    <i aria-hidden="true">
                      <Check size={14} />
                    </i>
                  </button>
                ),
              )}
              {a.activity_list.length < MAX_ACTIVITIES && openActivity === null && (
                <button
                  type="button"
                  className="ob-add"
                  onClick={() => {
                    setActivities([...a.activity_list, { type: "academic", role: "", org: "", hours: "", weeks: "", grades: [], description: "" }]);
                    setOpenActivity(a.activity_list.length);
                  }}
                >
                  <Plus size={16} aria-hidden="true" /> {a.activity_list.length ? t("ob.act.addmore", { n: a.activity_list.length, max: MAX_ACTIVITIES }) : t("ob.act.add")}
                </button>
              )}
            </>
          )}
          {current.id === "subjects" && (
            <>
              {ranked(a.subjects, subjectLabel, (subjects) => set({ subjects }), "subjects")}
              {full && <p className="ob-norm">{t("obd.max3")}</p>}
              <label className="ob-search">
                <Search size={16} aria-hidden="true" />
                <input
                  className="ob-input"
                  type="search"
                  value={query}
                  placeholder={t("obd.search")}
                  aria-label={t("obd.search")}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter in the search adds the first match instead of moving on.
                    if (e.key === "Enter" && query.trim()) {
                      e.preventDefault();
                      const first = results.find((x) => !a.subjects.includes(x.label));
                      if (first && !full) {
                        addSubject(first);
                        setQuery("");
                      }
                    }
                  }}
                />
              </label>
              <div className="ob-chips ob-groups" role="group" aria-label={t("ob.subjects.title")}>
                {chip(group === null, () => setGroup(null), t("obd.group.all"), "all")}
                {PROGRAMME_GROUPS.map((g) => chip(group === g, () => setGroup(group === g ? null : g), t(groupKey(g) as MessageKey), g))}
              </div>
              {!helping ? (
                <button type="button" className="ob-link ob-help-link" onClick={() => setHelping(true)}>
                  <Sparkles size={14} aria-hidden="true" /> {t("obd.unsure")}
                </button>
              ) : (
                <div className="ob-entry ob-helper">
                  {(Object.keys(INTEREST_QUESTIONS) as InterestQuestion[]).map((q) =>
                    pickOne(
                      "int-" + q,
                      key("obd.int", q),
                      INTEREST_QUESTIONS[q] as readonly string[],
                      a.interests?.[q] as string | undefined,
                      (v) => set({ interests: { ...(a.interests ?? {}), [q]: v } }),
                      "obd.int." + q,
                    ),
                  )}
                  {suggested.length > 0 && (
                    <div className="ob-q">
                      <p className="ob-label">{t("obd.int.suggest")}</p>
                      <div className="ob-chips ob-chips-lg ob-suggest">
                        {suggested.map((g) => chip(group === g, () => setGroup(g), t(groupKey(g) as MessageKey), g))}
                      </div>
                    </div>
                  )}
                  <button type="button" className="ob-link" onClick={() => setHelping(false)}>
                    {t("obd.unsure.close")}
                  </button>
                </div>
              )}
              {results.length === 0 ? (
                <p className="ob-norm">{t("obd.noresult")}</p>
              ) : query.trim() || group ? (
                <div className="ob-chips ob-chips-lg ob-progs">{results.map(progChip)}</div>
              ) : (
                PROGRAMME_GROUPS.map((g) => (
                  <div key={g} className="ob-q">
                    <p className="ob-label">{t(groupKey(g) as MessageKey)}</p>
                    <div className="ob-chips ob-chips-lg ob-progs">{PROGRAMMES.filter((x) => x.group === g).map(progChip)}</div>
                  </div>
                ))
              )}
            </>
          )}
          {current.id === "goals" && (
            <>
              {pickOne("career", "obd.career.title", CAREERS, a.career, (v) => set({ career: v }), "obd.career")}
              {pickOne("work", "obd.work.title", WORK_AFTER, a.work_after, (v) => set({ work_after: v }), "obd.work")}
              {pickOne("return", "obd.return.title", YES_MAYBE_NO, a.return_home, (v) => set({ return_home: v }), "obd.yn")}
            </>
          )}
          {current.id === "language" && (
            <>
              <div className="ob-chips ob-chips-lg" role="group" aria-label={t("obd.lang.title")}>
                {STUDY_LANGS.map((l) => chip((a.study_langs ?? []).includes(l), () => set({ study_langs: toggle(a.study_langs ?? [], l, STUDY_LANGS.length) }), t(key("obd.sl", l)), l))}
              </div>
              {asksFoundation(a) && (
                <>
                  {pickOne("found", "obd.found.title", YES_MAYBE_NO, a.foundation, (v) => set({ foundation: v }), "obd.yn")}
                  <p className="ob-norm">{t("obd.found.hint")}</p>
                </>
              )}
            </>
          )}
          {current.id === "countries" && (
            <>
              {a.countries.length > 1 && ranked(a.countries, (c) => regionName(c, lang), (countries) => set({ countries }), "countries")}
              <div className="ob-grid">
                {DESTINATIONS.map((c) =>
                  choice(
                    a.countries.includes(c),
                    () => set({ countries: toggle(a.countries, c, 5) }),
                    <>
                      <em aria-hidden="true">{flag(c)}</em> {regionName(c, lang)}
                    </>,
                    c,
                    a.countries.includes(c) ? a.countries.indexOf(c) + 1 : undefined,
                  ),
                )}
              </div>
            </>
          )}
          {current.id === "place" && (
            <>
              {pickOne("city", "obd.city.title", CITY_SIZES, a.city_size, (v) => set({ city_size: v }), "obd.city")}
              {pickOne("safety", "obd.safety.title", IMPORTANCE, a.safety, (v) => set({ safety: v }), "obd.imp")}
              {pickOne("dist", "obd.dist.title", DISTANCES, a.distance, (v) => set({ distance: v }), "obd.dist")}
              {pickOne("halal", "obd.halal.title", IMPORTANCE, a.halal, (v) => set({ halal: v }), "obq.halal")}
            </>
          )}
          {current.id === "budget" && (
            <>
              <div className="ob-grid ob-grid-budget">
                {BUDGETS.map((b) =>
                  choice(a.budget === b.value && a.funding !== "full", () => set({ budget: b.value, funding: a.funding === "full" ? undefined : a.funding }), t(key("obd.budget", b.id)), b.id),
                )}
              </div>
              <p className="ob-label">{t("ob.funding.title")}</p>
              <div className="ob-list">
                {FUNDING.map((f) => choice(a.funding === f, () => set({ funding: f, ...(f === "full" ? { loan: undefined } : {}) }), t(key("ob.funding", f)), f))}
              </div>
              {a.funding && a.funding !== "full" && pickOne("loan", "obd.loan.title", YES_MAYBE_NO, a.loan, (v) => set({ loan: v }), "obd.yn")}
              {a.funding && a.funding !== "full" && (
              <div className="ob-q">
                <p className="ob-label" id="obq-rvc">
                  {t("obq.rvc.title")}
                </p>
                <div className="ob-slider">
                  <span>{t("obd.rvc.cost")}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={25}
                    value={a.rank_vs_cost ?? 50}
                    aria-labelledby="obq-rvc"
                    aria-valuetext={(a.rank_vs_cost ?? 50) < 50 ? t("obd.rvc.cost") : (a.rank_vs_cost ?? 50) > 50 ? t("obd.rvc.rank") : t("obd.rvc.mid")}
                    data-unset={a.rank_vs_cost == null || undefined}
                    onChange={(e) => set({ rank_vs_cost: Number(e.target.value) })}
                  />
                  <span>{t("obd.rvc.rank")}</span>
                </div>
              </div>
              )}
            </>
          )}
          {current.id === "worry" && (
            <>
              <div className="ob-list">
                {WORRIES.map((w) => choice(a.support[0] === WORRY_SUPPORT[w], () => set({ support: [WORRY_SUPPORT[w]] }), t(key("ob.worry", w)), w))}
              </div>
              {pickOne("hours", "obd.time.title", APP_HOURS, a.app_hours, (v) => set({ app_hours: v }), "obd.apph")}
            </>
          )}
        </div>
      </main>

      <footer className="ob-foot">
        {single ? (
          <button type="button" className="ob-back" onClick={() => router.push("/dashboard/profile")} disabled={busy}>
            <ArrowLeft size={16} aria-hidden="true" /> {t("ob.cancel")}
          </button>
        ) : (
          <button type="button" className="ob-back" onClick={back} disabled={index === 0 || busy}>
            <ArrowLeft size={16} aria-hidden="true" /> {t("ob.back")}
          </button>
        )}
        <span className="ob-enter" aria-hidden="true">
          {t("ob.press")} <kbd>Enter <CornerDownLeft size={11} /></kbd>
        </span>
        <button type="button" className={"ob-next" + (skipping ? " is-skip" : "")} onClick={next} disabled={busy || !ok}>
          {busy ? t("ob.saving") : single ? t("ob.save") : last ? t("ob.finish") : skipping ? t("ob.skip") : t("ob.continue")}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </footer>
    </div>
  );
}
