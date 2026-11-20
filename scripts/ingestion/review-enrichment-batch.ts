/** Validate an explicitly reviewed agent batch. Never writes to the live DB.
 * node --import tsx scripts/ingestion/review-enrichment-batch.ts candidate.json
 * Add --output data/review/.../validated.json to save a review artifact.
 */
import { readFileSync, writeFileSync } from "node:fs";
import catalogue from "../../data/published/global-directory.json";
import { parseUniversityEnrichmentBatch } from "../../lib/university-enrichment";

const args = process.argv.slice(2);
const input = args[0];
if (!input || input.startsWith("--"))
  throw new Error(
    "Provide an explicitly reviewed schema_version 1 batch JSON file",
  );
const outputAt = args.indexOf("--output");
if (outputAt >= 0 && !args[outputAt + 1])
  throw new Error("--output requires a review-artifact path");
const parsed = parseUniversityEnrichmentBatch(
  JSON.parse(readFileSync(input, "utf8")),
);
const identities = new Map(catalogue.map((row) => [row.id, row]));
const issues = [...parsed.issues];
for (const row of parsed.records) {
  const identity = identities.get(row.university_id);
  if (!identity) {
    issues.push(`${row.university_id}: no exact catalogue identity`);
    continue;
  }
  if (
    identity.name !== row.university_name ||
    identity.country_code !== row.country_code
  )
    issues.push(
      `${row.university_id}: name or country differs from the catalogue identity`,
    );
  const domains = identity.domains || [];
  const websiteHost = new URL(
    identity.website || "https://invalid.invalid",
  ).hostname.replace(/^www\./, "");
  if (
    !domains.includes(row.official_domain) &&
    websiteHost !== row.official_domain &&
    !websiteHost.endsWith("." + row.official_domain)
  )
    issues.push(
      `${row.university_id}: official domain is not supported by the catalogue identity`,
    );
}
if (issues.length) {
  console.error(
    JSON.stringify(
      { valid: false, accepted_records: parsed.records.length, issues },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} else {
  const result = { schema_version: 1, records: parsed.records };
  if (outputAt >= 0)
    writeFileSync(args[outputAt + 1], JSON.stringify(result, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        valid: true,
        institutions: parsed.records.length,
        fields: Object.fromEntries(
          [
            "resources",
            "programmes",
            "admissions",
            "costs",
            "people",
            "student_stories",
            "videos",
            "gallery",
          ].map((key) => [
            key,
            parsed.records.reduce(
              (sum, row) =>
                sum + (row[key as keyof typeof row] as unknown[]).length,
              0,
            ),
          ]),
        ),
        output: outputAt >= 0 ? args[outputAt + 1] : null,
      },
      null,
      2,
    ),
  );
}
