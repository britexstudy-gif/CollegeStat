// Cheap regex extractors for easy values (run before any model call). Pure functions.

export interface Hints {
  ielts: string[]; toefl: string[]; duolingo: string[]; amounts: string[]; dates: string[]; platforms: string[]; sat: string[];
}
const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?";
const CUR = "(?:US\\$|USD|\\$|€|EUR|£|GBP|CHF|CAD|AUD|RMB|CNY|¥|JPY|KRW|₩|SGD|HKD|NZD|SEK|DKK|NOK|AED|HK\\$|NT\\$|C\\$|A\\$)";

export function ielts(t: string): { overall: number; band: number | null } | null {
  const m = /IELTS[^.;\n]{0,80}?\b([4-9](?:\.[05])?)\b(?:[^.;\n]{0,60}?(?:no (?:band|section|component|sub-?score)[^.\d]{0,30}|each (?:band|component|section)[^.\d]{0,20}|band[^.\d]{0,20}|minimum[^.\d]{0,20}|sub-?scores?[^.\d]{0,20})\b([4-9](?:\.[05])?)\b)?/i.exec(t);
  if (!m) return null;
  const overall = Number(m[1]);
  const band = m[2] ? Number(m[2]) : null;
  return overall >= 4 && overall <= 9 ? { overall, band: band && band <= overall ? band : null } : null;
}
export function toefl(t: string): number | null {
  const m = /TOEFL(?:\s*iBT)?[^.;\n]{0,60}?\b(\d{2,3})\b/i.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 40 && n <= 120 ? n : null;
}
export function duolingo(t: string): number | null {
  const m = /Duolingo(?: English Test)?[^.;\n]{0,60}?\b(\d{2,3})\b/i.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 60 && n <= 160 ? n : null;
}

/** Money amounts mentioned within ~120 chars of tuition/international/fee words. */
export function amountsNearTuition(t: string): { amount: number; currency: string; text: string; period: "year" | "semester" | "credit" | "unknown" }[] {
  const out: { amount: number; currency: string; text: string; period: "year" | "semester" | "credit" | "unknown" }[] = [];
  const re = new RegExp(`(${CUR})\\s?(\\d{1,3}(?:[,. ]\\d{3})+|\\d{3,6})(?:\\.\\d{2})?|(\\d{1,3}(?:[,. ]\\d{3})+|\\d{4,6})\\s?(USD|EUR|GBP|CHF|CAD|AUD|RMB|CNY|JPY|KRW|SGD|HKD|NZD|SEK|DKK|NOK|AED)`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const ctx = t.slice(Math.max(0, m.index - 120), m.index + m[0].length + 100);
    if (!/tuition|international|fees?\b|per (?:year|annum|semester|term)|annual/i.test(ctx)) continue;
    const raw = (m[2] ?? m[3]).replace(/[,. ]/g, "");
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 100) continue;
    const cur = (m[1] ?? m[4]).toUpperCase().replace(/^US\$|^\$$|^C\$|^A\$|^HK\$|^NT\$/, (x) => ({ "US$": "USD", "$": "USD", "C$": "CAD", "A$": "AUD", "HK$": "HKD", "NT$": "TWD" }[x] ?? x)).replace("€", "EUR").replace("£", "GBP").replace("¥", "CNY").replace("₩", "KRW");
    const period = /per (?:semester|term)|\/\s?(?:semester|term)|each (?:semester|term)/i.test(ctx) ? "semester" : /per credit|per unit|\/\s?credit/i.test(ctx) ? "credit" : /per (?:year|annum)|annual|\/\s?year|a year|yearly/i.test(ctx) ? "year" : "unknown";
    out.push({ amount, currency: cur, text: m[0].trim(), period });
  }
  return out;
}

export function dates(t: string): string[] {
  const res: string[] = [];
  const a = new RegExp(`\\b(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?\\s+(${MONTH})(?:,?\\s+(20\\d{2}))?`, "gi");
  const b = new RegExp(`\\b(${MONTH})\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:,?\\s+(20\\d{2}))?`, "gi");
  for (const re of [a, b]) for (const m of t.matchAll(re)) {
    const ctx = t.slice(Math.max(0, m.index! - 45), m.index! + 25);
    if (/deadline|apply|application|closing|due|by |round|early|regular|UCAS|submit/i.test(ctx)) res.push(m[0].trim().replace(/[.,]$/, ""));
  }
  return [...new Set(res)].slice(0, 8);
}

const PLATFORMS: [RegExp, string][] = [
  [/UCAS/, "UCAS"], [/Common App(?:lication)?/i, "Common App"], [/Coalition/i, "Coalition"], [/uni-?assist/i, "uni-assist"],
  [/Studielink/i, "Studielink"], [/Parcoursup|Campus France/i, "Campus France"], [/Universities Admissions Centre|\bUAC\b/, "UAC"], [/OUAC/, "OUAC"],
];
export function platforms(t: string): string[] {
  return PLATFORMS.filter(([re]) => re.test(t)).map(([, n]) => n);
}
export function satStatus(t: string): string | null {
  const m = /(SAT|ACT)[^.\n]{0,80}?(test[- ]optional|not required|no longer required|required|optional|not (?:used|considered|accepted))/i.exec(t);
  return m ? m[0].slice(0, 120) : null;
}

export function extractHints(t: string): Hints {
  const i = ielts(t), tf = toefl(t), d = duolingo(t);
  return {
    ielts: i ? [`${i.overall}${i.band ? ` (band ${i.band})` : ""}`] : [],
    toefl: tf ? [String(tf)] : [],
    duolingo: d ? [String(d)] : [],
    amounts: amountsNearTuition(t).slice(0, 6).map((a) => `${a.currency} ${a.amount}${a.period !== "unknown" ? "/" + a.period : ""}`),
    dates: dates(t),
    platforms: platforms(t),
    sat: [satStatus(t)].filter((x): x is string => !!x),
  };
}

/** Latest-data rule: 2026/27 or 2025/26 pass; older returns false. Unknown year -> true (flagged by caller). */
export function isLatestYear(y: string | null | undefined): boolean {
  if (!y) return true;
  const m = /(20\d{2})/.exec(y);
  if (!m) return true;
  return Number(m[1]) >= 2025;
}
