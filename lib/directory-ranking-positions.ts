import index from "../data/published/reviewed-webometrics-profile-index-oct15.json";
import unirank from "../data/published/reviewed-unirank-oct15.json";
import cited from "../data/published/cited-rankings-oct20.json";
import type { University } from "./domain";
import type { DirectoryRankingProvider } from "./directory-rankings-shared";

type ProfileDirectoryRow = {
  country_code: string;
  ror: string | null;
  world_rank: number | null;
  country_rank: number;
  world_tied?: boolean;
  source_url: string;
};
type IndexedPosition = [
  country: string,
  ror: string | null,
  world: number,
  countryRank: number,
  tied: boolean,
  page: number,
];

/** Exact ID lookup avoids sending full source tables with every university profile. */
export function directoryRanksForUniversity(
  university: Pick<University, "id" | "country_code" | "identifiers">,
) {
  const results: {
    provider: DirectoryRankingProvider;
    row: ProfileDirectoryRow;
  }[] = [];
  const position = (index.records as unknown as Record<string, IndexedPosition>)[
    university.id
  ];
  if (position) {
    const [country_code, ror, world_rank, country_rank, world_tied, page] =
      position;
    results.push({
      provider: "webometrics",
      row: {
        country_code,
        ror,
        world_rank,
        country_rank,
        world_tied,
        source_url: `${index.download_url}#page=${page}`,
      },
    });
  }
  const reported = unirank.records.find(
    (row) => row.university_id === university.id,
  );
  if (reported) results.push({ provider: "unirank", row: reported });
  const citedRows = (
    cited.records
  )[university.id];
  for (const [provider, label, countryRank, url, country, ror] of citedRows || []) {
    const meta = cited.providers[provider as "cwur" | "urap"];
    if (!meta) continue;
    results.push({
      provider: provider as DirectoryRankingProvider,
      row: {
        country_code: country || "",
        ror: ror || null,
        world_rank: Number(label),
        country_rank: countryRank ?? 0,
        source_url: url || meta.source_url,
      },
    });
  }
  return results.filter(
    ({ row }) =>
      row.country_code === university.country_code &&
      (!row.ror ||
        !university.identifiers?.ror ||
        university.identifiers.ror === row.ror),
  );
}
