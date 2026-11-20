/** Shape of the static search index (scripts/build-search-index.ts writes it,
 * server/search-index.ts reads it) and of the /api/search response. */

/** Published under data/search/ (dist/client/data/search/ in production,
 * data/generated/search/ in dev and tests). */
export const SEARCH_INDEX_DIR = "search";
export const SEARCH_SHARDS = 4;
export const searchShardFile = (n: number) => `unis-${n}.json`;
export const SEARCH_META_FILE = "meta.json";

/** The catalogue's usual slug: the folded name plus the first 8 id characters. */
export const derivedSlug = (name: string, id: string) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") +
  "-" +
  id.slice(0, 8);
export const slugOfRow = (row: { s?: string; n: string; i: string }) => row.s ?? derivedSlug(row.n, row.i);

/** One university, short keys to keep the index small. Absent = unknown. */
export type IndexUni = {
  i: string; // id
  s?: string; // slug, only when it differs from derivedSlug(n, i)
  n: string; // name
  a?: string[]; // aliases (incl. short name, Russian/Uzbek names)
  c: string; // country code
  y?: string; // city
  w?: string; // website host (https:// is implied)
  l?: string; // logo url
  li?: string; // website icon url
  b?: string; // brand colour
  r?: number; // best world rank
  rl?: string; // rank label, e.g. "QS 2027 #12"
  t?: number; // tuition, USD per year
  fr?: 1; // tuition-free
  co?: number; // cost of attendance, USD per year
  ie?: number; // IELTS overall minimum
  ien?: 1; // IELTS not required
  to?: number; // TOEFL iBT minimum
  sat?: "req" | "opt" | "no"; // SAT/ACT policy
  ar?: number; // acceptance rate, %
  pl?: string; // platform id (lib/application-platforms); absent = apply directly
  dl?: string[]; // deadlines, ISO dates, 2027 entry
  sc?: number[]; // linked scholarships (index into meta.scholarships)
  p?: number[]; // programme names (index into meta.programmes)
  su?: number[]; // subject areas (index into meta.programmes), weaker than programmes
  f?: number; // study-field bitmask (bit = FIELDS index)
  g?: 1; // CollegeStat target (the 204)
};

export type IndexScholarship = {
  s: string; // slug
  n: string; // name
  pr?: string; // provider
  c?: string; // country code where it is used
  k?: string; // funding kind (full, tuition, stipend, partial)
  h?: string; // amount headline
  d?: string; // deadline ISO
  u?: 1; // usable for a bachelor's
  ca?: 1; // open to Central Asia (open to all or names UZ/KZ/KG/TJ)
};

export type IndexArticle = { s: string; t: string; sm?: string; c?: string; cat?: string };

export type SearchMeta = {
  version: number;
  built: string;
  programmes: string[];
  scholarships: IndexScholarship[];
  articles: IndexArticle[];
  /** USD per unit, for budgets typed in EUR or GBP. */
  fx: Record<string, number>;
  counts: { universities: number; programmes: number; scholarships: number; articles: number };
};

/** One reason chip on a result row. The UI formats and translates it. */
export type WhyChip =
  | { kind: "programme"; text: string }
  | { kind: "subject"; text: string }
  | { kind: "tuition"; usd: number }
  | { kind: "free" }
  | { kind: "ielts"; value: number }
  | { kind: "ieltsNo" }
  | { kind: "deadline"; date: string }
  | { kind: "platform"; id: string }
  | { kind: "rank"; label: string }
  | { kind: "sat"; policy: "opt" | "no" }
  | { kind: "scholarships"; count: number };

export type SearchUniversity = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  country_code: string;
  city: string | null;
  website: string | null;
  logo_url: string | null;
  website_icon_url: string | null;
  brand_color: string | null;
  auto_logo?: string | null;
  match: "name" | "alias" | "programme" | "filter";
  target: boolean;
  why: WhyChip[];
};

export type SearchScholarship = { slug: string; name: string; provider: string | null; country_code: string | null; headline: string | null; deadline: string | null; kind: string | null };
export type SearchArticle = { slug: string; title: string; summary: string | null };

export type SearchResponse = {
  q: string;
  filters: import("./parse").SearchFilter[];
  /** Words that matched nothing and were ignored. */
  ignored: string[];
  universities: SearchUniversity[];
  total: number;
  scholarships: SearchScholarship[];
  articles: SearchArticle[];
  tookMs: number;
};
