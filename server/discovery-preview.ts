import type { University } from "@/lib/domain";
import { metricDefinitions } from "@/lib/research";
import { withAutoLogo } from "./auto-logos";

// Discovery uses these figures in cards, customizable tables and Quick view.
// Other observations remain in the full profile; they are not needed in every
// result-page hydration payload. Keep the complete evidence for each retained
// historical observation rather than stripping source details from a fact.
const discoveryPointMetrics = new Set<string>(metricDefinitions.map((metric) => metric.key));

const cardMetrics = new Set([
  "acceptance_rate",
  "enrollment_12_month",
  "tuition_in_state",
  "tuition_out_of_state",
  "fees_out_of_state",
]);

/** Keep sourced card facts without loading the local programme/research library. */
export function discoveryPreview(u: University): University {
  return {
    ...u,
    data_points: u.data_points.filter((point) =>
      discoveryPointMetrics.has(point.metric),
    ),
    profile_resources: undefined,
    reported_programs: [],
    university_programs: [],
    departments: [],
    professors: [],
    research: [],
    research_metrics: [],
    requirements: [],
    application_brief: undefined,
    research_identity: undefined,
    imported_records: u.imported_records?.filter((r) =>
      cardMetrics.has(r.metric),
    ),
  };
}

type Row = Record<string, unknown>;
const without = <T extends object>(row: T, keys: readonly string[]): T => {
  const copy = { ...row } as Row;
  for (const key of keys) delete copy[key];
  return copy as T;
};
// Database bookkeeping no card, table cell or source drawer reads.
const SOURCED_NOISE = ["created_at", "updated_at", "university_id"] as const;
const SOURCE_NOISE = ["created_at", "published_at", "trust_level"] as const;
const slimSourced = <T extends { data_sources?: unknown }>(row: T): T => ({
  ...without(row, SOURCED_NOISE),
  ...(row.data_sources
    ? { data_sources: without(row.data_sources as object, SOURCE_NOISE) }
    : {}),
});
// Import provenance the source drawer never shows (raw file names, survey flags).
const IMPORT_NOISE = ["raw_file", "raw_field", "release", "university_id", "dictionary_url", "imputation_flag", "source_record_id"] as const;
const RANK_FIELDS = ["domain", "provider", "year", "rank", "tied", "band", "url", "rank_label"] as const;
/** Keep only the ranking fields a compact badge reads (scores and per-country
 * detail belong to the profile). */
const slimRank = (rank: Row) =>
  Object.fromEntries(RANK_FIELDS.filter((key) => key in rank).map((key) => [key, rank[key]]));
// The card's photo credit reads data_sources.url; keep the source row typed
// (minus bookkeeping) rather than inventing a partial Source shape.
const slimMedia = (m: University["media"][number]) => ({
  ...without(m, [...SOURCED_NOISE, "source_id", "professor_id"]),
  ...(m.data_sources ? { data_sources: without(m.data_sources, SOURCE_NOISE) } : {}),
});
const slimEntry = (e: University["ranking_entries"][number]) => ({
  ...slimSourced(e),
  ...(e.ranking_editions
    ? {
        ranking_editions: {
          ...without(e.ranking_editions, ["created_at"]),
          ...(e.ranking_editions.ranking_providers
            ? { ranking_providers: without(e.ranking_editions.ranking_providers, ["created_at", "methodology"]) }
            : {}),
        },
      }
    : {}),
});

/** Result-card payload: the discovery preview plus only the overall ranking
 * entries the badges read and the single campus photo a card shows. Full
 * profiles still load every entry and media item. */
export function cardPreview(u: University): University {
  const preview = discoveryPreview(u);
  const campus = u.media.find((m) => m.kind === "campus");
  return withAutoLogo({
    ...preview,
    data_points: preview.data_points.map(slimSourced),
    costs: preview.costs.map(slimSourced),
    admissions: preview.admissions.map(slimSourced),
    imported_records: preview.imported_records?.map((r) => without(r, IMPORT_NOISE)),
    rankings: preview.rankings?.map((r) => slimRank(r as unknown as Row)) as University["rankings"],
    ranking_entries: (u.ranking_entries || [])
      .filter((entry) => entry.ranking_editions?.subject === "Overall")
      .map(slimEntry),
    media: campus ? [slimMedia(campus)] : [],
  });
}

/** The layout's shared catalogue rows (landing cards, compare tray, search,
 * award media, the /sources register): the card payload, but with every
 * ranking entry, because the source register lists each entry's source. */
export function sharedCataloguePreview(u: University): University {
  return { ...cardPreview(u), ranking_entries: (u.ranking_entries || []).map(slimEntry) };
}
