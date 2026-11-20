import type { MockAttempt } from "@/lib/exam-score";
import type { IeltsGroup, IeltsItem } from "./types";

/** Approximate raw-score-to-band tables for IELTS Academic Listening and
 * Reading (40 questions). IELTS publishes these as a guide; the exact
 * conversion varies slightly between test versions. */
const LISTENING: [number, number][] = [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [6, 3.5], [4, 3], [0, 2.5]];
const READING: [number, number][] = [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [0, 2.5]];

export function ieltsBand(skill: "reading" | "listening", correct: number, total = 40) {
  const raw = Math.round((correct / Math.max(1, total)) * 40);
  const table = skill === "reading" ? READING : LISTENING;
  return (table.find(([min]) => raw >= min) || [0, 2.5])[1];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/^(the|a|an) /, "")
    .replace(/[^a-z0-9' -]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** IELTS marking: case and articles ignored, any listed form accepted. */
export function ieltsCorrect(group: IeltsGroup, item: IeltsItem, given: string | undefined) {
  if (!given?.trim()) return false;
  if (group.kind === "gap") return item.answer.some((a) => norm(a) === norm(given));
  return item.answer.some((a) => a.toUpperCase() === given.toUpperCase());
}

/** C-test blanks: the missing letters, compared without case. */
export function parseCTest(text: string) {
  const parts: ({ type: "text"; text: string } | { type: "blank"; shown: string; missing: string; i: number })[] = [];
  const re = /([A-Za-z'’-]*)\[([^\]]*)\]/g;
  let last = 0;
  let i = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ type: "text", text: text.slice(last, m.index) });
    parts.push({ type: "blank", shown: m[1], missing: m[2], i: i++ });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}

/** Listen-and-type: share of words typed correctly, in order, ignoring case and punctuation. */
export function typedAccuracy(expected: string, given: string) {
  const w = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);
  const a = w(expected),
    b = w(given);
  // Longest common subsequence keeps order without punishing one missed word twice.
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return a.length ? dp[a.length][b.length] / Math.max(a.length, b.length) : 0;
}

export const wordCount = (s: string) => (s.trim().match(/[\p{L}\p{N}'’-]+/gu) || []).length;

/** The number to show for an attempt: SAT section score, IELTS band, or percent. */
export function attemptLabel(a: MockAttempt) {
  if (a.scaled) return String(a.scaled);
  if (a.band != null) return a.band.toFixed(1);
  if (!a.total) return "";
  return Math.round((a.correct / a.total) * 100) + "%";
}
