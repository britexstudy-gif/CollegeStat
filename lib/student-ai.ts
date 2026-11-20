import { z } from "zod";
import { LANG_CODES } from "@/lib/i18n/languages";

const studentAIModes = [
  "application_review",
  "essay_feedback",
  "interview_practice",
  "certificate_practice",
  "shortlist_advice",
  "scholarship_strategy",
] as const;
const certificateIDs = [
  "ielts",
  "toefl",
  "duolingo",
  "sat",
  "act",
  "ib",
  "a-level",
  "ap",
  "national",
] as const;
export const studentAIInput = z
  .object({
    mode: z.enum(studentAIModes),
    text: z.string().trim().min(10).max(8000),
    country: z.string().trim().max(80).default(""),
    program: z.string().trim().max(160).default(""),
    university_id: z.string().uuid().nullable().default(null),
    certificate: z.enum(certificateIDs).nullable().default(null),
    consent: z.literal(true),
    /** Interface language; the AI answers in it. */
    language: z.enum(LANG_CODES).default("en"),
  })
  .strict();
export type StudentAIInput = z.infer<typeof studentAIInput>;
export const studentAIResult = z
  .object({
    summary: z.string().min(1).max(1600),
    strengths: z.array(z.string().min(1).max(400)).max(5),
    next_steps: z
      .array(
        z
          .object({
            title: z.string().min(1).max(100),
            detail: z.string().min(1).max(600),
          })
          .strict(),
      )
      .max(6),
    practice_questions: z.array(z.string().min(1).max(500)).max(5),
    evidence_ids: z.array(z.string().max(150)).max(20),
    limitations: z.array(z.string().min(1).max(400)).min(1).max(5),
  })
  .strict();
export type StudentAIResult = z.infer<typeof studentAIResult>;
export const studentAIReply = z
  .object({
    mode: z.enum(studentAIModes),
    result: studentAIResult,
    evidence: z
      .array(
        z
          .object({
            id: z.string().max(150),
            title: z.string().max(500),
            detail: z.string().max(800),
            url: z
              .string()
              .url()
              .refine((value) => new URL(value).protocol === "https:"),
            reporting_year: z.number().int().min(1900).max(2100).nullable(),
            population: z.string().max(1600).nullable(),
          })
          .strict(),
      )
      .max(40),
    provider: z.literal("OpenRouter"),
    private_records_attached: z.literal(false),
  })
  .strict();
export type StudentAIReply = z.infer<typeof studentAIReply>;
export const studentAIJSONSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    next_steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, detail: { type: "string" } },
        required: ["title", "detail"],
      },
    },
    practice_questions: { type: "array", items: { type: "string" } },
    evidence_ids: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } },
  },
  required: [
    "summary",
    "strengths",
    "next_steps",
    "practice_questions",
    "evidence_ids",
    "limitations",
  ],
} as const;

const clip = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const list = (value: unknown) => (Array.isArray(value) ? value : []);
/** Trims a provider reply to the published limits before strict validation.
 * Providers without strict JSON schemas (DeepSeek) can return one item too
 * many or an extra key; the content rules are still checked afterwards. */
export function fitStudentAIResult(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const r = raw as Record<string, unknown>;
  const strings = (value: unknown, count: number, max: number) =>
    list(value)
      .map((item) => clip(item, max))
      .filter(Boolean)
      .slice(0, count);
  return {
    summary: clip(r.summary, 1600),
    strengths: strings(r.strengths, 5, 400),
    next_steps: list(r.next_steps)
      .map((step) => {
        const s = (step && typeof step === "object" ? step : {}) as Record<string, unknown>;
        return { title: clip(s.title, 100), detail: clip(s.detail, 600) };
      })
      .filter((step) => step.title && step.detail)
      .slice(0, 6),
    practice_questions: strings(r.practice_questions, 5, 500),
    evidence_ids: strings(r.evidence_ids, 20, 150),
    limitations: strings(r.limitations, 5, 400),
  };
}
