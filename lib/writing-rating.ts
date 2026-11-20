/** Quick, offline style signals for a piece of writing (used by the AI
 * assistant's essay tool). Not a grade; the writing desk's feedback comes
 * from the AI review (lib/essay-review.ts). */

const CLICHES = [
  "ever since i was a child",
  "since i was young",
  "from a young age",
  "i have always been passionate",
  "passion for",
  "make a difference",
  "dream come true",
  "think outside the box",
  "in today's society",
  "in today’s society",
  "webster",
  "dictionary defines",
  "hard work pays off",
  "follow my dreams",
  "change the world",
  "at the end of the day",
  "i want to help people",
];
const FILLERS = ["very", "really", "just", "basically", "actually", "literally", "quite", "extremely", "things", "stuff", "a lot"];

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);
const sentences = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/)
    .map((s) => s.trim())
    .filter((s) => words(s).length > 0);

function syllables(word: string) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "")
    .match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length || 1);
}

/** Flesch reading ease. */
export function readingEase(text: string) {
  const w = words(text);
  const s = sentences(text);
  if (!w.length || !s.length) return 0;
  const syl = w.reduce((n, x) => n + syllables(x), 0);
  return Math.round(206.835 - 1.015 * (w.length / s.length) - 84.6 * (syl / w.length));
}

const band = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

export type WritingCriterion = { id: string; label: string; score: number; note: string; tip?: string };
export type WritingRatingResult = { overall: number; count: number; criteria: WritingCriterion[] };

export function rateWriting(text: string, target: { min: number; max: number } = { min: 400, max: 650 }): WritingRatingResult {
  const count = words(text).length;
  const list = sentences(text);
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const padded = " " + text.toLowerCase().replace(/\s+/g, " ") + " ";
  const lengths = list.map((s) => words(s).length);
  const mean = lengths.length ? lengths.reduce((n, x) => n + x, 0) / lengths.length : 0;
  const spread = lengths.length ? Math.sqrt(lengths.reduce((n, x) => n + (x - mean) ** 2, 0) / lengths.length) : 0;
  const ease = readingEase(text);
  const firstPerson = (padded.match(/ (i|my|me|i'm|i’ve|i've|myself) /g) || []).length;
  const numbers = (text.match(/\b\d[\d,.%]*\b/g) || []).length;
  const names = (text.match(/(?<![.!?]\s)\b[A-Z][a-z]{2,}/g) || []).length;
  const quotes = (text.match(/[“"][^”"]{3,}[”"]/g) || []).length;
  const cliches = CLICHES.filter((c) => padded.includes(c));
  const fillers = FILLERS.reduce((n, f) => n + (padded.match(new RegExp(` ${f} `, "g")) || []).length, 0);
  const passive = (padded.match(/ (was|were|been|being|is|are) \w+ed /g) || []).length;
  const per100 = (n: number) => (count ? (n / count) * 100 : 0);
  const criteria: WritingCriterion[] = [
    {
      id: "length",
      label: "Length",
      score:
        count === 0 || count < target.min * 0.5 ? 1 : count < target.min * 0.8 ? 2 : count < target.min ? 4 : count <= target.max ? 5 : count <= target.max * 1.1 ? 3 : 2,
      note: `${count} words (aim for ${target.min}–${target.max}).`,
      tip:
        count < target.min
          ? "Add one more concrete example and what you learned from it."
          : count > target.max
            ? "Cut repeated ideas and long introductions to fit the limit."
            : undefined,
    },
    {
      id: "structure",
      label: "Structure",
      score: band((paragraphs >= 3 ? 3 : paragraphs) + (spread >= 5 ? 2 : +(spread >= 3))),
      note: `${paragraphs} paragraph${paragraphs === 1 ? "" : "s"}, ${list.length} sentences, varied length ${spread >= 5 ? "well" : spread >= 3 ? "a little" : "rarely"}.`,
      tip:
        paragraphs < 3
          ? "Split into an opening moment, what you did and learned, and where it leads."
          : spread < 3
            ? "Mix short, punchy sentences with longer ones to keep the reader’s attention."
            : undefined,
    },
    {
      id: "specificity",
      label: "Specific detail",
      score: band(1 + Math.min(2, per100(numbers + quotes) * 1.5) + Math.min(2, per100(names) * 0.6)),
      note: `${numbers} numbers, ${names} names or places, ${quotes} quotes.`,
      tip: per100(numbers + names + quotes) < 2 ? "Show, don’t tell: add a real number, place, name or a line someone said." : undefined,
    },
    {
      id: "clarity",
      label: "Clarity",
      score: band((ease >= 50 && ease <= 75 ? 4 : ease >= 40 ? 3 : 2) + +(mean <= 25) - +(per100(fillers) > 3) - +(per100(passive) > 2)),
      note: `Reading ease ${ease} · ${mean.toFixed(0)} words per sentence · ${fillers} filler words.`,
      tip:
        mean > 25
          ? "Break up long sentences; one idea per sentence reads best."
          : fillers > 3
            ? "Remove filler words like “very”, “really” and “just”."
            : passive > 2
              ? "Prefer active voice: “I built…” instead of “It was built…”."
              : undefined,
    },
    {
      id: "voice",
      label: "Personal voice",
      score: band(per100(firstPerson) >= 3 ? 5 : per100(firstPerson) >= 1.5 ? 4 : per100(firstPerson) >= 0.5 ? 3 : 2),
      note: `${firstPerson} first-person references.`,
      tip: per100(firstPerson) < 1.5 ? "Admissions readers want you: describe what you thought, did and decided." : undefined,
    },
    {
      id: "originality",
      label: "Fresh language",
      score: band(5 - cliches.length * 1.5),
      note: cliches.length ? `Clichés found: ${cliches.map((c) => `“${c}”`).join(", ")}.` : "No common clichés found.",
      tip: cliches.length ? "Replace clichés with a specific moment only you could describe." : undefined,
    },
  ];
  return {
    overall: count ? Math.round((criteria.reduce((n, c) => n + c.score, 0) / (criteria.length * 5)) * 100) : 0,
    count,
    criteria,
  };
}
