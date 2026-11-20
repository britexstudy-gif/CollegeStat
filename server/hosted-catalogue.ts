import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { publicConfig } from "./public-config";
import {
  normalizeUniversity,
  type University,
  type Scholarship,
} from "@/lib/domain";
import { readFilters, type Filters, parseResearchQuery } from "@/lib/research";
import {
  universitySelect,
  discoverySelect,
  type Catalogue,
  type ExplorerResult,
} from "@/lib/supabase/catalogue";
import { publicReadCache } from "./public-read-cache";
import { sharedRead } from "./shared-read-cache";
import { d1Explore, d1HomeSummary, d1Search, d1Universities } from "./d1-catalogue";
import { cardPreview, discoveryPreview } from "./discovery-preview";
import { withAutoLogo } from "./auto-logos";
import { abortable } from "@/lib/abortable";

export function publicDatabase() {
  const config = publicConfig();
  if (!config.url || !config.anon)
    throw new Error("Public catalogue is not connected.");
  // Auth initialization/locks belong to this worker request. Reuse completed
  // public results instead of retaining a Supabase client across HTTP lifetimes.
  return createClient(config.url, config.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
// Published rows change rarely. This in-isolate memo spares repeat renders the
// Supabase round trips; the pages themselves are edge-cached for longer
// (server/edge-cache.ts).
export const PUBLIC_READ_TTL_MS = 30 * 60000;
/** Seconds the heavy summary and explore results are shared per data center. */
const SHARED_READ_SECONDS = 6 * 3600;
const identitiesCache = publicReadCache<University[]>(24, PUBLIC_READ_TTL_MS);
const previewsCache = publicReadCache<University[]>(24, PUBLIC_READ_TTL_MS);
const exploreCache = publicReadCache<ExplorerResult>(16, PUBLIC_READ_TTL_MS);
const searchCache = publicReadCache<University[]>(32, PUBLIC_READ_TTL_MS);
/** Bounded identity/media hydration for cards, without programmes or research libraries. */
export async function hostedUniversityIdentities(
  ids: string[],
  callerSignal?: AbortSignal,
) {
  const selected = [...new Set(ids)].slice(0, 24);
  if (!selected.length) return [];
  const read = () =>
    identitiesCache(publicConfig().url + ":" + selected.join(","), async () => {
      const { data, error } = await publicDatabase()
        .from("universities")
        .select(
          "id,name,slug,short_name,website,logo_url,logo_source_url,logo_usage_notes,brand_color,media(*,data_sources(*))",
        )
        .eq("published", true)
        .in("id", selected)
        .abortSignal(AbortSignal.timeout(10000));
      if (error) throw new Error("University identities could not be loaded.");
      return (data as unknown as University[]).map(normalizeUniversity);
    });
  if (!callerSignal) return read();
  // A request-specific deadline cannot cancel a shared cache fill used by
  // other public requests. This narrower optional lookup bypasses that fill.
  const { data, error } = await publicDatabase()
    .from("universities")
    .select(
      "id,name,slug,short_name,website,logo_url,logo_source_url,logo_usage_notes,brand_color,media(*,data_sources(*))",
    )
    .eq("published", true)
    .in("id", selected)
    .abortSignal(callerSignal);
  if (error) throw new Error("University identities could not be loaded.");
  return (data as unknown as University[]).map(normalizeUniversity);
}
export async function hostedUniversities(ids: string[], preview = false) {
  if (!ids.length) return [];
  const selected = [...new Set(ids)].slice(0, 24);
  if (preview)
    return previewsCache(publicConfig().url + ":" + selected.join(","), () =>
      loadHostedUniversities(selected, true),
    );
  return loadHostedUniversities(selected, false);
}
async function loadHostedUniversities(selected: string[], preview: boolean) {
  const fromD1 = await d1Universities<University>(selected, preview ? "card" : "doc");
  const { data, error } = fromD1
    ? { data: fromD1, error: null }
    : await publicDatabase()
    .from("universities")
    .select<string>(preview ? discoverySelect : universitySelect)
    .eq("published", true)
    .in("id", selected)
    .abortSignal(AbortSignal.timeout(20000));
  if (error) throw new Error("University details could not be loaded.");
  const rows = (data as unknown as University[])
    .map(normalizeUniversity)
    .map((u) => (preview ? discoveryPreview(u) : u))
    // Resolved on the server so the client never downloads the icon map.
    .map(withAutoLogo);
  return selected.flatMap((id) => rows.filter((u) => u.id === id));
}
export async function hostedExplore(filters: Filters): Promise<ExplorerResult> {
  // Stable schema order makes equivalent URL filters share the SSR/API load.
  const normalized = readFilters(
    new URLSearchParams(
      Object.entries(filters)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)]),
    ),
  );
  return exploreCache(
    publicConfig().url + ":" + JSON.stringify(normalized),
    () =>
      sharedRead("explore:" + JSON.stringify(normalized), SHARED_READ_SECONDS, () =>
        loadHostedExplore(normalized),
      ),
  );
}
async function loadHostedExplore(filters: Filters): Promise<ExplorerResult> {
  const fromD1 = await d1Explore(filters);
  const { data, error } = fromD1
    ? { data: fromD1, error: null }
    : await publicDatabase()
        .rpc("explore_universities", { filters, page_number: filters.page })
        .abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error("Search could not be loaded.");
  const page = Math.min(filters.page, Math.max(1, Math.ceil(data.total / 24)));
  if (page !== filters.page) return hostedExplore({ ...filters, page });
  const universities = (await hostedUniversities(data.ids, true)).map(
    cardPreview,
  );
  return {
    universities,
    total: data.total,
    page,
    medianTuition: data.medianTuition,
    medianAdmission: data.medianAdmission,
    countries: data.countries,
  };
}
export async function hostedSearch(query: string) {
  query = query.slice(0, 200);
  return searchCache(publicConfig().url + ":" + query, () =>
    loadHostedSearch(query),
  );
}
async function loadHostedSearch(query: string) {
  const parsed = parseResearchQuery(query);
  if (parsed.recognized) {
    const hosted = (await hostedExplore(parsed.filters)).universities.slice(0, 8);
    if (hosted.length) return hosted;
    // The installed explore_universities() ignores the publisher subject lists
    // the bundled filter also reads for a `field` (see supabase/proposals/
    // 20261114_explorer_tuition_sort_countries.sql), so "computer science germany"
    // came back empty. Answer from the bundled catalogue until it is applied.
    // A production Worker does not carry that catalogue (it is 50 MB), so there
    // the empty hosted answer stands.
    try {
      const { bundledFilterSearch } = await import("./bundled-search");
      return await bundledFilterSearch(parsed.filters);
    } catch {
      return hosted;
    }
  }
  const fromD1 = await d1Search(query);
  if (fromD1) return hostedUniversities(fromD1, true);
  const { data, error } = await publicDatabase()
    .rpc("search_universities", { search_term: query, result_limit: 8 })
    .abortSignal(AbortSignal.timeout(15000));
  if (error) throw new Error("Search could not be loaded.");
  return hostedUniversities(
    data.map((u: { id: string }) => u.id),
    true,
  );
}
type PublicCatalogue = Catalogue & { total: number; countries: number };
// One bounded public entry only. Never cache an authenticated user's data.
const catalogueCache = publicReadCache<PublicCatalogue>(1, PUBLIC_READ_TTL_MS);
async function loadHostedCatalogue(): Promise<PublicCatalogue> {
  const fromD1 = await d1HomeSummary<Scholarship>();
  if (fromD1)
    return {
      mode: "supabase",
      universities: await hostedUniversities(fromD1.ids, true),
      scholarships: fromD1.scholarships,
      total: fromD1.total,
      countries: fromD1.countries,
    };
  const db = publicDatabase();
  const summary = async () => {
    const result = await db
      .rpc("home_catalogue_summary")
      .abortSignal(AbortSignal.timeout(15000));
    // Preserve older deployments during migration rollout. Other failures must
    // remain retryable instead of starting another expensive query on outage.
    if (result.error?.code !== "PGRST202") return result;
    return db
      .rpc("explore_universities", {
        filters: readFilters(new URLSearchParams()),
        page_number: 1,
      })
      .abortSignal(AbortSignal.timeout(15000));
  };
  // The featured cards need the summary's ids; the scholarship list does not,
  // so it stays in flight while the two university reads run one after another.
  // Promise.resolve starts the (lazy) query builder now.
  const scholarshipsRead = Promise.resolve(
    db
    .from("scholarships")
    .select(
      "*,data_sources(*),university_scholarships(university_id,universities(id,name,slug))",
    )
    .eq("published", true)
    .eq("verification_status", "verified")
    .order("deadline", { nullsFirst: false })
    .limit(24)
    .abortSignal(AbortSignal.timeout(15000)),
  );
  const featured = await summary();
  if (featured.error) {
    void scholarshipsRead.catch(() => {});
    throw new Error("The catalogue could not be loaded.");
  }
  const [universities, scholarships] = await Promise.all([
    hostedUniversities(featured.data.ids.slice(0, 12), true),
    scholarshipsRead,
  ]);
  if (scholarships.error) throw new Error("The catalogue could not be loaded.");
  return {
    mode: "supabase",
    universities,
    scholarships: scholarships.data as unknown as Scholarship[],
    total: featured.data.total,
    countries: featured.data.countries,
  };
}
export const hostedCatalogue = cache(() =>
  keepAlive(
    catalogueCache(publicConfig().url, () =>
      sharedRead("catalogue:v1", SHARED_READ_SECONDS, loadHostedCatalogue),
    ),
  ),
);
/** The root layout stops waiting after 350 ms and serves the bundled snapshot.
 * Without waitUntil, Workers cancels the remaining Supabase I/O when that page
 * response ends, so the cache never fills and the next request starts cold.
 * Outside Workers (tests, scripts) the module is absent and this is a no-op. */
function keepAlive<T>(work: Promise<T>): Promise<T> {
  import("cloudflare:workers")
    .then((workers) =>
      (workers as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil?.(
        work.catch(() => {}),
      ),
    )
    .catch(() => {});
  return work;
}
export const RANKING_READ_TIMEOUT_MS = 15000;
const MAX_RANKING_ROWS = 10000;
const MAX_RANKING_REQUESTS = 24;
// Only complete anonymous results enter this cache. A single deadline bounds
// both the fill and its pending lifetime, including stalled SDK transports.
const rankingsCache = publicReadCache<University[]>(
  1,
  60000,
  Date.now,
  RANKING_READ_TIMEOUT_MS + 1000,
);
export async function hostedRankingProfiles(callerSignal?: AbortSignal) {
  callerSignal?.throwIfAborted();
  const request = rankingsCache(publicConfig().url, loadHostedRankingProfiles);
  // One caller ending must not cancel a fill used by other public requests.
  return callerSignal ? abortable(request, callerSignal) : request;
}

/** One public client and at most two pages in flight; never return a partial scan. */
export async function loadHostedRankingProfiles(
  options: { database?: typeof publicDatabase; timeoutMs?: number } = {},
): Promise<University[]> {
  const deadline = AbortSignal.timeout(
    Math.min(
      RANKING_READ_TIMEOUT_MS,
      Math.max(1, Math.floor(options.timeoutMs || RANKING_READ_TIMEOUT_MS)),
    ),
  );
  const cancellation = new AbortController();
  const signal = AbortSignal.any([deadline, cancellation.signal]);
  const db = (options.database || publicDatabase)();
  const rows = new Map<string, University>();
  let offset = 0;
  let width = 1000;
  let requests = 0;
  const read = async (start: number) => {
    signal.throwIfAborted();
    if (++requests > MAX_RANKING_REQUESTS)
      throw new Error(
        "Ranking source exceeds the bounded read; no partial catalogue was returned.",
      );
    const query = db
      .rpc("ranking_profiles", {
        result_offset: start,
        result_limit: Math.min(width, MAX_RANKING_ROWS + 1 - start),
      })
      .abortSignal(signal);
    const { data, error } = await abortable(Promise.resolve(query), signal);
    if (error || !Array.isArray(data))
      throw new Error("Ranking profiles could not be loaded.");
    return data as Partial<University>[];
  };
  try {
    while (offset <= MAX_RANKING_ROWS) {
      signal.throwIfAborted();
      const starts = [offset, offset + width].filter(
        (start) => start <= MAX_RANKING_ROWS,
      );
      const pages = await Promise.all(starts.map(read));
      for (const page of pages) {
        if (!page.length) return [...rows.values()];
        if (offset + page.length > MAX_RANKING_ROWS)
          throw new Error(
            "Ranking source exceeds the bounded read; no partial catalogue was returned.",
          );
        for (const source of page) {
          if (!source.id)
            throw new Error("Ranking profiles could not be loaded.");
          const university = normalizeUniversity(source);
          if (
            !university.rankings?.length &&
            !university.ranking_entries.length &&
            !university.imported_records?.some(
              (record) => record.source === "leiden",
            )
          )
            continue;
          const previous = rows.get(university.id);
          rows.set(
            university.id,
            previous
              ? {
                  ...previous,
                  ...university,
                  rankings: rankingEvidence(
                    previous.rankings,
                    university.rankings,
                  ),
                  ranking_entries: rankingEvidence(
                    previous.ranking_entries,
                    university.ranking_entries,
                  ),
                  imported_records: rankingEvidence(
                    previous.imported_records,
                    university.imported_records,
                  ),
                }
              : university,
          );
        }
        offset += page.length;
        if (page.length < width) {
          // A short page may be PostgREST's row cap. Confirm the next contiguous
          // page instead of declaring the catalogue complete or skipping rows.
          width = page.length;
          break;
        }
      }
    }
    throw new Error(
      "Ranking source exceeds the bounded read; no partial catalogue was returned.",
    );
  } finally {
    cancellation.abort();
  }
}

/** Merge repeated identities without collapsing publisher/year/scope evidence. */
function rankingEvidence<T>(first: T[] = [], second: T[] = []): T[] {
  return [
    ...new Map(
      [...first, ...second].map((record) => [JSON.stringify(record), record]),
    ).values(),
  ];
}
