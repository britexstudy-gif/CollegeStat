import { z } from "zod";
import { isUUID } from "./student-writing";
import { validPlanDate } from "./workspace-planner";
import { countries } from "./domain";

export const curricula = [
  "unknown",
  "national",
  "IB",
  "A-level",
  "other",
] as const;
export const educationLevels = [
  "unknown",
  "secondary",
  "foundation",
  "bachelor",
  "master",
  "doctorate",
  "other",
] as const;
export const qualificationStatuses = [
  "unknown",
  "studying",
  "completed",
] as const;
export const testKinds = [
  "IELTS Academic",
  "IELTS General",
  "TOEFL iBT",
  "Duolingo",
  "SAT",
  "ACT",
  "other",
] as const;
export const testStatuses = ["planned", "registered", "taken"] as const;
const nullableText = (limit: number) =>
  z.string().trim().min(1).max(limit).nullable();
const country = z
  .string()
  .refine((value) => !!countries[value], "Choose a listed country")
  .nullable();
export const educationInput = z
  .object({
    id: z.string().uuid(),
    qualification: z.string().trim().min(1).max(120),
    country_code: country,
    curriculum: z.enum(curricula),
    level: z.enum(educationLevels),
    status: z.enum(qualificationStatuses),
    graduation_year: z.number().int().min(1900).max(2100).nullable(),
    grade_label: nullableText(80),
    grade_scale: nullableText(120),
  })
  .strict()
  .refine((row) => (row.grade_label === null) === (row.grade_scale === null), {
    message:
      "Include the grading scale with your grade; leave both blank if unknown.",
  });
export const testInput = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(testKinds),
    label: z.string().trim().min(1).max(120),
    status: z.enum(testStatuses),
    taken_on: z
      .string()
      .refine(validPlanDate, "Use a real calendar date")
      .nullable(),
    score_label: nullableText(80),
    scale_label: nullableText(120),
  })
  .strict()
  .refine((row) => (row.score_label === null) === (row.scale_label === null), {
    message:
      "Include the score scale with your result; leave both blank if unknown.",
  })
  .refine(
    (row) =>
      row.status === "taken" ||
      (row.taken_on === null &&
        row.score_label === null &&
        row.scale_label === null),
    { message: "Only a taken test can have a result or a date taken." },
  );
export type EducationInput = z.infer<typeof educationInput>;
export type TestInput = z.infer<typeof testInput>;
export type EducationRecord = EducationInput & {
  user_id: string;
  created_at: string;
};
export type TestRecord = TestInput & { user_id: string; created_at: string };
export type Qualifications = {
  education: EducationRecord[];
  tests: TestRecord[];
};
export function qualificationRecord(
  kind: "education" | "tests",
  value: unknown,
  owner: string,
): value is EducationRecord | TestRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { user_id, created_at, ...input } = value as Record<string, unknown>;
  return (
    isUUID(user_id) &&
    user_id === owner &&
    typeof created_at === "string" &&
    Number.isFinite(Date.parse(created_at)) &&
    (kind === "education" ? educationInput : testInput).safeParse(input).success
  );
}
/** Text is preserved exactly as the student reports it. No score conversions,
 * admissions verdicts, test validity/expiry or equivalent qualifications inferred.
 */
export const qualificationNotice =
  "Private, self-reported records. They are not verified university requirements or an admission decision. Keep test variants, score scales and dates exactly as they appear on your records.";
