import type { Mock, Question } from "./certificates";
import { isCorrect } from "./exam-text";

export type MockAttempt = {
  mock_id: string;
  title: string;
  date: string;
  correct: number;
  total: number;
  seconds: number;
  scaled: number | null;
  by_domain: Record<string, { correct: number; total: number }>;
  /** Official-format practice (lib/test-prep): which set, and what to show in review. */
  ref?: string;
  kind?: "test" | "task" | "writing" | "speaking";
  /** SAT: the Module 2 route taken. */
  route?: "hard" | "easy";
  /** IELTS Reading/Listening: estimated band. */
  band?: number;
  answers?: Record<string, string | number>;
  /** Writing and speaking: the response and the AI feedback summary. */
  text?: string;
  feedback?: string;
};

/** A rough, clearly-labelled SAT section estimate from percent correct.
 * Real scaling depends on the adaptive module route and form; this is only
 * a guide for tracking progress between our own practice tests. */
export function estimateSatSection(correct: number, total: number) {
  if (!total) return null;
  const pct = correct / total;
  return Math.round((200 + 600 * Math.pow(pct, 0.92)) / 10) * 10;
}

export function scoreAttempt(
  examSlug: string,
  mock: Pick<Mock, "id" | "title" | "kind">,
  questions: Question[],
  answers: Record<string, string | number>,
  seconds: number,
): MockAttempt {
  const by_domain: MockAttempt["by_domain"] = {};
  let correct = 0;
  for (const q of questions) {
    const key = q.domain || q.section || q.skill || "General";
    by_domain[key] ||= { correct: 0, total: 0 };
    by_domain[key].total++;
    if (isCorrect(q, answers[q.id])) {
      by_domain[key].correct++;
      correct++;
    }
  }
  const sat = examSlug === "sat" && mock.kind === "full";
  return {
    mock_id: mock.id,
    title: mock.title,
    date: new Date().toISOString(),
    correct,
    total: questions.length,
    seconds,
    scaled: sat ? estimateSatSection(correct, questions.length) : null,
    by_domain,
  };
}

const KEY = (slug: string) => "collegestat-mock-history:" + slug;
/** Fired after this device's prep data (target, date, score, mocks) changes. */
export const PREP_EVENT = "collegestat-prep-change";
export const notifyPrep = () => {
  try {
    window.dispatchEvent(new Event(PREP_EVENT));
  } catch {}
};

export function loadAttempts(slug: string): MockAttempt[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(slug)) || "[]");
    return Array.isArray(raw) ? raw.filter((a) => a && typeof a.mock_id === "string") : [];
  } catch {
    return [];
  }
}

export function saveAttempt(slug: string, attempt: MockAttempt) {
  try {
    const list = [...loadAttempts(slug), attempt].slice(-50);
    localStorage.setItem(KEY(slug), JSON.stringify(list));
  } catch {}
  notifyPrep();
}
