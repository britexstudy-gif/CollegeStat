import {
  normalizeUniversity,
  type ResearchMetric,
  type University,
} from "@/lib/domain";
import { abortable } from "@/lib/abortable";
import { publicDatabase } from "./hosted-catalogue";
import { publicConfig } from "./public-config";
import { publicReadCache } from "./public-read-cache";

/** One reviewed source selection, not the entire provider edition or an overall rank. */
export const LEIDEN_RANKING_CONTEXT = {
  year: 2025,
  edition: "Leiden Open Edition 2025",
  period: "2020–2023",
  field: "All sciences",
  metric: "publications_fractional_core",
  countingMethod: "fractional",
  corePublicationsOnly: true,
  citationWindowEnd: 2024,
  minimumPublications: 100,
  license: "CC0-1.0",
  sourceId: "882258c4-e511-5035-966e-fd8c93110366",
  datasetSHA256:
    "f1178ec261f14a043ea7c0d7ddd463acb298a1923b6bec9fda6876b2e586e46d",
  crosswalkSHA256:
    "35d96fe44a0f1724f0071fd11c47185063654b444cc837775c65643119ea2e74",
} as const;

type PublicLeidenMetric = ResearchMetric & { license_note?: string };

export function isReviewedLeidenCore(
  record: ResearchMetric,
  universityId: string,
): boolean {
  const context = LEIDEN_RANKING_CONTEXT;
  const evidence = record.evidence;
  if (
    record.university_id !== universityId ||
    record.verification_status !== "verified" ||
    record.metric !== context.metric ||
    record.edition !== context.edition ||
    record.period !== context.period ||
    record.field !== context.field ||
    record.unit !== "publications" ||
    !Number.isFinite(record.value) ||
    record.value < 0 ||
    !Number.isFinite(Date.parse(record.retrieved_at)) ||
    evidence?.publication_year !== context.year ||
    evidence.reporting_period !== context.period ||
    evidence.counting_method !== context.countingMethod ||
    evidence.core_publications_only !== context.corePublicationsOnly ||
    evidence.citation_window_end !== context.citationWindowEnd ||
    evidence.minimum_publications_filter !== context.minimumPublications ||
    evidence.license_note !== context.license ||
    evidence.dataset_sha256 !== context.datasetSHA256 ||
    evidence.crosswalk_sha256 !== context.crosswalkSHA256 ||
    typeof evidence.source_record_id !== "string" ||
    !/^\d+$/.test(evidence.source_record_id)
  )
    return false;
  return (
    record.source_url ===
    `https://open.leidenranking.com/ranking/${context.year}/university/${evidence.source_record_id}`
  );
}

/** Reject conflicting snapshots rather than selecting an arbitrary first value. */
export function reviewedLeidenCore(
  university: University,
): ResearchMetric | undefined {
  if (!university.published) return undefined;
  const records = (university.research_metrics || []).filter((record) =>
    isReviewedLeidenCore(record, university.id),
  );
  if (
    records.some(
      (record) =>
        record.value !== records[0]?.value ||
        record.source_url !== records[0]?.source_url,
    )
  )
    throw new Error("Conflicting reviewed Leiden publication values.");
  return records[0];
}

export const LEIDEN_READ_TIMEOUT_MS = 12000;
const MAX_LEIDEN_ROWS = 5000;
const MAX_LEIDEN_REQUESTS = 24;
const MAX_LEIDEN_BYTES = 12 * 1024 * 1024;
const projection =
  "id,university_id,metric,value,unit,field,period,edition,source_id,source_url,retrieved_at,last_verified_at,verification_status,license_note,evidence,universities!inner(id,name,slug,short_name,country_code,website,logo_url,published,aliases)";
const cache = publicReadCache<University[]>(
  1,
  60000,
  Date.now,
  LEIDEN_READ_TIMEOUT_MS + 1000,
);

export async function hostedLeidenProfiles(
  callerSignal?: AbortSignal,
): Promise<University[]> {
  callerSignal?.throwIfAborted();
  const request = cache(publicConfig().url, loadHostedLeidenProfiles);
  return callerSignal ? abortable(request, callerSignal) : request;
}

/** Complete anonymous normalized evidence only; no profile JSON or reviewed-file overlay. */
export async function loadHostedLeidenProfiles(
  options: { database?: typeof publicDatabase; timeoutMs?: number } = {},
): Promise<University[]> {
  const deadline = AbortSignal.timeout(
    Math.min(
      LEIDEN_READ_TIMEOUT_MS,
      Math.max(1, Math.floor(options.timeoutMs || LEIDEN_READ_TIMEOUT_MS)),
    ),
  );
  const cancellation = new AbortController();
  const signal = AbortSignal.any([deadline, cancellation.signal]);
  const db = (options.database || publicDatabase)();
  const rows = new Map<string, University>();
  let offset = 0;
  let width = 1000;
  let requests = 0;
  let bytes = 0;
  let expectedCount: number | undefined;
  let previousKey = "";
  try {
    const readPage = async (pageOffset: number) => {
      const context = LEIDEN_RANKING_CONTEXT;
      const query = db
        .from("research_metrics")
        .select(projection, { count: "exact" })
        .eq("verification_status", "verified")
        .eq("metric", context.metric)
        .eq("edition", context.edition)
        .eq("period", context.period)
        .eq("field", context.field)
        .eq("unit", "publications")
        .eq("source_id", context.sourceId)
        .eq("license_note", context.license)
        .eq("evidence->>license_note", context.license)
        .eq("evidence->>counting_method", context.countingMethod)
        .eq("evidence->>core_publications_only", "true")
        .eq("universities.published", true)
        .order("university_id")
        .order("id")
        .range(pageOffset, Math.min(pageOffset + width - 1, MAX_LEIDEN_ROWS))
        .abortSignal(signal);
      return abortable(Promise.resolve(query), signal);
    };
    while (offset <= MAX_LEIDEN_ROWS) {
      signal.throwIfAborted();
      // Learn the server row cap first, then read at most three independent pages.
      // Validate every page and its exact count before publishing a complete result.
      const pageCount =
        expectedCount === undefined
          ? 1
          : Math.min(3, Math.ceil((expectedCount - offset) / width));
      if (requests + pageCount > MAX_LEIDEN_REQUESTS)
        throw new Error(
          "Leiden evidence exceeds the bounded read; no partial catalogue was returned.",
        );
      requests += pageCount;
      const pages = await Promise.all(
        Array.from({ length: pageCount }, (_, index) =>
          readPage(offset + index * width),
        ),
      );
      for (const page of pages) {
        const context = LEIDEN_RANKING_CONTEXT;
        const { data, error, count } = page;
        if (
          error ||
          !Array.isArray(data) ||
          !Number.isSafeInteger(count) ||
          count === null ||
          count < 0
        )
          throw new Error("Leiden evidence could not be loaded completely.");
        if (
          count > MAX_LEIDEN_ROWS ||
          (expectedCount !== undefined && expectedCount !== count)
        )
          throw new Error(
            "Leiden evidence exceeds or changed during the bounded read; no partial catalogue was returned.",
          );
        expectedCount = count;
        bytes += new TextEncoder().encode(JSON.stringify(data)).byteLength;
        if (bytes > MAX_LEIDEN_BYTES)
          throw new Error(
            "Leiden evidence exceeds the response budget; no partial catalogue was returned.",
          );
        if (!data.length) {
          if (offset !== expectedCount)
            throw new Error("Leiden evidence could not be loaded completely.");
          return [...rows.values()];
        }
        for (const source of data as unknown as (PublicLeidenMetric & {
          universities: Partial<University>;
        })[]) {
          const { universities: university, ...metric } = source;
          const key = `${metric.university_id}:${metric.id}`;
          if (
            !university ||
            university.published !== true ||
            !university.id ||
            !university.name ||
            !university.slug ||
            university.id !== metric.university_id ||
            !isReviewedLeidenCore(metric, university.id) ||
            metric.source_id !== context.sourceId ||
            metric.license_note !== context.license ||
            key <= previousKey
          )
            throw new Error(
              "Leiden evidence failed its source or identity checks.",
            );
          previousKey = key;
          const previous = rows.get(university.id);
          if (previous)
            throw new Error("Conflicting reviewed Leiden publication values.");
          rows.set(
            university.id,
            normalizeUniversity({ ...university, research_metrics: [metric] }),
          );
        }
        offset += data.length;
        if (offset === expectedCount) return [...rows.values()];
        // A reduced first page establishes the server cap. Later short pages would
        // leave gaps in a parallel batch, so fail closed rather than skipping facts.
        if (data.length < width) {
          if (requests !== 1)
            throw new Error("Leiden evidence could not be loaded completely.");
          width = data.length;
        }
      }
    }
    throw new Error(
      "Leiden evidence exceeds the bounded read; no partial catalogue was returned.",
    );
  } finally {
    cancellation.abort();
  }
}
