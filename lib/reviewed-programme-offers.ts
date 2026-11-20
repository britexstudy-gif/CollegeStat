import reviewed from "@/data/published/reviewed-programmes-oct10.json";
import type { ProgramOffer } from "./domain";

/** The bounded publication receipt is shared by hosted and bundled profile views. */
export function withReviewedProgrammeOffers(
  universityID: string | undefined,
  existing: ProgramOffer[],
): ProgramOffer[] {
  if (!universityID) return existing;
  const records = reviewed.records as unknown as ProgramOffer[];
  const additions = records.filter((row) =>
    row.university_id === universityID &&
    row.verification_status === "verified" && row.source_id && row.verified_at &&
    !existing.some((before) => before.id === row.id ||
      (before.programs.id === row.programs.id && before.source_url === row.source_url)),
  );
  return [...existing, ...additions.map((row) => ({ ...row, year: null }))];
}
