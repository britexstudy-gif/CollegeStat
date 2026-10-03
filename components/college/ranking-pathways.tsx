import Link from "next/link";
import { ArrowUpRight, Trophy } from "lucide-react";
import type { University } from "@/lib/domain";
import {
  regionalRankLabel,
  regionalRanksForUniversity,
} from "@/lib/regional-rankings";

export function RegionalProfilePositions({
  university: u,
}: {
  university: University;
}) {
  const rows = regionalRanksForUniversity(u);
  if (!rows.length) return null;
  return (
    <div
      className="profile-regional-positions"
      aria-label="Published regional ranking positions"
    >
      <Trophy size={16} aria-hidden="true" />
      <span>Regional rankings</span>
      {rows.map((r) => (
        <a key={r.scope} href={r.source_url} target="_blank" rel="noreferrer">
          QS {r.scope} {r.year}
          <strong>{regionalRankLabel(r.rank_label)}</strong>
          <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}
export function SubjectRankingPathways({
  university: u,
}: {
  university: University;
}) {
  return (
    <aside className="subject-ranking-pathways">
      <Trophy size={20} aria-hidden="true" />
      <div>
        <h3>Compare your subject, too.</h3>
        <p>
          Overall and regional positions don’t rank an individual program. Check
          the subject tables for your field and publisher edition.
        </p>
        <div>
          <a
            href="https://www.topuniversities.com/subject-rankings"
            target="_blank"
            rel="noreferrer"
          >
            QS subject rankings <ArrowUpRight size={13} />
          </a>
          <a
            href="https://www.timeshighereducation.com/world-university-rankings/by-subject"
            target="_blank"
            rel="noreferrer"
          >
            THE subject rankings <ArrowUpRight size={13} />
          </a>
          <Link href={"/university/" + u.slug + "?tab=Rankings"}>
            University ranking details →
          </Link>
        </div>
      </div>
    </aside>
  );
}
