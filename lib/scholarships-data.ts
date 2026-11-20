/** Scholarship records: normalising and merging published and reviewed data.
 *
 * Pure functions only (no file access) so they can be tested directly.
 * `lib/scholarships-load.ts` feeds them the bundled JSON. A reviewed record
 * appears on the site only when its verification_status is "verified"; once
 * it is promoted into data/published the published copy wins. */

import { daysUntil } from "./dates";

export type Funding = "full" | "partial";
export type Raw = Record<string, unknown>;

export type Scholarship = {
  slug: string;
  name: string;
  provider: string | null;
  description: string | null;
  /** What the award covers, in one line. */
  covers: string | null;
  funding: Funding;
  /** Funding as the source words it: full, tuition, stipend or partial. */
  fundingKind: string;
  country: string | null;
  level: string;
  /** Nationality sentence as published. */
  eligibleText: string | null;
  /** True when open to international applicants of any nationality. */
  openToAll: boolean;
  /** Country codes the record names explicitly as eligible. */
  eligibleCodes: string[];
  /** Who can apply, as separate points. */
  eligibility: string[];
  deadline: string | null;
  deadlineNote: string | null;
  timeline: { label: string; date: string | null; note: string | null }[];
  steps: string[];
  documents: string[];
  applicationUrl: string | null;
  sourceUrl: string | null;
  checkedAt: string | null;
  universities: { name: string; slug: string | null }[];
  year: number | null;
  /** Short money line for cards, e.g. "¥117,000 a month + tuition + flights". */
  amountHeadline: string | null;
  coverage: Coverage;
  /** One line per covered item, when the source gives detail. */
  coverageNotes: Partial<Record<CoverKey, string>>;
  /** Central Asia sentence (quotas, nomination rules). */
  caNote: string | null;
  age: string | null;
  grades: string | null;
  english: string | null;
  /** Can a school leaver use it for a bachelor's degree (or undergrad exchange)? */
  undergrad: boolean;
  /** Exchange semester/year, not a full degree. */
  exchange: boolean;
  faq: { q: string; a: string }[];
  image: ScholarshipImage | null;
  sources: { title: string; url: string }[];
  video: { id: string; title: string; channel: string } | null;
  /** Country whose universities this award can be used at (for a catalogue link). */
  browseCountry: string | null;
};

export const COVER_KEYS = ["tuition", "living", "travel", "insurance"] as const;
export type CoverKey = (typeof COVER_KEYS)[number];
export type Coverage = Record<CoverKey, boolean | null>;
export type ScholarshipImage = {
  src: string;
  alt: string;
  credit: string | null;
  licence: string | null;
  licenceUrl: string | null;
  sourceUrl: string | null;
};

/** Hand-checked overlay: duplicate slugs, hidden records and per-slug fields that win over the source data. */
export type ScholarshipOverlay = {
  aliases?: Record<string, string>;
  hidden?: string[];
  records?: Record<string, Raw>;
};

export const CENTRAL_ASIA = ["UZ", "KZ", "KG", "TJ"] as const;
export type CentralAsiaCode = (typeof CENTRAL_ASIA)[number];

const CA_NAMES: Record<CentralAsiaCode, RegExp> = {
  UZ: /\buzbek|\buzbekistan\b/i,
  KZ: /\bkazakh/i,
  KG: /\bkyrgyz/i,
  TJ: /\btajik/i,
};
const CA_ALL = /central asia/i;
const OPEN_TEXT =
  /^\s*(all|any|everyone)\.?\s*$|international (students?|applicants?|undergraduates?)|all (nationalit|countries|international)|any nationalit|\ball non-|non-[a-z]+ (citizens|nationals|students)|\bnon-eea\b|worldwide|\bfrom any country/i;

const str = (v: unknown): string | null => {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
};
const list = (v: unknown): string[] => {
  if (Array.isArray(v))
    return v
      .map((x) => (typeof x === "string" ? x.trim() : str((x as Raw)?.text ?? (x as Raw)?.name ?? (x as Raw)?.step)))
      .filter((x): x is string => !!x);
  const s = str(v);
  return s ? [s] : [];
};
const first = (r: Raw, ...keys: string[]) => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== "") return r[k];
  return undefined;
};

function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const isoDate = (v: unknown) => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

/** Is the sentence naming a nationality group that includes this country? */
export function eligibleFor(s: Pick<Scholarship, "openToAll" | "eligibleCodes">, code: string): boolean {
  return s.openToAll || s.eligibleCodes.includes(code);
}
export function centralAsiaCodes(s: Pick<Scholarship, "openToAll" | "eligibleCodes">): CentralAsiaCode[] {
  return CENTRAL_ASIA.filter((c) => eligibleFor(s, c));
}

function nationalities(r: Raw) {
  const codes = new Set<string>();
  const arr = first(r, "eligible_country_codes", "eligible_nationality_codes", "nationality_codes");
  if (Array.isArray(arr)) for (const c of arr) if (typeof c === "string") codes.add(c.toUpperCase());
  const named = list(first(r, "eligible_nationalities", "nationalities"));
  for (const n of named) if (/^[A-Za-z]{2}$/.test(n)) codes.add(n.toUpperCase());
  const text = named.filter((n) => !/^[A-Za-z]{2}$/.test(n)).join("; ") || null;
  const haystack = [text, ...list(r.eligibility), str(r.deadline_note)].filter(Boolean).join(" ");
  for (const c of CENTRAL_ASIA) if (CA_NAMES[c].test(haystack)) codes.add(c);
  if (CA_ALL.test(haystack)) for (const c of CENTRAL_ASIA) codes.add(c);
  const explicit = first(r, "open_to_all", "international");
  let openToAll = explicit === true || (typeof text === "string" && OPEN_TEXT.test(text));
  // A reviewer's explicit Central Asia verdict beats wording guesses.
  // "true" with named Central Asian countries means just those; with none named, all four.
  if (r.central_asia_eligible === true && !CENTRAL_ASIA.some((c) => codes.has(c))) for (const c of CENTRAL_ASIA) codes.add(c);
  if (r.central_asia_eligible === false) {
    openToAll = false;
    for (const c of CENTRAL_ASIA) codes.delete(c);
  }
  return { text, codes: [...codes], openToAll };
}

/** Maps one record of any known shape to a Scholarship; null when it has no name. */
export const DEADLINE_ROW = "@deadline";
type Row = Scholarship["timeline"][number];
const CLOSES = /clos|deadline|due|last day|submit|apply|application|online/i;
const NOT_CLOSE = /open|start|result|announce|notif|decision|interview|visa|arriv/i;

/** One source of truth for the closing date: the timeline's closing row wins over a stray
 * `deadline`, and the closing date is always a row in the timeline, so tile, list and
 * timeline can never disagree. */
export function reconcileDeadline(explicit: string | null, rows: Row[], label?: string | null): { deadline: string | null; timeline: Row[] } {
  const closing = rows
    .filter((t) => t.date && CLOSES.test(t.label) && !NOT_CLOSE.test(t.label))
    .map((t) => t.date as string)
    .sort()
    .pop();
  const deadline = closing ?? explicit ?? null;
  const timeline = [...rows];
  if (deadline && !timeline.some((t) => t.date === deadline)) timeline.push({ label: label ?? DEADLINE_ROW, date: deadline, note: null });
  timeline.sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : 0));
  return { deadline, timeline };
}

export function normalizeScholarship(r: Raw): Scholarship | null {
  const name = str(r.name ?? r.title);
  if (!name) return null;
  const slug = str(r.slug) ?? slugify(name);
  if (!slug) return null;
  const nat = nationalities(r);
  const kind = str(first(r, "funding_type", "funding")) ?? "partial";
  const amount = typeof r.amount === "number" && r.amount > 0 ? `${str(r.currency) ?? ""} ${r.amount.toLocaleString("en-GB")}`.trim() : null;
  const levelRaw = first(r, "level", "levels");
  const level = Array.isArray(levelRaw) ? levelRaw.join(" / ") : (str(levelRaw) ?? "Any");
  const unis = first(r, "universities", "university_names", "host_universities");
  const linked = Array.isArray(r.university_scholarships) ? (r.university_scholarships as Raw[]) : [];
  const universities = [
    ...(Array.isArray(unis) ? unis : []).map((u) =>
      typeof u === "string" ? { name: u, slug: null } : { name: str((u as Raw).name) ?? "", slug: str((u as Raw).slug) },
    ),
    ...linked.map((l) => {
      const u = (l.universities ?? {}) as Raw;
      return { name: str(u.name) ?? "", slug: str(u.slug) };
    }),
  ].filter((u) => u.name);
  const rawTimeline = first(r, "timeline", "deadlines");
  const rows = (Array.isArray(rawTimeline) ? (rawTimeline as Raw[]) : [])
    .map((t) => ({ label: str(t.label ?? t.stage ?? t.name) ?? "", date: isoDate(t.date), note: str(t.note) }))
    .filter((t) => t.label);
  const { deadline, timeline } = reconcileDeadline(isoDate(r.deadline), rows, str(first(r, "deadline_label")));
  const sources = (r.data_sources ?? {}) as Raw;
  const cov = (r.coverage ?? {}) as Raw;
  const bool = (v: unknown) => (v === true ? true : v === false ? false : null);
  const notes = (r.coverage_notes ?? {}) as Raw;
  const img = r.image as Raw | undefined;
  const vid = r.video as Raw | undefined;
  const seen = new Set<string>();
  const undergrad = typeof r.undergrad === "boolean" ? r.undergrad : /bachelor|any|undergrad/i.test(level);
  return {
    slug,
    name,
    provider: str(first(r, "provider", "host", "funder")) ?? str(sources.organization),
    description: str(r.description ?? r.summary),
    covers: str(first(r, "covers", "amount_note", "coverage")) ?? amount,
    funding: kind === "full" ? "full" : "partial",
    fundingKind: kind,
    country: str(first(r, "country_code", "country"))?.toUpperCase() ?? null,
    level,
    eligibleText: nat.text,
    openToAll: nat.openToAll,
    eligibleCodes: nat.codes,
    eligibility: list(first(r, "eligibility", "who_can_apply")),
    deadline,
    deadlineNote: str(r.deadline_note),
    timeline,
    steps: list(first(r, "how_to_apply", "steps", "application_steps")),
    documents: list(first(r, "documents", "required_documents")),
    applicationUrl: str(first(r, "application_url", "official_url", "url")),
    sourceUrl: str(first(r, "source_url")) ?? str(sources.url),
    checkedAt: isoDate(first(r, "checked_at", "verified_at", "retrieved_at")) ?? isoDate(sources.retrieved_at),
    universities: universities.filter((u) => {
      const k = u.slug ?? u.name.toLowerCase();
      return !seen.has(k) && !!seen.add(k);
    }),
    year: typeof r.year === "number" ? r.year : null,
    amountHeadline: str(r.amount_headline),
    coverage: { tuition: bool(cov.tuition), living: bool(cov.living), travel: bool(cov.travel), insurance: bool(cov.insurance) },
    coverageNotes: Object.fromEntries(COVER_KEYS.map((k) => [k, str(notes[k])]).filter(([, v]) => v)) as Partial<Record<CoverKey, string>>,
    caNote: str(r.ca_note),
    age: str(r.age),
    grades: str(r.grades),
    english: str(r.english),
    undergrad,
    exchange: r.exchange === true,
    faq: (Array.isArray(r.faq) ? (r.faq as Raw[]) : [])
      .map((f) => ({ q: str(f.q) ?? "", a: str(f.a) ?? "" }))
      .filter((f) => f.q && f.a),
    image: img && str(img.src) ? { src: str(img.src)!, alt: str(img.alt) ?? name, credit: str(img.credit), licence: str(img.licence), licenceUrl: str(img.licence_url), sourceUrl: str(img.source_url) } : null,
    sources: (Array.isArray(r.sources) ? (r.sources as Raw[]) : [])
      .map((x) => ({ title: str(x.title) ?? "", url: str(x.url) ?? "" }))
      .filter((x) => x.title && /^https?:\/\//.test(x.url)),
    video: vid && str(vid.id) && /^[A-Za-z0-9_-]{11}$/.test(String(vid.id)) ? { id: String(vid.id), title: str(vid.title) ?? name, channel: str(vid.channel) ?? "" } : null,
    browseCountry: str(r.browse_country),
  };
}

const nameKey = (s: Scholarship) => s.name.toLowerCase().replace(/[^a-z0-9]/g, "");

function fill(base: Scholarship, extra: Scholarship): Scholarship {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    const cur = out[k];
    const empty = cur === null || cur === undefined || cur === "" || (Array.isArray(cur) && !cur.length);
    if (empty) out[k] = v;
  }
  return out as Scholarship;
}

/** Published and researched records first; reviewed records join only when
 * verified. A slug (or, failing that, a name) already present is never
 * replaced; its empty fields are filled from the later copy. */
export function mergeScholarships(published: Raw[][], reviewed: Raw[] = [], overlay: ScholarshipOverlay = {}): Scholarship[] {
  const aliases = overlay.aliases ?? {};
  const patch = (r: Raw): Raw => {
    const own = str(r.slug) ?? slugify(str(r.name ?? r.title) ?? "");
    const slug = aliases[own] ?? own;
    const extra = overlay.records?.[slug];
    return extra ? { ...r, ...extra, slug } : { ...r, slug };
  };
  const verified = reviewed.map(patch).filter((r) => str(r.verification_status)?.toLowerCase() === "verified");
  const ordered = [...published.flat().map(patch), ...verified];
  const bySlug = new Map<string, Scholarship>();
  const byName = new Map<string, string>();
  for (const raw of ordered) {
    const s = normalizeScholarship(raw);
    if (!s) continue;
    const slug = bySlug.has(s.slug) ? s.slug : byName.get(nameKey(s));
    if (slug) bySlug.set(slug, fill(bySlug.get(slug)!, s));
    else {
      bySlug.set(s.slug, s);
      byName.set(nameKey(s), s.slug);
    }
  }
  const hidden = new Set(overlay.hidden ?? []);
  return [...bySlug.values()].filter((s) => !hidden.has(s.slug));
}

export type DeadlineState = "open" | "closed" | "none";
export function deadlineState(s: Pick<Scholarship, "deadline">, today: string): DeadlineState {
  if (!s.deadline) return "none";
  return s.deadline < today ? "closed" : "open";
}

export type DeadlineInfo = {
  date: string | null;
  /** open: closes ahead. closed: passed, nothing announced. next: passed, but a later round or step is dated. none: no date. */
  state: "open" | "closed" | "next" | "none";
  days: number | null;
  /** The next dated step after today (for "next round"). */
  next: Row | null;
};
/** The single answer to "what is the deadline?" used by the tile, the cards and the timeline. */
export function deadlineInfo(s: Pick<Scholarship, "deadline" | "timeline">, today: string): DeadlineInfo {
  const next = s.timeline.find((t) => t.date && t.date >= today) ?? null;
  if (!s.deadline) return { date: null, state: next ? "next" : "none", days: null, next };
  const days = daysUntil(s.deadline, today);
  return { date: s.deadline, state: days >= 0 ? "open" : next ? "next" : "closed", days, next };
}

/** Upcoming deadlines first (soonest first), then undated, then closed. */
export function sortScholarships(list: Scholarship[], today: string): Scholarship[] {
  const rank = (s: Scholarship) => ({ open: 0, none: 1, closed: 2 })[deadlineState(s, today)];
  return [...list].sort(
    (a, b) => rank(a) - rank(b) || (a.deadline ?? "").localeCompare(b.deadline ?? "") || a.name.localeCompare(b.name),
  );
}

export type ScholarshipFilters = {
  q?: string;
  country?: string;
  level?: string;
  funding?: string;
  nationality?: string;
  /** 1-12 */
  month?: number;
  /** Open to at least one Central Asian country. */
  ca?: boolean;
  /** Deadline within SOON_DAYS of `today`. */
  soon?: boolean;
  today?: string;
};

export const SOON_DAYS = 75;
export { daysUntil };

export function filterScholarships(list: Scholarship[], f: ScholarshipFilters): Scholarship[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return list.filter((s) => {
    if (q && ![s.name, s.provider, s.description, s.covers, ...(s.universities ?? []).map((u) => u.name)].join(" ").toLowerCase().includes(q)) return false;
    if (f.country && s.country !== f.country) return false;
    if (f.level && s.level !== f.level && s.level !== "Any" && !s.level.includes(f.level)) return false;
    if (f.level === "Bachelor" && !s.undergrad) return false;
    if (f.funding && s.funding !== f.funding) return false;
    if (f.nationality && !eligibleFor(s, f.nationality)) return false;
    if (f.month && (!s.deadline || Number(s.deadline.slice(5, 7)) !== f.month)) return false;
    if (f.ca && !centralAsiaCodes(s).length) return false;
    if (f.soon) {
      if (!s.deadline) return false;
      const n = daysUntil(s.deadline, f.today ?? new Date().toISOString().slice(0, 10));
      if (n < 0 || n > SOON_DAYS) return false;
    }
    return true;
  });
}

/** Same country or level first, then the nearest deadline. */
export function relatedScholarships(all: Scholarship[], s: Scholarship, limit = 3): Scholarship[] {
  const score = (o: Scholarship) =>
    (o.country && o.country === s.country ? 2 : 0) +
    (o.level === s.level ? 1 : 0) +
    (centralAsiaCodes(o).length && centralAsiaCodes(s).length ? 1 : 0);
  return all
    .filter((o) => o.slug !== s.slug)
    .map((o) => [o, score(o)] as const)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name))
    .slice(0, limit)
    .map(([o]) => o);
}
