export const writingFormats = [
  "statement",
  "motivation",
  "recommendation",
  "common_app",
  "ucas",
  "why_us",
  "activities",
  "short_answer",
  "community",
  "sop",
  "research",
  "scholarship",
] as const;
/** Saved online before the essay-types migration; newer types fall back to
 * this device until the database accepts them. */
export const legacyWritingFormats: readonly string[] = ["statement", "motivation", "recommendation"];
export type WritingFormat = (typeof writingFormats)[number];
export type WritingVersion = {
  id: string;
  user_id: string;
  format: WritingFormat;
  body: string;
  created_at: string;
};
export const writingVersionPageSize = 20;
export const writingDraftLimit = 20000;
export const isUUID = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isWritingFormat = (value: unknown): value is WritingFormat =>
  typeof value === "string" && writingFormats.includes(value as WritingFormat);
export function isWritingVersion(value: unknown): value is WritingVersion {
  if (!value || typeof value !== "object") return false;
  const row = value as WritingVersion;
  return (
    isUUID(row.id) &&
    isUUID(row.user_id) &&
    isWritingFormat(row.format) &&
    typeof row.body === "string" &&
    !!row.body.trim() &&
    row.body.length <= writingDraftLimit &&
    typeof row.created_at === "string" &&
    Number.isFinite(Date.parse(row.created_at))
  );
}
