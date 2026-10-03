import Link from "next/link";
import type { University } from "@/lib/domain";
import {
  regionalRanksForUniversity,
  regionalRankLabel,
} from "@/lib/regional-rankings";
import { universityRanks } from "@/lib/ranking-highlights";
export function RankingContext({ university: u }: { university: University }) {
  const regional = regionalRanksForUniversity(u);
  const global = universityRanks(u);
  return (
    <section className="ranking-context">
      {regional.length > 0 && (
        <>
          <h3>Regional publisher rankings</h3>
          <div className="regional-rank-grid">
            {regional.map((r) => (
              <a
                key={r.scope}
                href={r.source_url}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  QS {r.scope} · {r.year}
                </span>
                <strong>{regionalRankLabel(r.rank_label)}</strong>
                <small>Official regional position · source ↗</small>
              </a>
            ))}
          </div>
        </>
      )}
      <div className="ranking-reading">
        <h3>
          {global.length || regional.length
            ? "Read the position correctly"
            : "Evaluate beyond an overall rank"}
        </h3>
        <p>
          {global.length || regional.length
            ? "#12 means twelfth; =12 means joint twelfth. A band such as 501–600 is the publisher’s reported range, not an exact position. Regional tables have their own methodology."
            : "No verified position is linked in our installed ranking records. This is a coverage gap, not a zero score or proof that the university has never been ranked."}
        </p>
        {!global.length && !regional.length && (
          <ul>
            <li>
              Look for a subject or regional table before assuming there is no
              ranking.
            </li>
            <li>
              Check recognition and programme accreditation with the relevant
              national body.
            </li>
            <li>
              Compare the curriculum, total costs, student support, and sourced
              outcomes for your degree.
            </li>
          </ul>
        )}
        <div className="application-link-grid">
          <a
            href="https://www.topuniversities.com/university-rankings"
            target="_blank"
            rel="noreferrer"
          >
            QS world, region & subject tables ↗
          </a>
          <Link href="/compare">Compare university evidence →</Link>
          <Link href="/resources/compare">How to evaluate universities →</Link>
        </div>
      </div>
    </section>
  );
}
