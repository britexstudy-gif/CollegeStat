import { z } from "zod";
import { countries as countryNames, countryName, languageMinimum, admission, type University } from "@/lib/domain";
import { valueOf, type Filters } from "@/lib/research";
import { universityRanks, rankLabel, rankingPublishers } from "@/lib/ranking-highlights";
import { chanceFor, tuitionUSD } from "@/lib/admission-chance";
import { chanceProfile, snapshotFrom } from "@/lib/student-profile";
import { deadlineTimeline, suggestedFit } from "@/lib/my-colleges";
import { eligibleFor, type Scholarship } from "@/lib/scholarships-data";
import { rateWriting } from "@/lib/writing-rating";
import {
  scholarshipHref,
  universityHref,
  type AssistantCard,
  type AssistantToolName,
  type CardIdentity,
  type CardStat,
  type Fit,
  type ScamFlag,
  type UniversityCardItem,
} from "@/lib/ai-assistant";

/** The counsellor's tools. Everything here reads CollegeStat's own data; the
 * two "write" tools only return a proposal card. The student confirms it in
 * the UI and the browser saves it through the existing workspace paths, so
 * nothing is ever written on the model's say-so. Every argument comes from the
 * model and is validated here. */

export type TaskRow = { id: string; title: string; done: boolean; due_at: string | null };

export type ToolDeps = {
  /** Structured catalogue filter (hosted explore_universities or the bundled catalogue). */
  explore: (filters: Partial<Filters>, signal: AbortSignal) => Promise<University[]>;
  /** Name / free-text search. */
  search: (query: string, signal: AbortSignal) => Promise<University[]>;
  university: (slug: string, signal: AbortSignal) => Promise<University | null>;
  scholarships: () => Promise<Scholarship[]>;
  /** The signed-in student's `profiles.preferences` (never name or email). */
  preferences: (signal: AbortSignal) => Promise<unknown>;
  /** Structured essay feedback from the model; may be missing (local checks still run). */
  essayFeedback?: (input: { text: string; prompt: string; language: string }, signal: AbortSignal) => Promise<unknown>;
  /** Live web lookup restricted to official sites; returns a short answer and its source URLs. */
  webLookup?: (question: string, signal: AbortSignal) => Promise<{ answer: string; sources: string[] } | null>;
  /** The signed-in student's plan tasks (`user_checklist`), read with their session. */
  tasks?: (signal: AbortSignal) => Promise<TaskRow[]>;
  /** Proposal ids (UUIDs in production). */
  newId?: () => string;
  today?: () => string;
};

export type ToolOutcome = {
  /** Compact JSON the model reads. */
  result: unknown;
  card?: AssistantCard;
  ok: boolean;
  n?: number;
};

/* ── Tool definitions sent to the model ─────────────────────────────── */

const fn = (name: AssistantToolName, description: string, properties: Record<string, unknown>, required: string[] = []) => ({
  type: "function" as const,
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});

export const ASSISTANT_TOOLS = [
  fn(
    "search_universities",
    "Search CollegeStat's university catalogue. Use filters rather than prose. Returns up to 6 universities with key facts and CollegeStat page links.",
    {
      query: { type: "string", description: "University name or keyword, optional" },
      country: { type: "string", description: "Country name or ISO-2 code, several separated by commas" },
      major: { type: "string", description: "Field of study, e.g. computer science" },
      budget: { type: "number", description: "Max yearly tuition in USD" },
      ielts: { type: "number", description: "Student's IELTS band: only universities whose minimum is at or below it" },
      sat: { type: "number", description: "Student's SAT total, used to label reach/target/likely" },
      platform: { type: "string", enum: ["common_app", "ucas", "any"], description: "Application platform" },
      min_admission_rate: { type: "number", description: "Only universities admitting at least this % of applicants" },
      sort: { type: "string", enum: ["rank", "tuition", "admission_desc"] },
    },
  ),
  fn("get_university", "Facts for one university by slug: rankings, tuition and costs, admission rate, requirements, deadlines, programmes, official site. Use only a slug returned by search_universities or a CollegeStat link; never guess a slug - search first.", {
    slug: { type: "string" },
  }, ["slug"]),
  fn("find_scholarships", "Find scholarships in CollegeStat's verified list. The student's home country is applied automatically for eligibility.", {
    country: { type: "string", description: "Destination country name or ISO-2 code" },
    level: { type: "string", enum: ["bachelor", "master", "phd", "any"] },
    need: { type: "string", enum: ["full", "partial", "any"], description: "Funding needed" },
    keyword: { type: "string" },
  }),
  fn("compare", "Compare 2-4 universities side by side by slug.", {
    slugs: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
  }, ["slugs"]),
  fn("get_profile", "Read the student's own profile: home country, target countries, majors, budget, grades, test scores, activities. No name or email.", {}),
  fn("estimate_chance", "Reach / target / likely estimate for one university from the student's taken scores and the university's published admission data. A guide to list balance, never a prediction.", {
    slug: { type: "string" },
  }, ["slug"]),
  fn("add_to_my_colleges", "PROPOSE adding a university to the student's 'My colleges' list with a fit label. Shows a card the student must confirm; nothing is saved until they do. Only when the student asks to add or save.", {
    slug: { type: "string" },
    fit: { type: "string", enum: ["reach", "target", "safety"] },
  }, ["slug"]),
  fn("create_deadline_plan", "PROPOSE a dated plan from the published deadlines of 1-6 universities. Shows a card the student must confirm. Only when the student asks for a plan or deadlines.", {
    slugs: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
  }, ["slugs"]),
  fn("review_essay", "Structured feedback on the student's own essay draft (never rewrite it for them).", {
    text: { type: "string" },
    prompt: { type: "string", description: "The essay question, if given" },
  }, ["text"]),
  fn("scam_check", "Check an education agency's offer or claims that the student pasted: red flags and whether the universities named exist in CollegeStat.", {
    text: { type: "string", description: "The agency's claims, as pasted" },
    universities: { type: "array", items: { type: "string" }, maxItems: 6, description: "University names mentioned in the text" },
  }, ["text"]),
  fn("open_page", "Open a page of the CollegeStat app for the student (shows an Open button). Use when the student asks to go somewhere, or when the next step is on another page. For a university or scholarship page pass its slug.", {
    page: { type: "string", enum: ["home", "plan", "my_colleges", "profile", "report", "chances", "essays", "scholarships", "universities", "rankings", "articles", "settings", "university", "scholarship"] },
    slug: { type: "string", description: "Only for page=university or page=scholarship" },
    label: { type: "string", description: "Short button text in the student's language, e.g. 'Open your plan'" },
  }, ["page", "label"]),
  fn("add_tasks", "PROPOSE 1-8 tasks for the student's plan (to-do list), e.g. 'Book the IELTS exam'. Shows a card the student must confirm; nothing is saved until they do. Due dates in YYYY-MM-DD, only when sensible.", {
    tasks: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "object", additionalProperties: false, required: ["title"], properties: { title: { type: "string" }, due: { type: "string", description: "YYYY-MM-DD" } } },
    },
  }, ["tasks"]),
  fn("list_tasks", "Read the student's plan: every task with its id, title, due date and whether it is done. Call it before update_task or complete_task (you need the ids), or when the student asks what is on their plan or what to do next.", {}),
  fn("update_task", "PROPOSE renaming and/or re-dating ONE task that is already on the plan (id from list_tasks). Shows a card the student must confirm; nothing changes until they do. due is YYYY-MM-DD, or \"none\" to remove the date.", {
    id: { type: "string", description: "Task id from list_tasks" },
    title: { type: "string", description: "New title" },
    due: { type: "string", description: "New due date YYYY-MM-DD, or \"none\"" },
  }, ["id"]),
  fn("complete_task", "PROPOSE marking 1-8 plan tasks done (ids from list_tasks), or not done with done=false. Shows a card the student must confirm.", {
    ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
    done: { type: "boolean", description: "Default true" },
  }, ["ids"]),
  fn("show_chart", "Draw a small chart for the student. Every value MUST come from tool results or the student's profile in this conversation (never invented). Good for comparing tuition, admission rates, SAT ranges, deadlines per month, scores.", {
    title: { type: "string" },
    unit: { type: "string", description: "e.g. 'USD / year', '%', 'SAT'" },
    type: { type: "string", enum: ["bar", "column"], description: "bar = horizontal (names), column = vertical (months, years)" },
    items: {
      type: "array",
      minItems: 2,
      maxItems: 12,
      items: { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: { type: "string" }, value: { type: "number" }, note: { type: "string" } } },
    },
    source: { type: "string", description: "Where the numbers came from, e.g. 'CollegeStat university pages'" },
  }, ["title", "unit", "type", "items", "source"]),
  fn("web_lookup", "Look up a CURRENT fact on the live web, from official university, government or national application-service websites only. Use it when CollegeStat has no data for something the student needs (tuition, fees, English minimum, deadline, programme language) - after get_university or search came back without it. Ask one precise question naming the university, e.g. 'TU Munich tuition for non-EU bachelor students 2026/27'. Results may be less certain than CollegeStat data: say they come from the official site and link the source.", {
    question: { type: "string" },
  }, ["question"]),
  fn("make_quiz", "Make a short interactive practice quiz (2-6 multiple-choice questions) in the student's language: IELTS/SAT practice, admissions knowledge, or facts about universities from tool results. Questions must have one clearly correct answer.", {
    title: { type: "string" },
    questions: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["q", "options", "answer", "why"],
        properties: {
          q: { type: "string", description: "The question only; never list the options inside it" },
          options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
          answer: { type: "integer", description: "0-based index of the correct option" },
          why: { type: "string", description: "One-line explanation" },
        },
      },
    },
  }, ["title", "questions"]),
];

/* ── Argument validation ─────────────────────────────────────────────── */

const str = (max: number) => z.string().trim().max(max);
const num = (min: number, max: number) => z.coerce.number().min(min).max(max);
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,159}$/);
export const toolArgs = {
  search_universities: z.object({
    query: str(120).optional(),
    country: str(120).optional(),
    major: str(100).optional(),
    budget: num(0, 1000000).optional(),
    ielts: num(0, 9).optional(),
    sat: num(400, 1600).optional(),
    platform: z.enum(["common_app", "ucas", "any"]).optional(),
    min_admission_rate: num(0, 100).optional(),
    sort: z.enum(["rank", "tuition", "admission_desc"]).optional(),
  }),
  get_university: z.object({ slug }),
  find_scholarships: z.object({
    country: str(60).optional(),
    level: z.enum(["bachelor", "master", "phd", "any"]).optional(),
    need: z.enum(["full", "partial", "any"]).optional(),
    keyword: str(60).optional(),
  }),
  compare: z.object({ slugs: z.array(slug).min(2).max(4) }),
  get_profile: z.object({}).passthrough(),
  estimate_chance: z.object({ slug }),
  add_to_my_colleges: z.object({ slug, fit: z.enum(["reach", "target", "safety"]).optional() }),
  create_deadline_plan: z.object({ slugs: z.array(slug).min(1).max(6) }),
  review_essay: z.object({ text: z.string().trim().min(40).max(12000), prompt: str(600).optional() }),
  scam_check: z.object({ text: z.string().trim().min(10).max(6000), universities: z.array(str(160)).max(6).optional() }),
  web_lookup: z.object({ question: str(300).min(8) }),
  open_page: z.object({
    page: z.enum(["home", "plan", "my_colleges", "profile", "report", "chances", "essays", "scholarships", "universities", "rankings", "articles", "settings", "university", "scholarship"]),
    slug: slug.optional(),
    label: str(60),
  }),
  add_tasks: z.object({
    tasks: z.array(z.object({ title: str(200).min(2), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })).min(1).max(8),
  }),
  list_tasks: z.object({}),
  update_task: z
    .object({
      id: str(64).min(8),
      title: str(200).min(2).optional(),
      due: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("none")]).optional(),
    })
    .refine((x) => x.title !== undefined || x.due !== undefined, "give a new title or due date"),
  complete_task: z.object({ ids: z.array(str(64).min(8)).min(1).max(8), done: z.boolean().optional() }),
  show_chart: z.object({
    title: str(120).min(1),
    unit: str(40),
    type: z.enum(["bar", "column"]),
    items: z.array(z.object({ label: str(80).min(1), value: z.coerce.number().finite(), note: str(80).optional() })).min(2).max(12),
    source: str(160),
  }),
  make_quiz: z.object({
    title: str(120).min(1),
    questions: z
      .array(
        z
          .object({ q: str(400).min(3), options: z.array(str(200).min(1)).min(2).max(4), answer: z.coerce.number().int().min(0).max(3), why: str(300) })
          .refine((x) => x.answer < x.options.length),
      )
      .min(2)
      .max(6),
  }),
} satisfies Record<AssistantToolName, z.ZodTypeAny>;

/** Short, display-safe arguments for the visible step ("Searching universities in Korea…"). */
export function stepArgs(tool: AssistantToolName, args: Record<string, unknown>): Record<string, string> {
  const pick = (k: string, max = 60) => (typeof args[k] === "string" || typeof args[k] === "number" ? String(args[k]).slice(0, max) : "");
  const out: Record<string, string> = {};
  if (tool === "search_universities") {
    const codes = countryCodes(String(args.country || ""));
    if (codes.length) out.where = codes.map(countryName).join(", ");
    if (pick("major")) out.what = pick("major");
    else if (pick("query")) out.what = pick("query");
  }
  if (tool === "find_scholarships") {
    const codes = countryCodes(String(args.country || ""));
    if (codes.length) out.where = codes.map(countryName).join(", ");
  }
  if (["get_university", "estimate_chance", "add_to_my_colleges"].includes(tool) && pick("slug", 160)) out.slug = pick("slug", 160);
  if (Array.isArray(args.slugs)) out.n = String(args.slugs.length);
  return out;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

const ALIASES: Record<string, string> = {
  usa: "US", "united states of america": "US", america: "US", uk: "GB", britain: "GB", england: "GB", scotland: "GB",
  korea: "KR", "south korea": "KR", turkey: "TR", "türkiye": "TR", czechia: "CZ", holland: "NL",
  // Common Russian / Uzbek names students type.
  "сша": "US", "америка": "US", "великобритания": "GB", "англия": "GB", "германия": "DE", "корея": "KR",
  "южная корея": "KR", "япония": "JP", "китай": "CN", "канада": "CA", "турция": "TR", "италия": "IT",
  "венгрия": "HU", "польша": "PL", "чехия": "CZ", "малайзия": "MY", "сингапур": "SG", "австралия": "AU",
  "франция": "FR", "нидерланды": "NL", "казахстан": "KZ", "узбекистан": "UZ",
  "germaniya": "DE", "koreya": "KR", "janubiy koreya": "KR", "yaponiya": "JP", "xitoy": "CN", "kanada": "CA",
  "turkiya": "TR", "angliya": "GB", "buyuk britaniya": "GB", "italiya": "IT", "vengriya": "HU", "polsha": "PL",
};
const NAME_TO_CODE = Object.fromEntries(Object.entries(countryNames).map(([code, name]) => [name.toLowerCase(), code]));
export function countryCodes(input: string): string[] {
  const out = new Set<string>();
  for (const part of input.split(/[,;/]| and | или | va /i).map((p) => p.trim().toLowerCase()).filter(Boolean).slice(0, 6)) {
    const code = /^[a-z]{2}$/.test(part) && countryNames[part.toUpperCase()] ? part.toUpperCase() : NAME_TO_CODE[part] || ALIASES[part];
    if (code) out.add(code);
  }
  return [...out];
}

const money = (n: number, currency = "USD") =>
  (currency === "USD" ? "$" : currency + " ") + Math.round(n).toLocaleString("en-US");

export function identity(u: University): CardIdentity & { place: string } {
  return {
    id: u.id,
    slug: u.slug,
    name: u.name,
    short_name: u.short_name ?? null,
    website: u.website ?? null,
    logo_url: u.logo_url ?? null,
    website_icon_url: u.website_icon_url ?? null,
    auto_logo: u.auto_logo ?? null,
    brand_color: u.brand_color,
    place: [u.city, countryName(u.country_code)].filter(Boolean).join(", "),
  };
}

function bestRank(u: University) {
  const ranks = universityRanks(u);
  const r = ranks.find((x) => x.provider === "qs") || ranks[0];
  return r ? { label: rankLabel(r), provider: rankingPublishers[r.provider]?.name || r.provider.toUpperCase(), year: r.year, url: r.url } : null;
}
function tuitionFact(u: University) {
  const usd = tuitionUSD(u);
  if (usd != null) return { value: usd, text: money(usd) + "/yr" };
  const t = valueOf(u, "tuition");
  if (t.value != null) return { value: null, text: money(t.value, t.currency || "USD") + "/yr" };
  return null;
}
const admitRate = (u: University) => {
  const v = valueOf(u, "admission").value;
  return v != null && v > 0 && v <= 100 ? Math.round(v) : null;
};

/** The three stats a mini-card shows, first available wins: rank, tuition, admission rate, IELTS. */
export function cardStats(u: University): CardStat[] {
  const stats: CardStat[] = [];
  const rank = bestRank(u);
  if (rank) stats.push({ k: "rank", v: rank.label, note: `${rank.provider} ${rank.year}` });
  const fee = tuitionFact(u);
  if (fee) stats.push({ k: "tuition", v: fee.text });
  const rate = admitRate(u);
  if (rate != null) stats.push({ k: "admission", v: rate + "%" });
  const ielts = u.requirements ? languageMinimum(u, "IELTS") : null;
  if (ielts != null) stats.push({ k: "ielts", v: String(ielts) });
  return stats.slice(0, 3);
}

/** Model-facing facts for one row. Only published values; missing ones are omitted. */
function brief(u: University) {
  const rank = bestRank(u);
  const fee = tuitionFact(u);
  const rate = admitRate(u);
  const ielts = u.requirements ? languageMinimum(u, "IELTS") : null;
  return {
    name: u.name,
    slug: u.slug,
    place: identity(u).place,
    page: universityHref(u.slug),
    ...(rank ? { rank: `${rank.label} ${rank.provider} ${rank.year}` } : {}),
    ...(fee ? { tuition_international: fee.text } : {}),
    ...(rate != null ? { admission_rate: rate + "%" } : {}),
    ...(ielts != null ? { ielts_minimum: ielts } : {}),
    ...(u.website ? { official_site: u.website } : {}),
  };
}

type Ctx = { signal: AbortSignal; language: string };

/* ── The toolbox ─────────────────────────────────────────────────────── */

export function createAssistantTools(deps: ToolDeps) {
  const today = deps.today || (() => new Date().toISOString().slice(0, 10));
  const newId = deps.newId || (() => crypto.randomUUID());
  let prefsCache: Promise<unknown> | null = null;
  // Universities already shown as a card in this answer; a later lookup of the same one adds no second card.
  const shown = new Set<string>();
  const prefs = (signal: AbortSignal) => (prefsCache ??= deps.preferences(signal).catch(() => null));
  const snapshot = async (signal: AbortSignal) => snapshotFrom(await prefs(signal));
  const load = async (s: string, signal: AbortSignal) => deps.university(s, signal).catch(() => null);
  const notFound = (s: string) => ({ result: { error: `No university with slug "${s}" in CollegeStat. Search first and use a slug from the results.` }, ok: false });

  const handlers: { [K in AssistantToolName]: (args: z.infer<(typeof toolArgs)[K]>, ctx: Ctx) => Promise<ToolOutcome> } = {
    async search_universities(a, { signal }) {
      const codes = countryCodes(a.country || "");
      if (a.country && !codes.length) return { result: { error: `Unknown country "${a.country}". Use an ISO-2 code.` }, ok: false };
      if (a.platform === "ucas" && !codes.length) codes.push("GB");
      const filters: Partial<Filters> = {
        q: a.query || "",
        country: codes.join(","),
        field: a.major || "",
        ...(a.budget != null ? { cost_max: a.budget } : {}),
        ...(a.ielts != null ? { ielts_max: a.ielts } : {}),
        ...(a.min_admission_rate != null ? { admission_min: a.min_admission_rate } : {}),
        sort: a.sort || "rank",
      };
      let rows = await deps.explore(filters, signal);
      // Most catalogue rows don't publish international tuition, so a budget
      // filter alone can empty the list. Say so and show the matches anyway.
      let budgetNote: string | undefined;
      if (!rows.length && a.budget != null) {
        rows = await deps.explore({ ...filters, cost_max: undefined }, signal);
        if (rows.length)
          budgetNote = `None of these publish tuition at or below ${a.budget} USD. Results ignore the budget; tuition is listed only where published, so tell the student to check costs on the official sites.`;
      }
      // Subject lists are incomplete for many universities: widen once, and say so.
      if (!rows.length && a.major) {
        rows = await deps.explore({ ...filters, field: "", cost_max: undefined }, signal);
        if (rows.length)
          budgetNote = `CollegeStat has no subject data matching "${a.major}" here, so these results are not filtered by major${a.budget != null ? " or budget" : ""}. Tell the student to check each university's programmes on its page or official site.`;
      }
      if (!rows.length && a.query && !codes.length && !a.major) rows = await deps.search(a.query, signal);
      // A name search ("Seoul National University") keeps only real name matches, so similar
      // words ("National", "Seoul") don't pull in unrelated universities.
      if (a.query && rows.length > 1) {
        const q = a.query.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
        const names = (u: University) => [u.name, u.short_name, ...(u.aliases || [])].filter(Boolean).map((x) => String(x).toLowerCase());
        const exact = rows.filter((u) => names(u).some((n) => n === q || n.includes(q) || (q.length > 3 && q.includes(n))));
        if (exact.length) rows = exact;
      }
      if (a.platform === "common_app") {
        const { default: commonApp } = await import("@/data/published/common-app-members.json");
        const members = (commonApp as { records: Record<string, unknown> }).records;
        rows = rows.filter((u) => u.id in members);
      }
      rows = rows.slice(0, 6);
      const p = chanceProfile(await snapshot(signal));
      if (a.sat) p.sat = a.sat;
      if (a.ielts) p.ielts = a.ielts;
      const personal = !!(p.sat || p.act || p.ielts || p.toefl);
      const items: UniversityCardItem[] = rows.map((u) => ({
        ...identity(u),
        stats: cardStats(u),
        ...(personal ? { chance: chanceFor(p, u).category } : {}),
      }));
      if (!rows.length)
        return { result: { results: [], note: "No universities in CollegeStat match these filters. Suggest loosening one filter." }, ok: true, n: 0 };
      return {
        result: {
          ...(budgetNote ? { note: budgetNote } : {}),
          results: rows.map((u, i) => (shown.add(u.id), { ...brief(u), ...(items[i].chance && items[i].chance !== "unknown" ? { fit: items[i].chance } : {}) })),
        },
        card: { kind: "universities", items },
        ok: true,
        n: rows.length,
      };
    },

    async get_university(a, { signal }) {
      const u = await load(a.slug, signal);
      if (!u) return notFound(a.slug);
      const a0 = u.admissions?.length ? admission(u) : undefined;
      const programmes = [
        ...(u.university_programs || []).map((o) => o.programs).filter((p) => p && /bachelor|undergrad/i.test(p.degree_level)).map((p) => p.name),
        ...(u.reported_programs || []).filter((p) => /bachelor/i.test(p.level || p.award)).map((p) => p.name),
      ];
      const ranks = universityRanks(u).slice(0, 4).map((r) => `${rankLabel(r)} ${rankingPublishers[r.provider]?.name || r.provider} ${r.year}`);
      return {
        result: {
          ...brief(u),
          type: u.university_type || undefined,
          founded: u.founded_year || undefined,
          rankings: ranks.length ? ranks : undefined,
          sat_range: a0?.sat_min && a0?.sat_max ? `${a0.sat_min}-${a0.sat_max}` : undefined,
          costs: (u.costs || [])
            .filter((c) => !c.program_id)
            .slice(0, 6)
            .map((c) => `${c.category} ${money(c.amount, c.currency)} per ${c.period} (${c.student_category}${c.year ? ", " + c.year : ""})`),
          requirements: (u.requirements || [])
            .filter((r) => !r.program_id)
            .slice(0, 10)
            .map((r) => [r.label, r.minimum != null ? "min " + r.minimum : ""].filter(Boolean).join(" ")),
          deadlines: deadlineTimeline(u, today()).map((d) => ({ title: d.title, date: d.date, source: d.source_url || undefined })),
          bachelor_programmes: programmes.length ? [...new Set(programmes)].slice(0, 15) : undefined,
          application_url: u.application_url || undefined,
        },
        ...(shown.has(u.id) ? {} : (shown.add(u.id), { card: { kind: "universities" as const, items: [{ ...identity(u), stats: cardStats(u) }] } })),
        ok: true,
        n: 1,
      };
    },

    async find_scholarships(a, { signal }) {
      const codes = countryCodes(a.country || "");
      if (a.country && !codes.length) return { result: { error: `Unknown country "${a.country}".` }, ok: false };
      const home = (await snapshot(signal)).home;
      const level = a.level && a.level !== "any" ? a.level : "bachelor";
      const now = today();
      const list = (await deps.scholarships())
        .filter((s) => !codes.length || (s.country && codes.includes(s.country)))
        .filter((s) => !s.level || /any|all/i.test(s.level) || s.level.toLowerCase().includes(level))
        .filter((s) => !a.need || a.need === "any" || (a.need === "full" ? s.funding === "full" : true))
        .filter((s) => !home || eligibleFor(s, home))
        .filter((s) => !a.keyword || (s.name + " " + (s.provider || "") + " " + (s.description || "")).toLowerCase().includes(a.keyword.toLowerCase()))
        .filter((s) => !s.deadline || s.deadline >= now)
        .sort((x, y) => (x.deadline || "9999").localeCompare(y.deadline || "9999"))
        .slice(0, 6);
      if (!list.length) return { result: { results: [], note: "No matching scholarship in CollegeStat's verified list." }, ok: true, n: 0 };
      return {
        result: {
          results: list.map((s) => ({
            name: s.name,
            provider: s.provider || undefined,
            country: s.country ? countryName(s.country) : "Several",
            funding: s.fundingKind || s.funding,
            covers: s.covers || undefined,
            deadline: s.deadline || s.deadlineNote || undefined,
            page: scholarshipHref(s.slug),
            official: s.applicationUrl || s.sourceUrl || undefined,
          })),
          eligibility_checked_for: home ? countryName(home) : undefined,
        },
        card: {
          kind: "scholarships",
          items: list.map((s) => ({
            slug: s.slug,
            name: s.name,
            provider: s.provider,
            country: s.country,
            funding: s.funding,
            level: s.level,
            deadline: s.deadline,
            url: s.applicationUrl || s.sourceUrl,
          })),
        },
        ok: true,
        n: list.length,
      };
    },

    async compare(a, { signal }) {
      const rows = (await Promise.all([...new Set(a.slugs)].map((s) => load(s, signal)))).filter((u): u is University => !!u);
      if (rows.length < 2) return { result: { error: "Fewer than two of these slugs exist in CollegeStat. Search first." }, ok: false };
      const p = chanceProfile(await snapshot(signal));
      const now = today();
      const facts = rows.map((u) => {
        const a0 = u.admissions?.length ? admission(u) : undefined;
        const next = deadlineTimeline(u, now).find((d) => !d.past);
        return {
          rank: bestRank(u)?.label ? `${bestRank(u)!.label} ${bestRank(u)!.provider}` : null,
          tuition: tuitionFact(u)?.text ?? null,
          admission: admitRate(u) != null ? admitRate(u) + "%" : null,
          ielts: u.requirements && languageMinimum(u, "IELTS") != null ? String(languageMinimum(u, "IELTS")) : null,
          sat: a0?.sat_min && a0?.sat_max ? `${a0.sat_min}–${a0.sat_max}` : null,
          deadline: next ? next.date : null,
          chance: p.sat || p.act || p.ielts || p.toefl ? [chanceFor(p, u).category].find((c) => c !== "unknown") ?? null : null,
        };
      });
      const keys = ["rank", "tuition", "admission", "ielts", "sat", "deadline", "chance"] as const;
      const tableRows = keys
        .map((k) => ({ k, values: facts.map((f) => f[k]) }))
        .filter((r) => r.values.some((v) => v != null));
      return {
        result: { universities: rows.map((u, i) => ({ name: u.name, slug: u.slug, page: universityHref(u.slug), ...Object.fromEntries(Object.entries(facts[i]).filter(([, v]) => v != null)) })) },
        card: { kind: "compare", columns: rows.map(identity), rows: tableRows },
        ok: true,
        n: rows.length,
      };
    },

    async get_profile(_a, { signal }) {
      const raw = await prefs(signal);
      if (!raw) return { result: { note: "The student has not filled in a profile yet. Ask what you need." }, ok: true, n: 0 };
      // Profile > Personalization: the student can switch personalization off.
      const extra = raw as { personalize_off?: unknown; ai_notes?: unknown };
      if (extra.personalize_off === true)
        return { result: { note: "The student turned personalization off. Don't use their profile; ask for what you need." }, ok: true, n: 0 };
      const notes = typeof extra.ai_notes === "string" ? extra.ai_notes.trim().slice(0, 600) : "";
      const s = snapshotFrom(raw);
      return {
        result: {
          home_country: s.home ? countryName(s.home) : undefined,
          target_countries: s.dreams.map(countryName),
          majors: s.majors,
          budget_usd_per_year: s.budget && s.budget < 90000 ? s.budget : s.budget ? "no limit" : undefined,
          funding: s.funding,
          start_year: s.start_year,
          school_class: s.school_class,
          grade: s.grade ? `${s.grade.value} (${s.grade.scale})` : undefined,
          national_exam: s.exam ? `${s.exam.id} ${s.exam.score}` : undefined,
          tests: s.tests.slice(0, 8).map((t) => `${t.id} ${t.status}${t.score ? " " + t.score : ""}`),
          activities: s.activities.slice(0, 8).map((x) => [x.type, x.role].filter(Boolean).join(": ").slice(0, 80)),
          honours: s.honours.slice(0, 6).map((h) => [h.title.slice(0, 80), h.level, h.medal].filter(Boolean).join(" · ")),
          // Deeper onboarding answers (goals, preferences, money, timeline); enums only.
          ...(s.context && Object.keys(s.context).length ? { context: s.context } : {}),
          // Free text the student wrote for the AI (data, not instructions).
          ...(notes ? { student_notes: notes } : {}),
        },
        ok: true,
        n: 1,
      };
    },

    async estimate_chance(a, { signal }) {
      const u = await load(a.slug, signal);
      if (!u) return notFound(a.slug);
      const p = chanceProfile(await snapshot(signal));
      const c = chanceFor(p, u);
      const missing = [
        ...(!p.sat && !p.act ? ["sat"] : []),
        ...(!p.ielts && !p.toefl ? ["english"] : []),
        ...(c.rate == null ? ["admission_rate"] : []),
      ];
      return {
        result: {
          university: u.name,
          page: universityHref(u.slug),
          category: c.category,
          admission_rate: c.rate != null ? c.rate + "%" : "not published",
          sat: c.sat,
          english: c.english,
          over_budget: c.overBudget,
          missing_inputs: missing,
          note: "A guide based on published admission rates and score ranges, not a prediction.",
        },
        // "Not enough data" is said in the answer; a card would only repeat it.
        ...(c.category === "unknown" ? {} : { card: { kind: "chance" as const, university: identity(u), ...c, missing } }),
        ok: true,
        n: 1,
      };
    },

    async add_to_my_colleges(a, { signal }) {
      const u = await load(a.slug, signal);
      if (!u) return notFound(a.slug);
      const fit: Fit = a.fit || suggestedFit(u) || "target";
      const proposal = newId();
      return {
        result: { proposed: true, university: u.name, fit, status: "Waiting for the student to press Confirm on the card. Nothing is saved yet." },
        card: { kind: "add", proposal, university: identity(u), fit },
        ok: true,
        n: 1,
      };
    },

    async create_deadline_plan(a, { signal }) {
      const rows = (await Promise.all([...new Set(a.slugs)].map((s) => load(s, signal)))).filter((u): u is University => !!u);
      if (!rows.length) return { result: { error: "None of these slugs exist in CollegeStat. Search first." }, ok: false };
      const now = today();
      const items: (import("@/lib/ai-assistant").PlanItem & { university: string })[] = [];
      const missing: string[] = [];
      for (const u of rows) {
        const upcoming = deadlineTimeline(u, now).filter((d) => !d.past).slice(0, 2);
        if (!upcoming.length) {
          missing.push(u.name);
          continue;
        }
        const first = upcoming[0];
        // One preparation step three weeks before the first published deadline.
        const prep = new Date(first.date + "T00:00:00Z");
        prep.setUTCDate(prep.getUTCDate() - 21);
        const prepDate = prep.toISOString().slice(0, 10);
        if (prepDate > now)
          items.push({ title: `${u.name}: documents ready (transcript, English score, essays)`, date: prepDate, kind: "prep", source_url: null, university_id: u.id, university: u.name });
        for (const d of upcoming)
          items.push({ title: `${u.name}: ${d.title}`.slice(0, 300), date: d.date, kind: "deadline", source_url: d.source_url, university_id: u.id, university: u.name });
      }
      items.sort((x, y) => x.date.localeCompare(y.date));
      const proposal = newId();
      return {
        result: {
          proposed: items.length > 0,
          items: items.map((i) => ({ date: i.date, title: i.title, kind: i.kind })),
          no_published_deadline: missing.length ? missing : undefined,
          status: items.length
            ? "Waiting for the student to press Confirm on the card. Nothing is saved yet."
            : "No published upcoming deadlines; point to the official sites.",
          official_sites: rows.filter((u) => missing.includes(u.name) && u.website).map((u) => u.website),
        },
        ...(items.length ? { card: { kind: "plan" as const, proposal, items: items.slice(0, 14), missing } } : {}),
        ok: true,
        n: items.length,
      };
    },

    async review_essay(a, { signal, language }) {
      const rating = rateWriting(a.text);
      let model: { summary?: string; strengths?: string[]; improvements?: { issue: string; suggestion: string }[]; prompt_fit?: string } = {};
      if (deps.essayFeedback) {
        const raw = await deps.essayFeedback({ text: a.text, prompt: a.prompt || "", language }, signal).catch(() => null);
        const parsed = essayFeedback.safeParse(raw);
        if (parsed.success) model = parsed.data;
      }
      return {
        result: {
          words: rating.count,
          style_checks: rating.criteria.map((c) => `${c.label}: ${c.score}/5 (${c.note})`),
          ...model,
          note: "Give feedback and questions only. Never rewrite the essay.",
        },
        card: {
          kind: "essay",
          words: rating.count,
          criteria: rating.criteria.map((c) => ({ id: c.id, score: c.score })),
          strengths: model.strengths || [],
          improvements: model.improvements || [],
          ...(model.prompt_fit ? { prompt_fit: model.prompt_fit } : {}),
        },
        ok: true,
        n: 1,
      };
    },

    async web_lookup(a, { signal }) {
      if (!deps.webLookup) return { result: { error: "Live lookup is not available right now. Point to the official site." }, ok: false };
      const out = await deps.webLookup(a.question, signal).catch(() => null);
      if (!out || !out.answer) return { result: { error: "Nothing found on an official site. Say so in one sentence." }, ok: false };
      return {
        result: {
          answer: out.answer,
          sources: out.sources,
          note: "From official websites found just now, not CollegeStat's verified data. Link the source in your answer.",
        },
        ok: true,
        n: out.sources.length,
      };
    },

    async open_page(a, { signal }) {
      const { APP_PAGES } = await import("@/lib/ai-assistant");
      if (a.page === "university" || a.page === "scholarship") {
        if (!a.slug) return { result: { error: "slug is required for this page" }, ok: false };
        if (a.page === "university" && !(await load(a.slug, signal))) return { result: { error: "No university with this slug. Search first." }, ok: false };
        const href = a.page === "university" ? "/dashboard/university/" + a.slug : "/dashboard/library/scholarship/" + a.slug;
        return { result: { shown: true, status: "An Open button is shown to the student." }, card: { kind: "open", page: a.page, href, label: a.label }, ok: true, n: 1 };
      }
      const href = APP_PAGES[a.page];
      return { result: { shown: true, status: "An Open button is shown to the student." }, card: { kind: "open", page: a.page, href, label: a.label }, ok: true, n: 1 };
    },

    async add_tasks(a) {
      const now = today();
      const items = a.tasks.map((x) => ({
        title: x.title.slice(0, 300),
        date: x.due && x.due >= now ? x.due : "",
        kind: "prep" as const,
        source_url: null,
        university_id: null,
        university: "",
      }));
      return {
        result: { proposed: true, tasks: items.map((i) => ({ title: i.title, due: i.date || null })), status: "Waiting for the student to press Confirm on the card. Nothing is saved yet." },
        card: { kind: "plan", proposal: newId(), items, missing: [] },
        ok: true,
        n: items.length,
      };
    },

    async list_tasks(_a, { signal }) {
      if (!deps.tasks) return { result: { error: "The plan is not available right now." }, ok: false };
      const rows = (await deps.tasks(signal).catch(() => null)) as TaskRow[] | null;
      if (!rows) return { result: { error: "The plan could not be loaded right now." }, ok: false };
      const now = today();
      const tasks = rows.slice(0, 80).map((r) => ({ id: r.id, title: r.title, done: r.done, due: r.due_at, overdue: !r.done && !!r.due_at && r.due_at < now }));
      return { result: { today: now, open: tasks.filter((t) => !t.done).length, done: tasks.filter((t) => t.done).length, tasks }, ok: true, n: tasks.length };
    },

    async update_task(a, { signal }) {
      const rows = deps.tasks ? await deps.tasks(signal).catch(() => null) : null;
      const row = rows?.find((r) => r.id === a.id);
      if (!row) return { result: { error: "No task with this id. Call list_tasks and use an id from it." }, ok: false };
      const edit = {
        id: row.id,
        title: row.title,
        ...(a.title && a.title !== row.title ? { newTitle: a.title.slice(0, 300) } : {}),
        ...(a.due ? { due: a.due === "none" ? null : a.due } : {}),
      };
      if (edit.newTitle === undefined && edit.due === undefined) return { result: { error: "Nothing would change." }, ok: false };
      return {
        result: { proposed: true, status: "Waiting for the student to press Confirm on the card. Nothing is changed yet." },
        card: { kind: "task_edit", proposal: newId(), items: [edit] },
        ok: true,
        n: 1,
      };
    },

    async complete_task(a, { signal }) {
      const rows = deps.tasks ? await deps.tasks(signal).catch(() => null) : null;
      if (!rows) return { result: { error: "The plan could not be loaded right now." }, ok: false };
      const done = a.done !== false;
      const items = [...new Set(a.ids)].flatMap((id) => {
        const row = rows.find((r) => r.id === id);
        return row && row.done !== done ? [{ id: row.id, title: row.title, done }] : [];
      });
      if (!items.length) return { result: { error: "No matching task to change (wrong id, or already in that state). Call list_tasks." }, ok: false };
      return {
        result: { proposed: true, tasks: items.map((i) => i.title), status: "Waiting for the student to press Confirm on the card. Nothing is changed yet." },
        card: { kind: "task_edit", proposal: newId(), items },
        ok: true,
        n: items.length,
      };
    },

    async show_chart(a) {
      return {
        result: { shown: true, status: "The chart is shown to the student; don't repeat every number." },
        card: { kind: "chart", title: a.title, unit: a.unit, type: a.type, items: a.items, source: a.source },
        ok: true,
        n: a.items.length,
      };
    },

    async make_quiz(a) {
      return {
        result: { shown: true, status: "The quiz is shown as an interactive card. Don't reveal the answers in text." },
        card: { kind: "quiz", title: a.title, questions: a.questions.map((x) => ({ q: x.q, options: x.options, answer: x.answer, why: x.why })) },
        ok: true,
        n: a.questions.length,
      };
    },

    async scam_check(a, { signal }) {
      const flags = scamFlags(a.text);
      const names = [...new Set((a.universities || []).filter(Boolean))].slice(0, 6);
      const universities = await Promise.all(
        names.map(async (name) => {
          const match = (rows: University[]) => rows.slice(0, 8).find((u) => similar(u.name, name) || (u.aliases || []).some((x) => similar(x, name)));
          const hit =
            match(await deps.search(name, signal).catch(() => [] as University[])) ||
            match(await deps.explore({ q: name }, signal).catch(() => [] as University[]));
          return hit ? { name: hit.name, found: true, slug: hit.slug, place: identity(hit).place } : { name, found: false };
        }),
      );
      return {
        result: {
          red_flags: flags.map((f) => ({ flag: f.id, quote: f.quote })),
          universities: universities.map((u) => (u.found ? { name: u.name, in_collegestat: true, page: universityHref(u.slug!) } : { name: u.name, in_collegestat: false })),
          note: "Not being in CollegeStat does not prove a university is fake; tell the student to check the national accreditation register and the university's official site.",
        },
        card: { kind: "scam", flags, universities },
        ok: true,
        n: flags.length,
      };
    },
  };

  /** Validate and run one tool call from the model. Never throws. */
  async function run(name: string, rawArgs: string, ctx: Ctx): Promise<ToolOutcome & { args: Record<string, unknown> }> {
    if (!(name in handlers)) return { result: { error: "Unknown tool" }, ok: false, args: {} };
    let json: unknown = {};
    try {
      json = JSON.parse(rawArgs || "{}");
    } catch {
      return { result: { error: "Arguments were not valid JSON" }, ok: false, args: {} };
    }
    const tool = name as AssistantToolName;
    const parsed = toolArgs[tool].safeParse(json);
    if (!parsed.success)
      return {
        result: { error: "Invalid arguments: " + parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "args"} ${i.message}`).join("; ") },
        ok: false,
        args: (json && typeof json === "object" ? json : {}) as Record<string, unknown>,
      };
    try {
      const out = await (handlers[tool] as (a: unknown, c: Ctx) => Promise<ToolOutcome>)(parsed.data, ctx);
      return { ...out, args: parsed.data as Record<string, unknown> };
    } catch {
      if (ctx.signal.aborted) throw ctx.signal.reason ?? new Error("aborted");
      return { result: { error: "This lookup failed. Say the data could not be loaded right now." }, ok: false, args: parsed.data as Record<string, unknown> };
    }
  }
  return { run };
}

const essayFeedback = z.object({
  summary: z.string().max(600).optional(),
  strengths: z.array(z.string().max(300)).max(4).optional(),
  improvements: z.array(z.object({ issue: z.string().max(300), suggestion: z.string().max(400) })).max(5).optional(),
  prompt_fit: z.string().max(400).optional(),
});
export const ESSAY_FEEDBACK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "strengths", "improvements", "prompt_fit"],
  properties: {
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    improvements: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["issue", "suggestion"], properties: { issue: { type: "string" }, suggestion: { type: "string" } } },
    },
    prompt_fit: { type: "string" },
  },
};

/* ── Scam check: common red flags in agency offers ──────────────────── */

// Letters in any script (\w is ASCII-only), so Russian and Uzbek words match too.
const W = "[\\p{L}\\p{N}'’ʻ]";
const near = (a: string, b: string, gap = 4) => `(?:${a})${W}*(?:[^\\p{L}\\p{N}]+${W}+){0,${gap}}?[^\\p{L}\\p{N}]+(?:${b})`;
const both = (a: string, b: string, gap = 4) => new RegExp(`${near(a, b, gap)}|${near(b, a, gap)}`, "iu");
const GUARANTEE = "guarante|гарант|kafolat";
const ADMIT = "admission|admit|acceptance|offer|place|поступлен|зачислен|qabul";
const VISA = "visa|виз|viza";
const SCHOLARSHIP = "scholarship|grant|грант|стипенди|stipendiya";
const PAY = "fee|pay|cost|плат|оплат|взнос|to'lov|toʻlov|pul";
const FLAG_PATTERNS: [ScamFlag, RegExp][] = [
  ["guarantee", new RegExp(`${both(GUARANTEE, ADMIT).source}|100\\s*%\\s*(?:${ADMIT})`, "iu")],
  ["visa_guarantee", both(GUARANTEE, VISA, 3)],
  ["paid_scholarship", both(PAY, SCHOLARSHIP, 6)],
  ["no_test", /no\s+(?:ielts|toefl|exams?|tests?)\s+(?:needed|required)|without\s+(?:ielts|toefl|exams?)|без\s+(?:ielts|toefl|экзамен|тест)|ieltssiz|imtihonsiz/iu],
  ["upfront_fee", /(?:registration|processing|service|consultation|deposit|advance)\s+fee|предоплат|аванс|депозит|oldindan\s+to['ʻ’]?lov/iu],
  ["pressure", /only\s+\d+\s+(?:places|seats|spots)\s+left|last\s+(?:chance|day)|today\s+only|limited\s+(?:places|seats|time)|осталось\s+\d+\s+мест|только\s+сегодня|faqat\s+bugun/iu],
  ["personal_payment", /card\s+number|personal\s+(?:card|account)|номер\s+карты|на\s+карту|kartaga|karta\s+raqam/iu],
  ["fake_ranking", /top\s*-?\s*1\b|#1\s+(?:in|university)|best\s+university\s+in\s+the\s+world|лучший\s+университет\s+мира/iu],
];
export function scamFlags(text: string): { id: ScamFlag; quote: string }[] {
  const out: { id: ScamFlag; quote: string }[] = [];
  for (const [id, re] of FLAG_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const start = Math.max(0, text.lastIndexOf(" ", Math.max(0, m.index - 30)) + 1);
    const end = Math.min(text.length, m.index + m[0].length + 30);
    out.push({ id, quote: (start > 0 ? "…" : "") + text.slice(start, end).trim().replace(/\s+/g, " ") + (end < text.length ? "…" : "") });
  }
  return out;
}
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\b(the|of|university|universiteti|университет)\b/g, " ").replace(/\s+/g, " ").trim();
function similar(a: string, b: string) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const wa = new Set(x.split(" ")), wb = y.split(" ");
  return wb.filter((w) => wa.has(w)).length / Math.max(wb.length, 1) >= 0.6;
}
