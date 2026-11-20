/** Shared helpers for the 14 Nov 2026 data integration: URL checks, id
 * generation and the pure converters/validators the scripts and tests use.
 * Nothing here touches the network at import time. */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
export { dedupeBy, dedupeRequirements } from "../../lib/requirements-merge";

export type Raw = Record<string, unknown>;

// --- ids ---------------------------------------------------------------

const NAMESPACE_URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

/** RFC 4122 version 5 UUID (same algorithm as python uuid.uuid5). */
export function uuid5(name: string, namespace = NAMESPACE_URL): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(ns).update(name, "utf8").digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
/** Matches the repository convention: uuid5(NAMESPACE_URL, "https://collegestat.app/<prefix>/<key>"). */
export const collegestatId = (prefix: string, key: string) => uuid5(`https://collegestat.app/${prefix}/${key}`);

// --- dates -------------------------------------------------------------

/** True for a real calendar date written YYYY-MM-DD (optionally followed by a time). */
export function isValidIsoDate(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** "November 1" / "1 November" with a cycle label such as "Fall 2027 entry" -> ISO date, or null. */
export function resolveMonthDay(text: string, cycle: string): string | null {
  const t = text.toLowerCase();
  const mi = MONTHS.findIndex((m) => t.includes(m));
  const day = t.match(/\b(\d{1,2})\b/)?.[1];
  const year = cycle.match(/\b(20\d{2})\b/)?.[1];
  if (mi < 0 || !day || !year) return null;
  // Applications for an autumn 2027 start close in the second half of 2026 (or early 2027).
  const y = mi >= 7 ? Number(year) - 1 : Number(year);
  const iso = `${y}-${String(mi + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : null;
}

// --- URLs --------------------------------------------------------------

const SECOND_LEVEL = new Set(["co", "ac", "edu", "gov", "com", "org", "go", "or", "ne", "net", "gv", "gob"]);
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\d?\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const n = SECOND_LEVEL.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2 ? 3 : 2;
  return parts.slice(-n).join(".");
}
export function sameOrganisation(a: string, b: string): boolean {
  try {
    return registrableDomain(new URL(a).hostname) === registrableDomain(new URL(b).hostname);
  } catch {
    return false;
  }
}

const OFFICIAL_PATTERN =
  /(^|\.)(edu|ac\.[a-z]{2}|edu\.[a-z]{2}|gov|gov\.[a-z]{2}|go\.[a-z]{2}|gouv\.[a-z]{2}|gob\.[a-z]{2}|europa\.eu|ox\.ac\.uk|bund\.de|admin\.ch)$/;
/** Official portals that do not sit on an .edu/.gov style domain, each checked by hand. */
export const OFFICIAL_ALLOWLIST = [
  "ubc.ca", "utoronto.ca", "mcgill.ca", "mcmaster.ca", "uwaterloo.ca", "ualberta.ca", "uottawa.ca", "yorku.ca", "carleton.ca",
  "cambridgetrust.org", "unipd.it", "polimi.it", "unibo.it", "daad.de", "stipendiumhungaricum.hu", "campuschina.org",
  "globalugrad.org", "maorif.tj", "my.gov.uz", "jasso.go.jp", "education-in-russia.com", "erasmus-plus.ec.europa.eu",
  "cuhk.edu.hk", "hku.hk", "ust.hk", "cityu.edu.hk", "nus.edu.sg", "ntu.edu.sg", "sabanciuniv.edu", "ku.edu.tr", "kaist.ac.kr",
  "join-tsinghua.edu.cn", "studyinkorea.go.kr", "turkiyeburslari.gov.tr", "nawa.gov.pl", "studyinjapan.go.jp",
];
export function isOfficialHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\d?\./, "");
  return OFFICIAL_PATTERN.test(h) || OFFICIAL_ALLOWLIST.some((d) => h === d || h.endsWith(`.${d}`));
}

export type UrlCheck = {
  url: string;
  status: number;
  finalUrl: string | null;
  ok: boolean;
  /** Why the check failed, or a note when it passed with a redirect. */
  reason: string | null;
  checkedAt: string;
};

/** Pure decision on a fetch outcome, so it can be tested without a network. */
export function judgeUrl(url: string, status: number, finalUrl: string | null, opts: { requireOfficial?: boolean } = {}): Pick<UrlCheck, "ok" | "reason"> {
  if (!status) return { ok: false, reason: "no response (network error or timeout)" };
  if (status === 200 || (status >= 300 && status < 400) || (status >= 200 && status < 300)) {
    const final = finalUrl ?? url;
    if (!sameOrganisation(url, final) && !(isOfficialHost(new URL(final).hostname) && isOfficialHost(new URL(url).hostname)))
      return { ok: false, reason: `redirects to a different organisation (${new URL(final).hostname})` };
    if (!sameOrganisation(url, final))
      return { ok: true, reason: `redirects to ${new URL(final).hostname} (both official)` };
    if (opts.requireOfficial && !isOfficialHost(new URL(final).hostname)) return { ok: false, reason: `not an official domain (${new URL(final).hostname})` };
    return { ok: true, reason: final !== url ? `redirect to ${final}` : null };
  }
  return { ok: false, reason: `HTTP ${status}` };
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
/** Fetches with curl, which handles the HTTP/2 and TLS quirks of university sites better than node's fetch. */
export async function checkUrl(url: string, opts: { requireOfficial?: boolean; timeoutMs?: number } = {}): Promise<UrlCheck> {
  const checkedAt = new Date().toISOString().slice(0, 10);
  const secs = String(Math.round((opts.timeoutMs ?? 30000) / 1000));
  let status = 0;
  let finalUrl: string | null = null;
  let curlError: string | null = null;
  for (let attempt = 0; attempt < 2 && (status === 0 || status >= 500); attempt++) {
    const r = await new Promise<{ out: string; err: string; code: number | null }>((resolve) => {
      execFile(
        "curl",
        ["-sS", "-o", "/dev/null", "-w", "%{http_code} %{url_effective}", "-m", secs, "-L", "--max-redirs", "8", "-A", UA, "-H", "Accept-Language: en", url],
        { timeout: (Number(secs) + 5) * 1000 },
        (e, stdout, stderr) => resolve({ out: String(stdout), err: String(stderr).trim(), code: e ? ((e as { code?: number }).code ?? 1) : 0 }),
      );
    });
    const m = r.out.match(/^(\d{3}) (\S+)/);
    status = m ? Number(m[1]) : 0;
    finalUrl = m ? m[2] : null;
    curlError = r.err || null;
  }
  const verdict = judgeUrl(url, status, finalUrl, opts);
  if (!status && curlError) verdict.reason = `no response (${curlError.slice(0, 80)})`;
  return { url, status, finalUrl, ...verdict, checkedAt };
}

/** Runs fn over items with a small concurrency limit. */
export async function pool<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// --- scholarships ------------------------------------------------------

export const CA_CODES = ["UZ", "KZ", "KG", "TJ"] as const;
const CA_NAME: Record<string, string> = { UZ: "Uzbekistan", KZ: "Kazakhstan", KG: "Kyrgyzstan", TJ: "Tajikistan" };
const regionNames = new Intl.DisplayNames("en", { type: "region" });
const countryName = (c: string) => CA_NAME[c] ?? (() => { try { return regionNames.of(c) ?? c; } catch { return c; } })();

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(text).filter((x): x is string => !!x) : []);

export type Nationality = { kind: "all" | "codes" | "text" | "unknown"; codes: string[]; text: string | null };
export function parseNationality(v: unknown): Nationality {
  if (v === null || v === undefined || v === "") return { kind: "unknown", codes: [], text: null };
  if (Array.isArray(v)) {
    const codes = v.filter((c): c is string => typeof c === "string" && /^[A-Za-z]{2}$/.test(c)).map((c) => c.toUpperCase());
    return codes.length === v.length ? { kind: "codes", codes, text: null } : { kind: "text", codes, text: v.join(", ") };
  }
  const s = String(v).trim();
  if (/^(all|any|everyone)\.?$/i.test(s)) return { kind: "all", codes: [], text: s };
  if (/^[A-Za-z]{2}$/.test(s)) return { kind: "codes", codes: [s.toUpperCase()], text: null };
  return { kind: "text", codes: [], text: s };
}

export const joinNames = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? ""));

/** Eligibility points built only from the record's own fields. Country names are
 * written only when the record says those countries are eligible: the site
 * loader reads names in this text as eligibility. */
export function buildEligibility(r: Raw): string[] {
  const nat = parseNationality(r.eligible_nationalities);
  const ca = r.central_asia_eligible;
  const out: string[] = [];
  if (nat.kind === "all") out.push("Open to international applicants of any nationality.");
  else if (nat.kind === "codes") out.push(`Open to applicants from ${joinNames(nat.codes.map(countryName))}.`);
  else if (nat.kind === "text" && ca === false) out.push(`Restricted by nationality, residency or family criteria set by the provider: ${nat.text}.`);
  else if (nat.kind === "text") out.push(`Eligible applicants as the provider describes them: ${nat.text}.`);
  else out.push("The official source does not list eligible nationalities; the provider sets them by call or country quota.");
  if (ca === true && nat.kind !== "codes") out.push("Applicants from Uzbekistan, Kazakhstan, Kyrgyzstan and Tajikistan are eligible.");
  if (ca === null || ca === undefined) out.push("Eligibility by country depends on a quota, partner agreement or individual award rule; confirm with the provider.");
  const level = text(r.level);
  if (level) out.push(`Level: ${level}.`);
  return out;
}

export function buildCovers(r: Raw): string | null {
  const cov = (r.coverage ?? {}) as Record<string, unknown>;
  const parts = [cov.tuition === true && "tuition", cov.living === true && "living costs", cov.travel === true && "travel", cov.insurance === true && "insurance"].filter(Boolean) as string[];
  if (typeof r.amount === "number" && r.amount > 0) parts.push(`${text(r.currency) ?? ""} ${r.amount.toLocaleString("en-GB")}`.trim());
  if (!parts.length) return null;
  const s = parts.join(", ");
  return s[0].toUpperCase() + s.slice(1);
}

export type CatalogueEntry = { id: string; name: string; slug: string };

export function normalizeScholarshipRecord(r: Raw, catalogue: Map<string, CatalogueEntry>, today: string): Raw {
  const nat = parseNationality(r.eligible_nationalities);
  const deadlines = (Array.isArray(r.deadlines) ? (r.deadlines as Raw[]) : []).map((d) => ({
    label: text(d.label) ?? "Deadline",
    date: isValidIsoDate(d.date) ? String(d.date).slice(0, 10) : null,
    note: d.cycle_year ? `${d.cycle_year} cycle` : null,
  }));
  const upcoming = deadlines.map((d) => d.date).filter((d): d is string => !!d && d >= today).sort()[0] ?? null;
  const universities = strList(r.university_ids)
    .map((id) => catalogue.get(id))
    .filter((u): u is CatalogueEntry => !!u)
    .map((u) => ({ name: u.name, slug: u.slug }));
  const codes = nat.kind === "codes" ? nat.codes : [];
  return {
    ...r,
    provider: universities.length === 1 ? universities[0].name : (text(r.provider) ?? null),
    covers: buildCovers(r),
    eligibility: buildEligibility(r),
    eligible_country_codes: codes,
    open_to_all: nat.kind === "all",
    deadline: isValidIsoDate(r.deadline) ? String(r.deadline).slice(0, 10) : upcoming,
    timeline: deadlines,
    steps: strList(r.how_to_apply),
    universities,
    checked_at: text(r.checked_at) ?? today,
  };
}

export type Verdict = { ok: boolean; reasons: string[] };

/** Field, date, eligibility and catalogue checks. URL checks are added by the caller. */
export function validateScholarshipRecord(r: Raw, catalogueIds: Set<string>): Verdict {
  const reasons: string[] = [];
  for (const k of ["slug", "name", "description", "funding_type", "level", "source_url", "application_url", "checked_at"])
    if (!text(r[k])) reasons.push(`missing field: ${k}`);
  if (!/^[A-Za-z]{2}$/.test(text(r.country_code) ?? "")) reasons.push("missing or invalid country_code");
  if (!strList(r.how_to_apply).length) reasons.push("missing field: how_to_apply");
  if (!strList(r.documents).length) reasons.push("missing field: documents");
  if (!Array.isArray(r.deadlines)) reasons.push("missing field: deadlines");
  if (r.deadline != null && !isValidIsoDate(r.deadline)) reasons.push(`deadline does not parse: ${String(r.deadline)}`);
  for (const d of Array.isArray(r.deadlines) ? (r.deadlines as Raw[]) : [])
    if (d.date != null && !isValidIsoDate(d.date)) reasons.push(`timeline date does not parse: ${String(d.date)}`);
  if (!isValidIsoDate(r.checked_at)) reasons.push(`checked_at does not parse: ${String(r.checked_at)}`);
  for (const id of strList(r.university_ids)) if (!catalogueIds.has(id)) reasons.push(`university_id not in catalogue: ${id}`);
  const linked = ((r.university_scholarships as Raw[]) ?? []).map((l) => text(l.university_id));
  for (const id of linked) if (id && !strList(r.university_ids).includes(id)) reasons.push(`university_scholarships id missing from university_ids: ${id}`);
  reasons.push(...eligibilityConflicts(r));
  return { ok: reasons.length === 0, reasons };
}

/** The central_asia_eligible flag must agree with the record's own nationality list and text. */
export function eligibilityConflicts(r: Raw): string[] {
  const out: string[] = [];
  const nat = parseNationality(r.eligible_nationalities);
  const ca = r.central_asia_eligible;
  const hasCa = nat.codes.some((c) => (CA_CODES as readonly string[]).includes(c));
  if (ca === true) {
    if (nat.kind === "codes" && !hasCa) out.push(`central_asia_eligible is true but eligible nationalities are ${nat.codes.join(", ")}`);
    if (nat.kind === "text") out.push(`central_asia_eligible is true but eligible nationalities read "${nat.text}"`);
  }
  if (ca === false) {
    if (nat.kind === "all") out.push("central_asia_eligible is false but eligible nationalities are all");
    if (hasCa) out.push("central_asia_eligible is false but eligible nationalities include a Central Asian country");
  }
  if (nat.kind === "all" && (ca === null || ca === undefined)) out.push("eligible nationalities say all but central_asia_eligible is unresolved (country quota or partner rules)");
  if (nat.kind === "unknown" && ca === true) out.push("central_asia_eligible is true but no eligible nationalities are recorded");
  if (ca === false && r.international === true && nat.kind === "all") out.push("flagged international and open to all but not Central Asia eligible");
  const blob = [r.description, ...strList(r.how_to_apply)].join(" ");
  if (ca === true && /\bonly (for|to) (citizens|nationals|residents)\b|\bnot open to (international|foreign)\b|\bexcluding (kazakhstan|uzbekistan|kyrgyzstan|tajikistan)\b/i.test(blob))
    out.push("description restricts nationality but central_asia_eligible is true");
  return out;
}

// --- articles ----------------------------------------------------------

/** Splits `---` frontmatter (simple key: value lines, JSON values allowed) from the body. */
export function parseFrontmatter(src: string): { meta: Raw; body: string } {
  const m = src.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: src.trim() };
  const meta: Raw = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    const raw = line.slice(i + 1).trim();
    try {
      meta[key] = JSON.parse(raw);
    } catch {
      meta[key] = raw.replace(/^["']|["']$/g, "");
    }
  }
  return { meta, body: m[2].trim() };
}

const ARTICLE_CATEGORY: Record<string, string> = {
  "choosing-university": "choosing",
  money: "money",
  applications: "applications",
  tests: "tests",
  essays: "essays",
};
export function articleCategory(meta: Raw, body: string): string {
  const title = String(meta.title ?? "");
  const slug = String(meta.slug ?? "");
  const cat = String(meta.category ?? "");
  if (cat in ARTICLE_CATEGORY) return ARTICLE_CATEGORY[cat];
  if (/visa/.test(slug)) return "visas";
  if (/certificate/.test(slug)) return "central-asia";
  if (/gks|stipendium|turkiye-scholarship|scholarship/.test(slug)) return "money";
  if (/studienkolleg/.test(slug)) return "applications";
  void title;
  void body;
  return "life";
}
export const isCentralAsiaArticle = (meta: Raw, body: string) =>
  /central asia|uzbek|kazakh|kyrgyz|tajik/i.test([meta.title, meta.summary, meta.slug].join(" ")) ||
  (body.match(/uzbek|kazakh|kyrgyz|tajik|central asia/gi)?.length ?? 0) >= 3;

export function convertArticle(src: string): Raw {
  const { meta, body } = parseFrontmatter(src);
  const words = (body.match(/\S+/g) ?? []).length;
  return {
    slug: meta.slug,
    title: meta.title,
    summary: meta.summary,
    category: articleCategory(meta, body),
    central_asia: isCentralAsiaArticle(meta, body),
    sources: Array.isArray(meta.sources) ? meta.sources : [],
    checked_at: meta.checked_at,
    reading_minutes: Math.max(1, Math.round(words / 200)),
    status: "draft",
    body,
  };
}

const MARKETING = /\b(unlock|journey|empower\w*|seamless\w*|game[- ]chang\w*|world[- ]class|cutting[- ]edge|best[- ]in[- ]class|dream (school|university|future)|supercharge|revolution\w*|transform your|ultimate guide|secret|hack|effortless\w*|stress[- ]free|take your .* to the next level)\b/i;
const CLAIM = /\d/;

/** Flags that need a human or a source: marketing wording, and paragraphs with figures or dates and no link. */
export function reviewArticleText(body: string, sources: { url: string }[]): string[] {
  const issues: string[] = [];
  const m = body.replace(/\b(not|no|never|cannot|can't|doesn't|does not|do not|don't|without)\s+(a\s+)?(guarantee[sd]?)/gi, "").match(MARKETING);
  if (m) issues.push(`marketing wording: "${m[0]}"`);
  if (!sources.length) issues.push("no sources listed");
  const unsourced: string[] = [];
  for (const chunk of body.split(/\n{2,}/)) {
    const t = chunk.trim();
    if (!t || /^#{1,4}\s/.test(t)) continue;
    // a figure in a sentence with no link in the same paragraph (list items inherit the preceding paragraph's source)
    for (const s of t.split(/(?<=[.!?])\s+/)) {
      const plain = s.replace(/^\s*\d+[.)]\s*/gm, "").replace(/\b\d+-(month|week|step|day)\b/gi, "");
      if (!CLAIM.test(plain) || /should be checked|this guide does not|check .* when published/i.test(s) || /\]\(https?:/.test(t) || /14 November 2026/.test(s)) continue;
      if (/^\W*\d+[.)]?\W*$/.test(s)) continue;
      unsourced.push(s.slice(0, 90));
    }
  }
  if (unsourced.length) issues.push(`${unsourced.length} sentence(s) with figures or dates and no link in their paragraph, e.g. ${unsourced.slice(0, 3).map((x) => `"${x}"`).join("; ")}`);
  return issues;
}

// --- admissions --------------------------------------------------------

export const CURRENCY_SYMBOLS: Record<string, string> = { "€": "EUR", "$": "USD", "£": "GBP", "¥": "JPY", RM: "MYR", RMB: "CNY", "₩": "KRW" };
const CODES = /(?<![A-Za-z])(USD|EUR|GBP|CAD|AUD|JPY|CNY|RMB|HKD|SGD|KRW|TRY|CZK|PLN|AED|KZT|UZS|RUB|MYR|RM|TJS)(?![a-z])/;

const num = (s: string) => Number(s.replace(/,/g, ""));
const HEDGE_ENGLISH =
  /not (a )?(universal|university-wide)|no (universal|university-wide)|scholarship|placement|exempt|prepar|foundation|\btrack|\bmajors?\b|specified|programme[- ]specific|program[- ]specific|depend|vary|varies|not (verified|confirmed|separately)|or higher|can be accepted|medicine|dentistry|mbbs|first level|nufyp|not accepted|\bold scale\b|thresholds|typical|inconsistent|no .*minimum (stated|found|published)|must submit|\babove\b|for the cited|cited .*programme|\d;\s*[a-z]+[\/ ][a-z]+ \d/i;

export type TestMinimum = { minimum: number; maximum: number | null; scale: "ielts" | "toefl120" | "toefl6"; component: number | null };

/** A university-wide English minimum from free text or a bare number; null when the text hedges. */
export function parseEnglishMinimum(kind: "IELTS" | "TOEFL", v: unknown): TestMinimum | null {
  let s: string;
  if (typeof v === "number") s = String(v);
  else if (typeof v === "string") s = v.trim();
  else return null;
  if (!s || HEDGE_ENGLISH.test(s)) return null;
  const cleaned = s
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/gi, " ")
    .replace(/\b\d\s*[–-]\s*(6|120|9)\b/g, " ");
  const numbers = [...cleaned.matchAll(/(?<![\d.])(\d{1,3}(?:\.\d)?)(?!\d|,\d)/g)].map((m) => Number(m[1]));
  if (kind === "IELTS") {
    const first = numbers.find((n) => n >= 4 && n <= 9);
    if (first === undefined) return null;
    const comp = s.match(/(?:each|no (?:sub)?score below|no component below|no less than|minimum)\D{0,18}(\d\.\d)/i)?.[1];
    return { minimum: first, maximum: null, scale: "ielts", component: comp && Number(comp) !== first ? Number(comp) : null };
  }
  const first = numbers.find((n) => n >= 1 && n <= 120);
  if (first === undefined) return null;
  return { minimum: first, maximum: null, scale: first >= 30 ? "toefl120" : "toefl6", component: null };
}

export function validateTestMinimum(kind: "IELTS" | "TOEFL", m: TestMinimum): string | null {
  if (kind === "IELTS") return m.minimum >= 4 && m.minimum <= 9 ? null : `IELTS ${m.minimum} outside 4-9`;
  if (m.scale === "toefl6") return m.minimum >= 1 && m.minimum <= 6 ? null : `TOEFL ${m.minimum} outside the 1-6 scale`;
  return m.minimum >= 0 && m.minimum <= 120 ? null : `TOEFL ${m.minimum} outside 0-120`;
}

export type Money = { amount: number; currency: string };
const HEDGE_MONEY = /not (found|specified|stated|confirmed|located|extracted|identified|verified)|unknown|enrol?lment fee|admissions? test|evaluation fee|\bor\b|per programme|depending|varies|\bexcept\b/i;
const MONEY_G = new RegExp(`(?:([€$£¥₩])\\s?(\\d[\\d,]*(?:\\.\\d+)?))|(?:${CODES.source}\\s?(\\d[\\d,]*(?:\\.\\d+)?))|(?:(\\d[\\d,]*(?:\\.\\d+)?)\\s?${CODES.source})`, "g");
/** One clean amount with a currency, or null when the text holds none, several, or hedges. */
export function parseMoney(v: unknown, currency?: unknown): Money | null {
  const cur = typeof currency === "string" && /^[A-Z]{3}$/.test(currency.trim().toUpperCase()) ? currency.trim().toUpperCase() : null;
  if (typeof v === "number") return v > 0 && cur ? { amount: v, currency: cur } : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || HEDGE_MONEY.test(s)) return null;
  const found = new Map<string, Money>();
  for (const m of s.matchAll(MONEY_G)) {
    const amount = num(m[2] ?? m[4] ?? m[5]);
    const code = m[1] ? CURRENCY_SYMBOLS[m[1]] : CURRENCY_SYMBOLS[m[3] ?? m[6]] ?? (m[3] ?? m[6]);
    found.set(`${amount}|${code}`, { amount, currency: code });
  }
  if (found.size === 1) return [...found.values()][0];
  if (found.size === 0) {
    const bare = s.match(/^(\d[\d,]*(?:\.\d+)?)$/);
    if (bare && cur) return { amount: num(bare[1]), currency: cur };
  }
  return null;
}
export const validateMoney = (m: Money): string | null =>
  m.amount > 0 && /^[A-Z]{3}$/.test(m.currency) ? null : `amount ${m.amount} ${m.currency} is not a positive amount with a currency`;

// --- dedupe ------------------------------------------------------------
