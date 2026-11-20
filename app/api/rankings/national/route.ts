import { usesHostedCatalogue } from "@/lib/catalogue-mode";
import {
  nationalRankingTable,
  type NationalRankingSnapshot,
} from "@/lib/national-rankings";
import { hostedUniversityIdentities } from "@/server/hosted-catalogue";
import { hydrateNationalRankingProfiles } from "@/server/national-ranking-profiles";
import { assetJson } from "@/server/asset-data";

// Built once per isolate: a linear scan of the 14k-row directory per table row
// repeated on every request. Only the bundled (non-hosted) catalogue reads it,
// and a production Worker does not carry the 16 MB directory (hosted mode
// resolves profiles from Supabase), so this fails there and the table keeps
// the publisher's own rows.
let directoryIndex:
  | Promise<Map<string, { slug: string; name: string }>>
  | undefined;
const directoryById = () =>
  (directoryIndex ??= assetJson<{ id: string; slug: string; name: string }[]>(
    "published/global-directory.json",
  ).then(
    (directory) =>
      new Map(directory.map((p) => [p.id, { slug: p.slug, name: p.name }])),
  ).catch((error) => {
    directoryIndex = undefined;
    throw error;
  }));

export async function GET(request: Request) {
  try {
    // This source snapshot is loaded only when the national table is requested.
    const [snapshot, { default: search }] = await Promise.all([
      assetJson<unknown>("published/reviewed-national-rankings.json"),
      import("@/data/published/national-ranking-search.json"),
    ]);
    const table = nationalRankingTable(
      snapshot as unknown as NationalRankingSnapshot,
      new URL(request.url).searchParams,
      search.names,
      search.identity_links,
    );
    const ids = table.rows
      .map((r) => r.university_id)
      .filter((id): id is string => Boolean(id));
    if (ids.length && usesHostedCatalogue()) {
      // A failed optional profile lookup must not hide the publisher's source rows.
      await hydrateNationalRankingProfiles(
        table,
        (selected, signal) => hostedUniversityIdentities(selected, signal),
        request.signal,
      );
    } else if (ids.length) {
      const directory = await directoryById();
      for (const row of table.rows) {
        const university = row.university_id
          ? directory.get(row.university_id)
          : undefined;
        if (university)
          row.university = {
            slug: university.slug,
            name: university.name,
            logo_url: null,
          };
      }
    }
    return Response.json(table, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch {
    return Response.json(
      { error: "The reviewed ranking table could not load. Please retry." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
