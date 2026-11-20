import { z } from "zod";
import { LANG_CODES } from "@/lib/i18n/languages";
import {
  ACTIVITY_TYPES,
  APP_HOURS,
  CAREERS,
  CERT_TESTS,
  CITY_SIZES,
  CLASS_RANKS,
  CLIMATES,
  CORE_TESTS,
  DEPTH_AREAS,
  DEPTH_HOURS,
  DEPTH_YEARS,
  DISTANCES,
  EXAM_STATUS,
  FUNDING,
  HELPERS,
  HONOUR_LEVELS,
  IMPORTANCE,
  INTAKE_TERMS,
  MEDALS,
  RESEARCH_LEVELS,
  SCHOOL_SUBJECTS,
  SETTINGS,
  STUDY_LANGS,
  TEST_STATUS,
  WORK_AFTER,
  YES_MAYBE_NO,
} from "@/components/college/onboarding-steps";
import { INTEREST_QUESTIONS } from "@/lib/programmes";
import { GRADE_SCALES, type GradeScale } from "@/lib/grades/convert";
import type { StudentSnapshot } from "@/lib/student-profile";

/** "Personalise with AI": the profile the browser sends (never a name or
 * email), the reply the model must return and the copy saved to the profile
 * (preferences.ai_personalize). Server code: server/personalize-handler.ts. */

const country = z.string().regex(/^[A-Z]{2}$/);
const depthEntry = z.object({ years: z.enum(DEPTH_YEARS), hours: z.enum(DEPTH_HOURS).optional() }).strict();
/** The deeper onboarding answers (lib/student-profile.ts StudentContext); all optional, no free text. */
const context = z
  .object({
    class_rank: z.enum(CLASS_RANKS),
    strong_subjects: z.array(z.enum(SCHOOL_SUBJECTS)).max(3),
    research: z.enum(RESEARCH_LEVELS),
    exam_status: z.enum(EXAM_STATUS),
    tests_declined: z.array(z.enum(CORE_TESTS)).max(CORE_TESTS.length),
    activity_depth: z.object(Object.fromEntries(DEPTH_AREAS.map((a) => [a, depthEntry.optional()])) as Record<(typeof DEPTH_AREAS)[number], z.ZodOptional<typeof depthEntry>>).strict(),
    interests: z
      .object({ enjoy: z.enum(INTEREST_QUESTIONS.enjoy), subject: z.enum(INTEREST_QUESTIONS.subject), day: z.enum(INTEREST_QUESTIONS.day) })
      .partial()
      .strict(),
    career: z.enum(CAREERS),
    work_after: z.enum(WORK_AFTER),
    return_home: z.enum(YES_MAYBE_NO),
    study_langs: z.array(z.enum(STUDY_LANGS)).max(STUDY_LANGS.length),
    foundation: z.enum(YES_MAYBE_NO),
    city_size: z.enum(CITY_SIZES),
    climate: z.enum(CLIMATES),
    setting: z.enum(SETTINGS),
    safety: z.enum(IMPORTANCE),
    distance: z.enum(DISTANCES),
    halal: z.enum(IMPORTANCE),
    rank_vs_cost: z.number().int().min(0).max(100),
    loan: z.enum(YES_MAYBE_NO),
    intake_term: z.enum(INTAKE_TERMS),
    app_hours: z.enum(APP_HOURS),
    helpers: z.array(z.enum(HELPERS)).max(HELPERS.length),
  })
  .partial()
  .strict();

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((x) => x.id) as [T[number]["id"], ...T[number]["id"][]];

export const personalizeInput = z
  .object({
    profile: z
      .object({
        home: country.optional(),
        dreams: z.array(country).max(5),
        majors: z.array(z.string().max(60)).max(3),
        budget: z.number().int().min(0).max(200000).optional(),
        funding: z.enum(FUNDING).optional(),
        start_year: z.number().int().min(2024).max(2035).optional(),
        school_class: z.string().max(8).optional(),
        grade: z
          .object({
            scale: z.enum(Object.keys(GRADE_SCALES) as [GradeScale, ...GradeScale[]]),
            value: z.string().max(20),
            pct: z.number().min(0).max(100),
            gpa: z.number().min(0).max(4),
          })
          .optional(),
        exam: z.object({ id: z.string().max(8), score: z.string().max(8), pct: z.number().nullable() }).optional(),
        tests: z
          .array(z.object({ id: z.enum(ids(CERT_TESTS)), status: z.enum(TEST_STATUS), score: z.string().max(16), date: z.string().max(7) }))
          .max(CERT_TESTS.length),
        activities: z
          .array(
            z.object({
              type: z.enum(ACTIVITY_TYPES),
              role: z.string().max(50),
              org: z.string().max(100).default(""),
              hours: z.string().max(3),
              weeks: z.string().max(3),
              grades: z.array(z.string().max(4)).max(5).default([]),
              description: z.string().max(150),
            }),
          )
          .max(10),
        honours: z
          .array(z.object({ title: z.string().max(100), level: z.enum(HONOUR_LEVELS), grade: z.string().max(4).default(""), medal: z.enum(MEDALS).optional() }))
          .max(5),
        context: context.optional(),
      })
      .strict(),
    language: z.enum(LANG_CODES).default("en"),
  })
  .strict();
export type PersonalizeInput = z.infer<typeof personalizeInput>;

/** Only what the model needs: no organisation names. */
export function personalizeRequest(s: StudentSnapshot, language: string) {
  return {
    language,
    profile: {
      ...s,
      activities: s.activities.map((a) => ({ ...a, org: "" })),
    },
  };
}

export const TIERS = ["reach", "target", "safety"] as const;
export type AITier = (typeof TIERS)[number];

export const personalizeResult = z
  .object({
    summary: z.string().min(1).max(500),
    country_mix: z.array(z.object({ country, share: z.number().int().min(0).max(100), reason: z.string().max(200) }).strict()).max(5),
    universities: z.array(z.object({ slug: z.string().max(160), tier: z.enum(TIERS), reason: z.string().max(200) }).strict()).max(9),
    gaps: z.array(z.string().min(1).max(200)).max(5),
    actions: z
      .array(z.object({ title: z.string().min(1).max(100), detail: z.string().max(240), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict())
      .max(5),
  })
  .strict();
export type PersonalizeResult = z.infer<typeof personalizeResult>;

export const personalizeJSONSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    country_mix: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { country: { type: "string" }, share: { type: "integer" }, reason: { type: "string" } },
        required: ["country", "share", "reason"],
      },
    },
    universities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { slug: { type: "string" }, tier: { type: "string", enum: [...TIERS] }, reason: { type: "string" } },
        required: ["slug", "tier", "reason"],
      },
    },
    gaps: { type: "array", items: { type: "string" } },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, detail: { type: "string" }, due: { type: "string" } },
        required: ["title", "detail", "due"],
      },
    },
  },
  required: ["summary", "country_mix", "universities", "gaps", "actions"],
} as const;

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown) => (Array.isArray(v) ? v : []);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Trims a JSON-mode reply (DeepSeek has no strict schema) to the limits before strict validation. */
export function fitPersonalizeResult(raw: unknown): unknown {
  const r = obj(raw);
  return {
    summary: clip(r.summary, 500),
    country_mix: list(r.country_mix)
      .map(obj)
      .map((x) => ({
        country: clip(x.country, 2).toUpperCase(),
        share: Math.max(0, Math.min(100, Math.round(Number(x.share) || 0))),
        reason: clip(x.reason, 200),
      }))
      .filter((x) => /^[A-Z]{2}$/.test(x.country))
      .slice(0, 5),
    universities: list(r.universities)
      .map(obj)
      .map((x) => ({ slug: clip(x.slug, 160), tier: TIERS.includes(x.tier as AITier) ? x.tier : "target", reason: clip(x.reason, 200) }))
      .filter((x) => x.slug)
      .slice(0, 9),
    gaps: list(r.gaps)
      .map((x) => clip(x, 200))
      .filter(Boolean)
      .slice(0, 5),
    actions: list(r.actions)
      .map(obj)
      .map((x) => ({ title: clip(x.title, 100), detail: clip(x.detail, 240), due: clip(x.due, 10) }))
      .filter((x) => x.title && /^\d{4}-\d{2}-\d{2}$/.test(x.due))
      .slice(0, 5),
  };
}

export type PersonalizedUniversity = { slug: string; name: string; country_code: string; tier: AITier; reason: string };

/** What the server returns and the profile keeps. */
export type SavedPersonalization = {
  version: 1;
  created_at: string;
  language: string;
  summary: string;
  country_mix: PersonalizeResult["country_mix"];
  universities: PersonalizedUniversity[];
  gaps: string[];
  actions: PersonalizeResult["actions"];
};

export function readPersonalization(prefs: unknown): SavedPersonalization | null {
  const v = obj(prefs).ai_personalize as Partial<SavedPersonalization> | undefined;
  return v && v.version === 1 && typeof v.summary === "string" && Array.isArray(v.universities) && Array.isArray(v.actions) && Array.isArray(v.gaps) && Array.isArray(v.country_mix)
    ? (v as SavedPersonalization)
    : null;
}
