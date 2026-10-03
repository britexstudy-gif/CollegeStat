import {
  universityRanks,
  rankingPublishers,
  rankLabel,
} from "@/lib/ranking-highlights";
import { countryName, type University } from "@/lib/domain";
import { ArrowUpRight } from "lucide-react";
import { PublisherMark } from "./publisher-mark";
export function RankingBadges({
  university,
  compact = false,
}: {
  university: University;
  compact?: boolean;
}) {
  const ranks = universityRanks(university);
  if (!ranks.length) return null;
  return (
    <div
      className={compact ? "rank-badges compact" : "rank-badges"}
      aria-label="Published ranking positions"
    >
      {ranks.map((r) => (
        <a
          key={r.provider}
          href={r.url}
          target="_blank"
          rel="noreferrer"
          className={`rank-badge rank-${r.provider}`}
          title={`View ${rankingPublishers[r.provider].name} ${r.year} source`}
        >
          <span>
            <PublisherMark provider={r.provider} />
            <small>{r.year}</small>
          </span>
          <strong>
            {rankLabel(r)}
            {!compact && (r.national_rank || r.country_position) && (
              <small>
                {r.national_rank
                  ? `National/regional #${r.national_rank}`
                  : `${countryName(university.country_code)} · ${r.country_position} in global table`}
              </small>
            )}
          </strong>
          {!compact && <ArrowUpRight size={16} />}
        </a>
      ))}
    </div>
  );
}
