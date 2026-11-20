import { useMemo, useSyncExternalStore } from "react";
import { PREP_EVENT, notifyPrep, type MockAttempt } from "./exam-score";

/** The student's own target, test date and result for one exam. Kept on this
 * device under the same key the dashboard overview already reads. */
export type Plan = { target?: number; date?: string; score?: number; scored_on?: string };

const PLAN_PREFIX = "collegestat-prep:";
const MOCK_PREFIX = "collegestat-mock-history:";

/** Score range for the target and result fields, and where to book the exam. */
export const EXAM_META: Record<
  string,
  { min: number; max: number; step: number; requirement?: string; book?: string; online?: boolean }
> = {
  sat: { min: 400, max: 1600, step: 10, requirement: "SAT", book: "https://satsuite.collegeboard.org/sat/registration" },
  act: { min: 1, max: 36, step: 1, requirement: "ACT", book: "https://www.act.org/content/act/en/products-and-services/the-act/registration.html" },
  ielts: { min: 4, max: 9, step: 0.5, requirement: "IELTS", book: "https://www.ielts.org/take-a-test" },
  toefl: { min: 1, max: 120, step: 0.5, requirement: "TOEFL", book: "https://www.ets.org/toefl/test-takers/ibt/register.html" },
  duolingo: { min: 10, max: 160, step: 5, book: "https://englishtest.duolingo.com/", online: true },
  pte: { min: 10, max: 90, step: 1, book: "https://www.pearsonpte.com/book-now" },
  "cambridge-c1": { min: 160, max: 210, step: 1, book: "https://www.cambridgeenglish.org/exams-and-tests/qualifications/advanced/" },
  gre: { min: 260, max: 340, step: 1, book: "https://www.ets.org/gre/test-takers/general-test/register.html" },
  gmat: { min: 205, max: 805, step: 10, book: "https://www.mba.com/exams/gmat-exam/schedule-your-exam" },
  ap: { min: 1, max: 5, step: 1, book: "https://apstudents.collegeboard.org/" },
};

const labelPattern: Record<string, RegExp> = { duolingo: /^duolingo/i, pte: /^pte/i };

/** Does a published requirement row give a minimum for this exam? */
export function requirementFits(slug: string, r: { kind: string; label: string; minimum: number | null; student_category?: string }) {
  if (r.minimum == null || /foundation/i.test(r.label + " " + (r.student_category || ""))) return false;
  const kind = EXAM_META[slug]?.requirement;
  if (kind) return r.kind.toUpperCase() === kind;
  const re = labelPattern[slug];
  return !!re && r.kind === "other" && re.test(r.label);
}

/** Whole days from `today` (YYYY-MM-DD) to a full date; null for a month-only or invalid date. */
export function daysUntil(date: string | undefined, today: string) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z");
  return Number.isFinite(d) ? Math.round(d / 864e5) : null;
}

export const isoToday = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

/** A number within the exam's range and step, or undefined. */
export function parseScore(slug: string, raw: string) {
  const meta = EXAM_META[slug];
  const n = Number(raw.replace(",", "."));
  if (!meta || !raw.trim() || !Number.isFinite(n) || n < meta.min || n > meta.max) return undefined;
  return n;
}

export function savePlan(slug: string, next: Plan) {
  try {
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && v !== ""));
    if (Object.keys(clean).length) localStorage.setItem(PLAN_PREFIX + slug, JSON.stringify(clean));
    else localStorage.removeItem(PLAN_PREFIX + slug);
  } catch {}
  notifyPrep();
}

function snapshot() {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || "";
      if (key.startsWith(PLAN_PREFIX) || key.startsWith(MOCK_PREFIX)) out[key] = localStorage.getItem(key) || "";
    }
  } catch {}
  return JSON.stringify(out);
}
const subscribe = (cb: () => void) => {
  window.addEventListener(PREP_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(PREP_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

const parse = <T,>(raw: string | undefined, fallback: T): T => {
  try {
    return raw ? (JSON.parse(raw) ?? fallback) : fallback;
  } catch {
    return fallback;
  }
};

/** Every exam's plan and mock attempts from this device, live across tabs and components. */
export function usePrepData() {
  const snap = useSyncExternalStore(subscribe, snapshot, () => "{}");
  return useMemo(() => {
    const raw = parse<Record<string, string>>(snap, {});
    const plans: Record<string, Plan> = {};
    const attempts: Record<string, MockAttempt[]> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith(PLAN_PREFIX)) plans[key.slice(PLAN_PREFIX.length)] = parse<Plan>(value, {});
      else {
        const list = parse<MockAttempt[]>(value, []);
        attempts[key.slice(MOCK_PREFIX.length)] = Array.isArray(list) ? list.filter((a) => a && typeof a.mock_id === "string") : [];
      }
    }
    return { plans, attempts };
  }, [snap]);
}

/** The percentage (or SAT estimate) a mock attempt stands for. */
export const attemptValue = (a: MockAttempt) => (a.scaled ? a.scaled : a.band != null ? a.band : Math.round((a.correct / Math.max(1, a.total)) * 100));

/** Tests the onboarding plan already holds, keyed by exam slug, used when nothing is saved here yet. */
export function planFallback(
  tests: { kind: string; test?: string; score?: number; target?: number; date?: string }[] | undefined,
): Record<string, Plan> {
  const out: Record<string, Plan> = {};
  for (const t of tests || []) {
    const name = (t.test || "").toLowerCase();
    const slug = name.startsWith("ielts") ? "ielts" : name.startsWith("toefl") ? "toefl" : name.startsWith("duolingo") ? "duolingo" : name === "sat" || name === "act" ? name : "";
    if (!slug) continue;
    out[slug] = { target: t.target, score: t.score, date: t.date };
  }
  return out;
}
