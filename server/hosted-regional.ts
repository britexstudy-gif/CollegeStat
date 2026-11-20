import { publicDatabase } from "./hosted-catalogue";
import { normalizeUniversity, type University } from "@/lib/domain";
import {
  regionalEditions,
  regionalRankingRecords,
  latestRegionalEditions,
  resolveRegionalScope,
  type RegionalEdition,
} from "@/lib/regional-rankings";
import type { RegionalRecord } from "./ranking-table";
import { abortable } from "@/lib/abortable";

type HostedRegionalEdition = RegionalEdition & { id: string };
export const REGIONAL_READ_TIMEOUT_MS = 8000;
const MAX_REGIONAL_ROWS = 5000;

export type RegionalReadContext = {
  readonly signal: AbortSignal;
  readonly database: typeof publicDatabase;
  readonly sharedEditionCache: boolean;
};

/** One deadline covers discovery and every entries page, including stalled SDK reads. */
export function createRegionalReadContext(
  parentSignal?: AbortSignal,
  options: { timeoutMs?: number; database?: typeof publicDatabase } = {},
): RegionalReadContext {
  const timeoutMs = Math.min(
    REGIONAL_READ_TIMEOUT_MS,
    Math.max(1, Math.floor(options.timeoutMs || REGIONAL_READ_TIMEOUT_MS)),
  );
  const deadline = AbortSignal.timeout(timeoutMs);
  return {
    signal: parentSignal ? AbortSignal.any([parentSignal, deadline]) : deadline,
    database: options.database || publicDatabase,
    sharedEditionCache: !options.database,
  };
}

let editionCache:
  { expires: number; value: HostedRegionalEdition[] } | undefined;
let editionRequest: Promise<HostedRegionalEdition[]> | undefined;

/** Discover only public permitted editions. Local coverage never hides a hosted scope. */
export async function hostedRegionalEditions(
  context = createRegionalReadContext(),
): Promise<
  HostedRegionalEdition[]
> {
  context.signal.throwIfAborted();
  // Injected public clients remain isolated from the production cache.
  if (!context.sharedEditionCache) return loadRegionalEditions(context);
  if (editionCache && editionCache.expires > Date.now())
    return editionCache.value;
  // A caller's cancellation must not cancel a cache fill shared by other requests.
  editionRequest ??= loadRegionalEditions(createRegionalReadContext())
    .then((value) => {
      editionCache = { value, expires: Date.now() + 60000 };
      return value;
    })
    .finally(() => {
      editionRequest = undefined;
    });
  return abortable(editionRequest, context.signal);
}
async function loadRegionalEditions(
  context: RegionalReadContext,
): Promise<HostedRegionalEdition[]> {
  context.signal.throwIfAborted();
  const query = context.database()
    .from("ranking_editions")
    .select("id,year,region,subject,permitted,ranking_providers!inner(slug,website)")
    .eq("ranking_providers.slug", "qs")
    .eq("subject", "Overall")
    .eq("permitted", true)
    .neq("region", "Global")
    .order("year", { ascending: false })
    .order("region")
    .limit(200)
    .abortSignal(context.signal);
  const { data, error } = await abortable(Promise.resolve(query), context.signal);
  if (error) throw new Error("Regional editions could not be loaded.");
  const rows = (data || []).flatMap((row) => {
    const publisher = row.ranking_providers as unknown as {
      slug: string;
      website: string | null;
    };
    if (!row.permitted || row.subject !== "Overall" || publisher?.slug !== "qs")
      return [];
    const snapshot = regionalEditions.find(
      (r) => r.scope === row.region && r.year === row.year,
    );
    return [{
      id: row.id as string,
      scope: row.region as string,
      year: row.year as number,
      url: snapshot?.url || publisher.website || undefined,
    }];
  });
  const latest = latestRegionalEditions(rows);
  return latest.map((edition) =>
    rows.find(
      (row) => row.scope === edition.scope && row.year === edition.year,
    )!,
  );
}

/** Read one published edition; no full profiles, private data or arbitrary SQL. */
export async function hostedRegionalRecords(
  scope: string,
  available?: readonly HostedRegionalEdition[],
  context = createRegionalReadContext(),
): Promise<RegionalRecord[]> {
  context.signal.throwIfAborted();
  const editions = available || (await hostedRegionalEditions(context));
  // An empty connected project retains the installed historical selection.
  if (!editions.length)
    return regionalRankingRecords.filter(
      (r) => r.scope === resolveRegionalScope(scope, regionalEditions),
    );
  scope = resolveRegionalScope(scope, editions);
  const db = context.database();
  const edition = editions.find((r) => r.scope === scope)!;
  const result: RegionalRecord[] = [];
  let offset = 0;
  while (offset <= MAX_REGIONAL_ROWS) {
    context.signal.throwIfAborted();
    const pageSize = Math.min(1000, MAX_REGIONAL_ROWS + 1 - offset);
    const query = db
      .from("ranking_entries")
      .select(
        "id,rank,rank_label,verification_status,verified_at,source_id,data_sources(url),universities!inner(id,name,slug,website,country_code,short_name,logo_url,profile_resources,published)",
      )
      .eq("edition_id", edition.id)
      .eq("verification_status", "verified")
      .not("verified_at", "is", null)
      .not("source_id", "is", null)
      .eq("universities.published", true)
      .order("rank", { nullsFirst: false })
      .order("id")
      .range(offset, offset + pageSize - 1)
      .abortSignal(context.signal);
    const { data, error } = await abortable(Promise.resolve(query), context.signal);
    if (error) throw new Error("Regional positions could not be loaded.");
    const rows = data || [];
    if (!rows.length) break;
    if (offset + rows.length > MAX_REGIONAL_ROWS)
      throw new Error("Regional source exceeds the bounded read; no partial table was returned.");
    for (const row of rows) {
      const source = (row.data_sources as unknown as { url: string } | null)
        ?.url;
      const identity = row.universities as unknown as Partial<University>;
      const label = row.rank_label || (
        Number.isInteger(row.rank) && row.rank > 0 ? String(row.rank) : ""
      );
      if (
        row.verification_status !== "verified" ||
        !row.verified_at || !row.source_id || !identity?.published ||
        !source?.startsWith("https://") || regionalPosition(label) === null
      ) continue;
      const university = normalizeUniversity(identity);
      let domain = "";
      try {
        domain = new URL(university.website || "").hostname.replace(
          /^www\./,
          "",
        );
      } catch {}
      result.push({
        domain,
        name: university.name,
        scope,
        year: edition.year,
        rank_label: label,
        source_url: source,
        country_code: university.country_code,
        university,
      });
    }
    // PostgREST may cap responses below the requested size. Advance by actual
    // source rows and continue to an empty page instead of dropping later rows.
    offset += rows.length;
  }
  return result.sort((a, b) =>
    regionalPosition(a.rank_label)! - regionalPosition(b.rank_label)! ||
    a.name.localeCompare(b.name),
  );
}

/** Labels are preserved verbatim; a lower bound is only an ordering key. */
function regionalPosition(label: string): number | null {
  const match = label.match(/^(=?)([1-9]\d*)(?:\s*[-–]\s*([1-9]\d*)|(\+))?$/);
  if (!match || (match[1] && (match[3] || match[4]))) return null;
  const lower = Number(match[2]);
  if (!Number.isSafeInteger(lower)) return null;
  if (match[3]) {
    const upper = Number(match[3]);
    if (!Number.isSafeInteger(upper) || upper < lower) return null;
  }
  return lower;
}
