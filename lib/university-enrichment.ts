import { z } from "zod";
import reviewed from "@/data/published/reviewed-university-enrichment-oct15.json";
import type { University } from "./domain";

const https = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" && !url.username && !url.password && !url.port
    );
  }, "A public HTTPS source is required");
const verified = z.literal("verified");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const evidence = { verification_status: verified, checked_at: date };
const source = { ...evidence, source_url: https };
const resource = z.object({
  ...evidence,
  kind: z.enum([
    "programmes",
    "admissions",
    "costs",
    "visit",
    "history",
    "student_stories",
    "videos",
  ]),
  label: z.string().min(1),
  url: https,
  scope: z.string().optional(),
});
const programme = z.object({
  ...source,
  name: z.string().min(1),
  level: z.string().min(1),
  url: https,
  scope: z.string().min(1),
  duration: z.string().optional(),
});
const fact = z.object({
  ...source,
  title: z.string().min(1),
  body: z.string().min(1),
  scope: z.string().min(1),
  reporting_period: z.string().nullable().optional(),
});
const person = z.object({
  ...source,
  name: z.string().min(1),
  relationship: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
});
const story = z.object({
  ...source,
  title: z.string().min(1),
  url: https,
  summary: z.string().min(1),
  author_byline: z.string().optional(),
  published_at: date.optional(),
  scope: z.string().optional(),
});
const video = z.object({
  ...source,
  youtube_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: z.string().min(1),
  scope: z.string().min(1),
});
const gallery = z.object({
  ...source,
  url: z
    .string()
    .refine(
      (url) => /^\/images\/[\w/.-]+$/.test(url) || https.safeParse(url).success,
    ),
  alt: z.string().min(1),
  creator: z.string().min(1),
  license: z.string().min(1),
  license_url: https,
  reuse_permitted: z.literal(true),
});
const identity = z.object({
  ...source,
  founded_year: z.number().int().min(800).max(2026),
  founded_year_scope: z.string().min(1).optional(),
});
const record = z.object({
  university_id: z.string().uuid(),
  university_name: z.string().min(1),
  official_domain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/),
  country_code: z.string().length(2),
  checked_at: date,
  identity: identity.optional(),
  resources: z.array(resource),
  programmes: z.array(programme),
  admissions: z.array(fact).default([]),
  costs: z.array(fact).default([]),
  people: z.array(person),
  student_stories: z.array(story),
  videos: z.array(video),
  gallery: z.array(gallery),
});
export type UniversityEnrichment = z.infer<typeof record>;
export type UniversityEnrichmentSection =
  "programmes" | "admissions" | "costs" | "people" | "campus" | "resources";

function hostname(url: string | null | undefined) {
  try {
    return new URL(url || "").hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
export function isUniversitySource(url: string, domain: string) {
  if (!https.safeParse(url).success) return false;
  const host = hostname(url);
  return (
    host === domain ||
    host.endsWith("." + domain) ||
    (domain === "mit.edu" && host === "mitadmissions.org") ||
    // Durham's historical dur.ac.uk identity now uses durham.ac.uk. This is a
    // narrowly reviewed institution alias, not permission for arbitrary redirects.
    (domain === "dur.ac.uk" &&
      (host === "durham.ac.uk" || host.endsWith(".durham.ac.uk")))
  );
}

/** External agent output is a candidate until every field has been reviewed.
 * Invalid records are rejected in full; neither a source host nor a name fuzzy
 * match may attach facts to a different institution. The import CLI also checks
 * the exact ID against the complete catalogue before publication.
 */
export function parseUniversityEnrichmentBatch(input: unknown) {
  const envelope = z
    .object({ schema_version: z.literal(1), records: z.array(z.unknown()) })
    .safeParse(input);
  const records: UniversityEnrichment[] = [];
  const issues: string[] = [];
  if (!envelope.success)
    return {
      records,
      issues: ["Expected schema_version 1 and a records array"],
    };
  const ids = new Set<string>();
  for (const [index, value] of envelope.data.records.entries()) {
    const result = record.safeParse(value);
    if (!result.success) {
      issues.push(
        `Record ${index + 1}: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
      );
      continue;
    }
    const row = result.data;
    const official = (url: string) =>
      isUniversitySource(url, row.official_domain);
    const officialUrls = [
      ...(row.identity ? [row.identity.source_url] : []),
      ...row.resources.map((item) => item.url),
      ...row.programmes.flatMap((item) => [item.url, item.source_url]),
      ...[...row.admissions, ...row.costs, ...row.people, ...row.videos].map(
        (item) => item.source_url,
      ),
      ...row.student_stories.flatMap((item) => [item.url, item.source_url]),
    ];
    if (officialUrls.some((url) => !official(url))) {
      issues.push(
        `Record ${index + 1}: source outside the institution's official domain`,
      );
      continue;
    }
    if (ids.has(row.university_id)) {
      issues.push(`Record ${index + 1}: duplicate university ID`);
      continue;
    }
    ids.add(row.university_id);
    records.push(row);
  }
  return { records, issues };
}

const publication = parseUniversityEnrichmentBatch(reviewed);
export const reviewedUniversityEnrichment = publication.records;
export const universityEnrichmentIssues = publication.issues;
const byId = new Map(
  reviewedUniversityEnrichment.map((row) => [row.university_id, row]),
);

export function universityEnrichment(
  university: Pick<University, "id" | "website">,
) {
  const row = byId.get(university.id);
  if (!row) return undefined;
  const host = hostname(university.website);
  // IDs are authoritative. The source domain is a second, independent guard.
  return host === row.official_domain ||
    host.endsWith("." + row.official_domain)
    ? row
    : undefined;
}

export function youtubeEmbedUrl(id: string) {
  return /^[A-Za-z0-9_-]{11}$/.test(id)
    ? `https://www.youtube-nocookie.com/embed/${id}?rel=0`
    : undefined;
}
