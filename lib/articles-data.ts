/** Article library data: publisher articles we link to and our own reviewed
 * articles. Pure functions so tests can exercise merging directly;
 * `lib/articles-load.ts` supplies the bundled files.
 *
 * A reviewed article (data/review/articles-nov14/*.json, one object or an
 * array per file) shows up only when its status is "approved". */

export const CATEGORIES = [
  { id: "choosing", label: "Choosing universities" },
  { id: "applications", label: "Applying by country" },
  { id: "tests", label: "Tests and English" },
  { id: "essays", label: "Essays" },
  { id: "money", label: "Costs and scholarships" },
  { id: "visas", label: "Visas and moving" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];

export type Article = {
  slug: string;
  title: string;
  summary: string | null;
  category: CategoryId;
  /** "own" has a body written for CollegeStat; "external" links to a publisher. */
  kind: "own" | "external";
  publisher: string | null;
  author: string | null;
  publishedAt: string | null;
  dateLabel: string | null;
  updatedAt: string | null;
  checkedAt: string | null;
  readingMinutes: number | null;
  centralAsia: boolean;
  countryCode: string | null;
  featured: boolean;
  url: string | null;
  body: string | null;
  sources: { title: string; url: string }[];
  related: string[];
  /** Outside articles: our own key points (the original stays on the publisher's site). */
  keyPoints: string[];
  /** Short caution such as "archived post". */
  note: string | null;
  video: { id: string; title: string; channel: string } | null;
  /** Licensed cover photo (own guides), with its credit. */
  image: ArticleImage | null;
  /** Catalogue pages the guide is about: university slugs and scholarship slugs. */
  links: { universities: { name: string; slug: string }[]; scholarships: string[] };
};

export type ArticleImage = { src: string; alt: string; credit: string | null; licence: string | null; licenceUrl: string | null; sourceUrl: string | null };

/** Reviewed overlay: drafts we approve after a fact check, copy fixes, videos,
 * our summaries of outside articles, and outside articles we no longer list. */
export type ArticleOverlay = {
  approve?: string[];
  author?: string;
  fixes?: Record<string, [string, string][]>;
  videos?: Record<string, { id: string; title: string; channel: string }>;
  external?: Record<string, { summary?: string; points?: string[]; note?: string; checked_at?: string }>;
  hidden?: string[];
  /** Own guides kept out of the library list (the page still opens from a link). */
  unlisted?: string[];
  covers?: Record<string, { src: string; alt?: string; credit?: string; licence?: string; licence_url?: string; source_url?: string }>;
  links?: Record<string, { universities?: { name: string; slug: string }[]; scholarships?: string[] }>;
};

const noLinks = () => ({ universities: [], scholarships: [] });

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const date = (v: unknown) => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

const ALIASES: Record<string, CategoryId> = {
  "choosing-university": "choosing",
  choosing: "choosing",
  universities: "choosing",
  applications: "applications",
  application: "applications",
  tests: "tests",
  english: "tests",
  essays: "essays",
  essay: "essays",
  money: "money",
  scholarships: "money",
  funding: "money",
  visas: "visas",
  visa: "visas",
  moving: "visas",
  "student-life": "choosing",
  life: "choosing",
  "study-abroad": "choosing",
  "central-asia": "applications",
};

/** Maps any category wording to one of ours; unknown ones fall back to the title. */
export function categorize(category: unknown, title = ""): CategoryId {
  const key = String(category ?? "").trim().toLowerCase();
  let id: CategoryId = ALIASES[key] ?? "choosing";
  const t = title.toLowerCase();
  if (id === "applications" && /essay|personal statement|supplemental|personal profile/.test(t)) id = "essays";
  if (id === "choosing" && /visa|study permit|bank account|rent|housing|where to live|moving to|settling/.test(t)) id = "visas";
  return id;
}

function normalizeExternal(r: Raw): Article | null {
  const slug = str(r.slug);
  const title = str(r.title);
  if (!slug || !title) return null;
  return {
    slug,
    title,
    summary: str(r.summary),
    category: categorize(r.category, title),
    kind: "external",
    publisher: str(r.provider),
    author: str(r.author),
    publishedAt: date(r.publishedAt),
    dateLabel: str(r.dateLabel),
    updatedAt: null,
    checkedAt: date(r.checkedAt),
    readingMinutes: null,
    centralAsia: false,
    countryCode: str(r.countryCode),
    featured: r.featured === true,
    url: str(r.url),
    body: null,
    sources: [],
    related: [],
    keyPoints: Array.isArray(r.points) ? (r.points as unknown[]).filter((x): x is string => typeof x === "string") : [],
    note: str(r.note),
    video: null,
    image: null,
    links: noLinks(),
  };
}

function wordCount(text: string) {
  return (text.match(/\S+/g) ?? []).length;
}
const readingMinutes = (text: string) => Math.max(1, Math.round(wordCount(text) / 200));

export function normalizeOwn(r: Raw): Article | null {
  if (str(r.status)?.toLowerCase() !== "approved") return null;
  const title = str(r.title);
  const body = str(r.body ?? r.content ?? r.markdown);
  if (!title || !body) return null;
  const slug = str(r.slug) ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const sources = (Array.isArray(r.sources) ? (r.sources as unknown[]) : [])
    .map((s) =>
      typeof s === "string"
        ? { title: s, url: s }
        : { title: str((s as Raw).title ?? (s as Raw).name) ?? str((s as Raw).url) ?? "", url: str((s as Raw).url) ?? "" },
    )
    .filter((s) => /^https?:\/\//.test(s.url));
  const centralAsia = r.central_asia === true || r.centralAsia === true;
  return {
    slug,
    title,
    summary: str(r.summary ?? r.description),
    category: categorize(r.category, title),
    kind: "own",
    publisher: "CollegeStat",
    author: str(r.author),
    publishedAt: date(r.published_at ?? r.publishedAt),
    dateLabel: null,
    updatedAt: date(r.updated_at ?? r.updatedAt),
    checkedAt: date(r.checked_at ?? r.checkedAt ?? r.reviewed_at),
    readingMinutes: readingMinutes(body),
    centralAsia,
    countryCode: str(r.country_code),
    featured: r.featured === true,
    url: null,
    body,
    sources: sources.map((s) => ({ ...s, title: s.title || s.url })),
    related: Array.isArray(r.related) ? (r.related as unknown[]).filter((x): x is string => typeof x === "string") : [],
    keyPoints: [],
    note: null,
    video: isVideo(r.video) ? r.video : null,
    image: null,
    links: noLinks(),
  };
}

const isVideo = (v: unknown): v is { id: string; title: string; channel: string } =>
  !!v && typeof (v as Raw).id === "string" && /^[A-Za-z0-9_-]{11}$/.test((v as Raw).id as string) && typeof (v as Raw).title === "string";

/** Our approved articles lead; external records follow. A slug present twice keeps the first. */
export function mergeArticles(external: Raw[], reviewed: Raw[] = [], overlay: ArticleOverlay = {}): Article[] {
  const approve = new Set(overlay.approve ?? []);
  const hidden = new Set(overlay.hidden ?? []);
  const patchOwn = (r: Raw): Raw => {
    const slug = str(r.slug) ?? "";
    let body = str(r.body ?? r.content ?? r.markdown) ?? "";
    for (const [from, to] of overlay.fixes?.[slug] ?? []) body = body.split(from).join(to);
    return {
      ...r,
      body,
      status: approve.has(slug) ? "approved" : r.status,
      author: r.author ?? overlay.author,
      published_at: r.published_at ?? r.publishedAt ?? r.checked_at,
      video: overlay.videos?.[slug] ?? r.video,
    };
  };
  const patchExt = (r: Raw): Raw => {
    const extra = overlay.external?.[str(r.slug) ?? ""];
    return extra ? { ...r, summary: extra.summary ?? r.summary, points: extra.points, note: extra.note, checkedAt: extra.checked_at ?? r.checkedAt } : r;
  };
  const own = reviewed.map(patchOwn).map(normalizeOwn).filter((a): a is Article => !!a);
  const ext = external
    .filter((r) => !hidden.has(str(r.slug) ?? ""))
    .map(patchExt)
    .map(normalizeExternal)
    .filter((a): a is Article => !!a);
  for (const a of own) {
    const c = overlay.covers?.[a.slug];
    if (c?.src) a.image = { src: c.src, alt: c.alt ?? a.title, credit: c.credit ?? null, licence: c.licence ?? null, licenceUrl: c.licence_url ?? null, sourceUrl: c.source_url ?? null };
    const l = overlay.links?.[a.slug];
    if (l) a.links = { universities: l.universities ?? [], scholarships: l.scholarships ?? [] };
  }
  const seen = new Set<string>();
  return [...own, ...ext].filter((a) => !seen.has(a.slug) && !!seen.add(a.slug));
}

export function inCategory(a: Article, id: string) {
  return !id || id === "all" || a.category === id;
}

export function filterArticles(list: Article[], category: string, query: string): Article[] {
  const q = query.trim().toLowerCase();
  return list.filter(
    (a) =>
      inCategory(a, category) &&
      (!q || [a.title, a.summary, a.publisher, a.author, a.countryCode].filter(Boolean).join(" ").toLowerCase().includes(q)),
  );
}

/** Categories that hold at least one article, in display order. */
export function usedCategories(list: Article[]) {
  return CATEGORIES.filter((c) => list.some((a) => inCategory(a, c.id)));
}

export function relatedArticles(list: Article[], a: Article, limit = 3): Article[] {
  const named = a.related.map((s) => list.find((x) => x.slug === s)).filter((x): x is Article => !!x);
  const rest = list.filter((x) => x.slug !== a.slug && x.category === a.category && !named.includes(x));
  return [...named, ...rest].slice(0, limit);
}

/** Neighbours within the same category, in list order. */
export function adjacentArticles(list: Article[], a: Article): { prev: Article | null; next: Article | null } {
  const group = list.filter((x) => x.category === a.category);
  const i = group.findIndex((x) => x.slug === a.slug);
  return { prev: i > 0 ? group[i - 1] : null, next: i >= 0 && i < group.length - 1 ? group[i + 1] : null };
}

// Markdown: headings, paragraphs, lists, quotes, links, bold, italic, code.
export type Block =
  | { type: "h2" | "h3"; text: string; id: string }
  | { type: "p" | "quote"; text: string }
  | { type: "ul" | "ol"; items: string[] };

const headingId = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9Ѐ-ӿ]+/g, "-").replace(/^-|-$/g, "") || "section";

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const used = new Map<string, number>();
  const uid = (t: string) => {
    const base = headingId(t);
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n ? `${base}-${n + 1}` : base;
  };
  for (const chunk of src.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((l) => l.trim());
    if (!lines.length) continue;
    const head = lines[0].match(/^(#{1,4})\s+(.*)$/);
    if (head) {
      const text = head[2].trim();
      // A leading h1 repeats the page title; deeper levels collapse to h2/h3.
      if (head[1].length > 1) blocks.push({ type: head[1].length === 2 ? "h2" : "h3", text, id: uid(text) });
      if (lines.length > 1) blocks.push(...parseMarkdown(lines.slice(1).join("\n")));
    } else if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      blocks.push({ type: "ul", items: lines.map((l) => l.replace(/^\s*[-*]\s+/, "")) });
    } else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      blocks.push({ type: "ol", items: lines.map((l) => l.replace(/^\s*\d+[.)]\s+/, "")) });
    } else if (lines.every((l) => l.startsWith(">"))) {
      blocks.push({ type: "quote", text: lines.map((l) => l.replace(/^>\s?/, "")).join(" ") });
    } else {
      blocks.push({ type: "p", text: lines.join(" ") });
    }
  }
  return blocks;
}

export const tableOfContents = (blocks: Block[]) =>
  blocks.filter((b): b is Extract<Block, { type: "h2" | "h3" }> => b.type === "h2" || b.type === "h3");
