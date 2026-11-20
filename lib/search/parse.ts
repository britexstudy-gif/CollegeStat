/** Natural-language query parser for search, in English, Russian and Uzbek.
 * "computer science in Germany under 10k", "информатика в Германии до $15 000",
 * "Germaniyada kompyuter 10 ming dollargacha". Every recognised piece becomes a
 * filter with the span of the query it came from, so the UI can show it as a
 * removable chip (removeFilter cuts that span). What is left is name text. */
import { countries } from "@/lib/domain";
import { fold } from "./text";
import {
  CHEAP_TERMS,
  COUNTRY_TERMS,
  FIELDS,
  FREE_TERMS,
  MONTHS,
  NO_IELTS_TERMS,
  NO_SAT_TERMS,
  PLATFORM_TERMS,
  REGION_TERMS,
  SCHOLARSHIP_TERMS,
  STOPWORDS,
} from "./lexicon";

export type Span = [number, number];
export type SearchFilter = { key: string; span: Span } & (
  | { kind: "country"; code: string }
  | { kind: "region"; region: string }
  | { kind: "budget"; max: number; currency: "USD" | "EUR" | "GBP" }
  | { kind: "free" }
  | { kind: "cheap" }
  | { kind: "scholarship" }
  | { kind: "field"; field: string }
  | { kind: "ielts"; score: number }
  | { kind: "toefl"; score: number }
  | { kind: "noIelts" }
  | { kind: "noSat" }
  | { kind: "platform"; platform: string }
  | { kind: "deadline"; month: number; mode: "before" | "in"; day?: number }
  | { kind: "rank"; max: number }
);
export type FilterKind = SearchFilter["kind"];
type FilterBody = SearchFilter extends infer F ? (F extends SearchFilter ? Omit<F, "key" | "span"> : never) : never;

export type ParsedQuery = {
  raw: string;
  filters: SearchFilter[];
  /** Words left after filters and stopwords, folded (Cyrillic kept). */
  terms: string[];
  /** Every meaningful word of the query (filters included), for the name pass. */
  allTerms: string[];
};

type Token = { text: string; start: number; end: number; used: boolean };

function tokenize(q: string): Token[] {
  const out: Token[] = [];
  for (const m of q.matchAll(/[\p{L}\p{N}’‘ʼʻ'`$€£+]+(?:[.,-][\p{L}\p{N}]+)*/gu)) {
    const text = fold(m[0]).replace(/\s+/g, "");
    if (text) out.push({ text, start: m.index, end: m.index + m[0].length, used: false });
  }
  return out;
}

type Term = { parts: { word: string; stem: boolean }[]; body: FilterBody };
const compile = (term: string, body: FilterBody): Term => ({
  parts: term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.endsWith("*") ? { word: fold(w.slice(0, -1)), stem: true } : { word: fold(w).replace(/\s+/g, ""), stem: false })),
  body,
});
const wordMatches = (token: string, part: { word: string; stem: boolean }) =>
  part.stem ? token.startsWith(part.word) && token.length - part.word.length <= 9 : token === part.word;

let TERMS: Term[] | null = null;
function terms(): Term[] {
  if (TERMS) return TERMS;
  const list: Term[] = [];
  const add = (words: string[], body: FilterBody) => words.forEach((w) => list.push(compile(w, body)));
  for (const [code, name] of Object.entries(countries)) if (name.length > 3) add([name], { kind: "country", code });
  for (const [code, words] of Object.entries(COUNTRY_TERMS)) add(words, { kind: "country", code });
  for (const [region, words] of Object.entries(REGION_TERMS)) add(words, { kind: "region", region });
  for (const f of FIELDS) add(f.terms, { kind: "field", field: f.id });
  for (const [platform, words] of Object.entries(PLATFORM_TERMS)) add(words, { kind: "platform", platform });
  add(FREE_TERMS, { kind: "free" });
  add(SCHOLARSHIP_TERMS, { kind: "scholarship" });
  add(CHEAP_TERMS, { kind: "cheap" });
  add(NO_SAT_TERMS, { kind: "noSat" });
  add(NO_IELTS_TERMS, { kind: "noIelts" });
  // Longest phrases first so "south korea" wins over "korea", "computer science" over "computer".
  TERMS = list.sort((a, b) => b.parts.length - a.parts.length);
  return TERMS;
}

const monthOf = (word: string): number | null => {
  const w = fold(word);
  for (const [stem, n] of MONTHS) {
    if (stem.endsWith("*") ? w.startsWith(stem.slice(0, -1)) : w === stem) return n;
  }
  return null;
};

const keyOf = (b: FilterBody): string => {
  switch (b.kind) {
    case "country":
      return "country:" + b.code;
    case "region":
      return "region:" + b.region;
    case "field":
      return "field:" + b.field;
    case "platform":
      return "platform:" + b.platform;
    default:
      return b.kind;
  }
};

// Amounts: "10k", "15 000", "10,000", "1.5k", "10 ming", "15 тыс".
const NUM = String.raw`(\d{1,3}(?:[  ,.]\d{3})+|\d+(?:[.,]\d+)?)`;
const MULT = String.raw`(?:\s*(k|к|тыс\.?|тысяч[а-я]*|thousand|ming|минг))?`;
const PRE = String.raw`(?:(\$|€|£|usd|us\$)\s*)?`;
const POST = String.raw`(?:\s*(\$|usd|dollars?|dollar|долл\.?|доллар[а-я]*|€|eur|euros?|евро|evro|£|gbp|pounds?|фунт[а-я]*))?`;
const BEFORE = String.raw`(?:under|below|less than|up to|upto|max(?:imum)?|within|cheaper than|no more than|до|менее|меньше|не дороже|не более|дешевле|в пределах)`;
const AFTER = String.raw`(?:-?gacha|\s+dan\s+arzon|dan arzon|\s+dan\s+kam|dan kam|dan oshmagan)`;

function amount(num: string, mult: string | undefined): number {
  const n = Number(num.replace(/[  ,.](?=\d{3}\b)/g, "").replace(",", "."));
  return mult ? n * 1000 : n;
}
function currencyOf(...marks: (string | undefined)[]): "USD" | "EUR" | "GBP" {
  const m = marks.filter(Boolean).join(" ");
  if (/€|eur|евро|evro/.test(m)) return "EUR";
  if (/£|gbp|pound|фунт/.test(m)) return "GBP";
  return "USD";
}

/** Parses a query into filters and leftover words. Pure; safe on any input. */
export function parseSearchQuery(input: string): ParsedQuery {
  const raw = input.slice(0, 200);
  const lower = raw.toLowerCase();
  const tokens = tokenize(raw);
  const filters: SearchFilter[] = [];
  const push = (body: FilterBody, span: Span) => {
    for (const t of tokens) if (t.start < span[1] && t.end > span[0]) t.used = true;
    const key = keyOf(body);
    if (filters.some((f) => f.key === key)) return;
    filters.push({ ...body, key, span } as SearchFilter);
  };
  const free = (span: Span) => tokens.every((t) => !(t.start < span[1] && t.end > span[0]) || !t.used);
  const scan = (re: RegExp, each: (m: RegExpMatchArray, span: Span) => void) => {
    for (const m of lower.matchAll(re)) {
      const span: Span = [m.index!, m.index! + m[0].length];
      if (free(span)) each(m, span);
    }
  };

  // English tests and ranks first, so their numbers never read as budgets.
  scan(/(?:ielts|айелтс|айлтс|илтс)(?:\s*academic)?\s*(?:score|балл[а-я]*|ball|bali)?\s*[:=]?\s*(\d(?:[.,][05])?)(?!\d)/gu, (m, s) => {
    const v = Number(m[1].replace(",", "."));
    if (v >= 3 && v <= 9) push({ kind: "ielts", score: v }, s);
  });
  scan(/(?<![\d.])(\d(?:[.,][05])?)\s*(?:ielts|айелтс|айлтс)/gu, (m, s) => {
    const v = Number(m[1].replace(",", "."));
    if (v >= 3 && v <= 9) push({ kind: "ielts", score: v }, s);
  });
  scan(/(?:toefl|тоефл|тойфл)(?:\s*ibt)?\s*[:=]?\s*(\d{2,3})(?!\d)/gu, (m, s) => {
    const v = Number(m[1]);
    if (v >= 30 && v <= 120) push({ kind: "toefl", score: v }, s);
  });
  scan(/(?:top|топ)[\s-]*(\d{1,4})(?!\d)/gu, (m, s) => {
    const v = Number(m[1]);
    if (v > 0) push({ kind: "rank", max: v }, s);
  });

  // Deadlines: "before January", "by 15 March", "до января", "yanvargacha", "deadline in March".
  scan(
    /(?:(deadlines?\s+in|дедлайн(?:ом)?\s+в|с дедлайном в|apply\s+in)|(before|by|until|till|due|deadline(?:\s+(?:before|by))?|до|дедлайн\s+до|срок\s+до|не позже))\s+(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?([a-zа-яё]+)/gu,
    (m, s) => {
      const month = monthOf(m[4]);
      const day = m[3] ? Number(m[3]) : undefined;
      if (month) push({ kind: "deadline", month, mode: m[1] ? "in" : "before", ...(day && day <= 31 && !m[1] ? { day } : {}) }, s);
    },
  );
  scan(/([a-z]+?)(?:gacha|dan oldin|\s+oldin)(?![a-z])/gu, (m, s) => {
    const month = monthOf(m[1]);
    if (month) push({ kind: "deadline", month, mode: "before" }, s);
  });

  // Budgets.
  scan(new RegExp(BEFORE + String.raw`\s*` + PRE + NUM + MULT + POST, "gu"), (m, s) =>
    push({ kind: "budget", max: amount(m[2], m[3]), currency: currencyOf(m[1], m[4]) }, s),
  );
  scan(new RegExp(PRE + NUM + MULT + String.raw`\s*(?:(\$|usd|dollar|доллар|евро|evro|euro|€|£)\s*)?` + AFTER, "gu"), (m, s) =>
    push({ kind: "budget", max: amount(m[2], m[3]), currency: currencyOf(m[1], m[4]) }, s),
  );
  // A bare amount with a currency or a thousands word ("$12k", "15000 usd", "10 ming").
  scan(new RegExp(String.raw`(?<![\p{L}\d])` + PRE + NUM + MULT + POST + String.raw`(?![\p{L}\d])`, "gu"), (m, s) => {
    if (!m[1] && !m[3] && !m[4]) return;
    const max = amount(m[2], m[3]);
    if (max >= 100) push({ kind: "budget", max, currency: currencyOf(m[1], m[4]) }, s);
  });

  // Lexicon terms over the remaining words, longest phrase first.
  for (const term of terms()) {
    const n = term.parts.length;
    for (let i = 0; i + n <= tokens.length; i++) {
      let ok = true;
      for (let k = 0; k < n && ok; k++) ok = !tokens[i + k].used && wordMatches(tokens[i + k].text, term.parts[k]);
      if (!ok) continue;
      if (term.body.kind === "country" && filters.some((f) => f.kind === "country" && f.code === (term.body as { code: string }).code)) {
        tokens.slice(i, i + n).forEach((t) => (t.used = true));
        continue;
      }
      push(term.body, [tokens[i].start, tokens[i + n - 1].end]);
    }
  }

  const meaningful = (t: Token) => !STOPWORDS.has(t.text) && !/^[$€£+]+$/.test(t.text);
  return {
    raw,
    filters,
    terms: tokens.filter((t) => !t.used && meaningful(t)).map((t) => t.text),
    allTerms: tokens.filter(meaningful).map((t) => t.text),
  };
}

/** The query with one detected filter's words removed (for chip "×"). */
export function removeFilter(query: string, filter: Pick<SearchFilter, "span">): string {
  const [a, b] = filter.span;
  return (query.slice(0, a) + " " + query.slice(b)).replace(/\s+/g, " ").trim();
}

/** Deadline cutoff for the 2026–27 cycle: Aug–Dec fall in 2026, Jan–Jul in 2027. */
export function cycleMonth(month: number): { year: number; month: number } {
  return { year: month >= 8 ? 2026 : 2027, month };
}
