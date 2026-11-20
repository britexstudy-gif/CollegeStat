/** Shared shapes for the agentic counsellor (server/ai-agent.ts streams them,
 * app/dashboard/assistant renders them). Pure and client-safe. */

export const ASSISTANT_TOOL_NAMES = [
  "search_universities",
  "get_university",
  "find_scholarships",
  "compare",
  "get_profile",
  "estimate_chance",
  "add_to_my_colleges",
  "create_deadline_plan",
  "review_essay",
  "scam_check",
  "open_page",
  "add_tasks",
  "list_tasks",
  "update_task",
  "complete_task",
  "show_chart",
  "make_quiz",
  "web_lookup",
] as const;
export type AssistantToolName = (typeof ASSISTANT_TOOL_NAMES)[number];

export type Fit = "reach" | "target" | "safety";

/** Logo identity a card needs (the same fields UniversityLogo reads). */
export type CardIdentity = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  website: string | null;
  logo_url: string | null;
  website_icon_url?: string | null;
  auto_logo?: string | null;
  brand_color?: string;
};
export type CardStat = { k: "rank" | "tuition" | "admission" | "ielts" | "sat"; v: string; note?: string };
export type UniversityCardItem = CardIdentity & {
  place: string;
  stats: CardStat[];
  /** Personal Reach / Target / Likely from lib/admission-chance (only with a profile). */
  chance?: "reach" | "target" | "likely" | "unknown";
};
export type ScholarshipCardItem = {
  slug: string;
  name: string;
  provider: string | null;
  country: string | null;
  funding: "full" | "partial";
  level: string;
  deadline: string | null;
  url: string | null;
};
export type PlanItem = { title: string; date: string; kind: "deadline" | "prep"; source_url: string | null; university_id: string | null };

/** One proposed change to a task already on the student's plan (update_task / complete_task). */
export type TaskEdit = { id: string; title: string; newTitle?: string; due?: string | null; done?: boolean };

export type AssistantCard =
  | { kind: "universities"; items: UniversityCardItem[] }
  | { kind: "compare"; columns: (CardIdentity & { place: string })[]; rows: { k: string; values: (string | null)[] }[] }
  | { kind: "scholarships"; items: ScholarshipCardItem[] }
  | {
      kind: "chance";
      university: CardIdentity & { place: string };
      category: "reach" | "target" | "likely" | "unknown";
      rate?: number;
      sat?: { low: number; high: number; band: "below" | "within" | "above" };
      english?: { test: string; minimum: number; meets?: boolean };
      tuition?: number;
      overBudget?: boolean;
      missing: string[];
    }
  | { kind: "add"; proposal: string; university: CardIdentity & { place: string }; fit: Fit }
  | { kind: "plan"; proposal: string; items: (PlanItem & { university: string })[]; missing: string[] }
  | { kind: "task_edit"; proposal: string; items: TaskEdit[] }
  | {
      kind: "essay";
      words: number;
      criteria: { id: string; score: number }[];
      strengths: string[];
      improvements: { issue: string; suggestion: string }[];
      prompt_fit?: string;
    }
  | { kind: "open"; page: AppPage | "university" | "scholarship"; href: string; label: string }
  | { kind: "chart"; title: string; unit: string; type: "bar" | "column"; items: { label: string; value: number; note?: string }[]; source: string }
  | { kind: "quiz"; title: string; questions: { q: string; options: string[]; answer: number; why: string }[] }
  | {
      kind: "scam";
      flags: { id: ScamFlag; quote: string }[];
      universities: { name: string; found: boolean; slug?: string; place?: string }[];
    };

/** Pages the assistant can open for the student (open_page). */
export const APP_PAGES = {
  home: "/dashboard",
  plan: "/dashboard?section=Checklist",
  my_colleges: "/dashboard?section=Universities",
  profile: "/dashboard/profile",
  report: "/dashboard/report",
  chances: "/dashboard/admissions",
  essays: "/dashboard?section=Writing",
  scholarships: "/dashboard/library/scholarships",
  universities: "/dashboard/universities",
  rankings: "/dashboard/rankings",
  articles: "/dashboard/library/articles",
  settings: "/dashboard/settings",
} as const;
export type AppPage = keyof typeof APP_PAGES;

export type ScamFlag =
  | "guarantee"
  | "paid_scholarship"
  | "no_test"
  | "upfront_fee"
  | "pressure"
  | "personal_payment"
  | "fake_ranking"
  | "visa_guarantee";

/** One line of the NDJSON stream from /api/assistant. */
export type AssistantEvent =
  | { t: "text"; d: string }
  | { t: "step"; id: string; tool: AssistantToolName; args: Record<string, string> }
  | { t: "step_done"; id: string; ok: boolean; n?: number }
  | { t: "card"; card: AssistantCard }
  | { t: "done" }
  | { t: "error"; code: AssistantError };

export type AssistantError = "signin" | "quota" | "busy" | "timeout" | "failed" | "offline" | "invalid";

export const universityHref = (slug: string) => "/dashboard/university/" + slug;
export const scholarshipHref = (slug: string) => "/dashboard/library/scholarship/" + slug;
