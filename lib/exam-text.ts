import { gridMatches, type Question } from "./certificates";

export const isCorrect = (q: Question, a: string | number | undefined) =>
  a === undefined
    ? false
    : q.type === "grid_in"
      ? gridMatches(String(a), q.answer_value || "")
      : a === q.answer;

export const LETTERS = ["A", "B", "C", "D", "E"];

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", n: "ⁿ", x: "ˣ" };
/** Plain-text math reads better with real exponents and root signs. */
export function math(text: string) {
  return text
    .replace(/\^(-?[0-9]+|[nx])\b/g, (_, p: string) => [...p].map((c) => SUP[c] ?? c).join(""))
    .replace(/sqrt\(/g, "√(")
    .replace(/ \* /g, " × ")
    .replace(/<=/g, "≤")
    .replace(/>=/g, "≥")
    .replace(/!=/g, "≠");
}
