import { z } from "zod";

const supportKinds = [
  "question",
  "issue",
  "correction",
  "feedback",
] as const;
export const supportStatuses = ["new", "in_progress", "resolved"] as const;
const pagePath = z
  .string()
  .max(500)
  .refine(
    (value) =>
      value === "" || (/^\/(?!\/)/.test(value) && !/[?#\r\n]/.test(value)),
    "Use a page path without private query parameters.",
  );
export const supportInput = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(supportKinds),
    name: z.string().trim().max(100),
    email: z.string().trim().max(254).email().or(z.literal("")),
    subject: z.string().trim().min(5).max(160),
    message: z.string().trim().min(20).max(5000),
    page_path: pagePath,
    consent: z.literal(true),
    website: z.literal(""),
  })
  .strict();
export type SupportInput = z.infer<typeof supportInput>;
export const supportReceipt = z
  .object({
    id: z.string().uuid(),
    status: z.enum(supportStatuses),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();
export const supportRecord = supportReceipt.extend({
  user_id: z.string().uuid().nullable(),
  kind: z.enum(supportKinds),
  name: z.string(),
  email: z.string(),
  subject: z.string(),
  message: z.string(),
  page_path: pagePath,
  admin_note: z.string(),
  updated_at: z.string(),
});
export type SupportRecord = z.infer<typeof supportRecord>;
export const supportReview = z
  .object({
    id: z.string().uuid(),
    status: z.enum(supportStatuses),
    admin_note: z.string().trim().max(3000),
    expected_updated_at: z.string().datetime({ offset: true }),
  })
  .strict();
export function reportedPath(value: string) {
  try {
    return new URL(value, "https://collegestat.invalid").pathname.slice(0, 500);
  } catch {
    return "";
  }
}
