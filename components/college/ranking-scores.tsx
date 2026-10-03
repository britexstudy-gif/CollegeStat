import type { University } from "@/lib/domain";
import { universityRanks, rankingPublishers } from "@/lib/ranking-highlights";
import { PublisherMark } from "./publisher-mark";
import { scoreRange } from "@/lib/score-range";
const names: Record<string, string> = {
  overall: "Overall",
  teaching: "Teaching",
  research: "Research environment",
  citations: "Research quality",
  industry_income: "Industry",
  international_outlook: "International outlook",
};
export function RankingScores({ university }: { university: University }) {
  return (
    <div className="ranking-scores">
      {universityRanks(university)
        .filter((r) => r.scores && Object.keys(r.scores).length)
        .map((r) => (
          <section key={r.provider}>
            <header>
              <PublisherMark provider={r.provider} />
              <h3>
                {rankingPublishers[r.provider].name} {r.year} scores
              </h3>
              <a href={r.url} target="_blank" rel="noreferrer">
                Publisher source ↗
              </a>
            </header>
            <dl>
              {Object.entries(r.scores!)
                .filter(([, value]) => value && value !== "n/a")
                .map(([key, value]) => {
                  const range = scoreRange(value!);
                  return (
                  <div key={key}>
                    <dt>{names[key] || key.replaceAll("_", " ")}</dt>
                    <dd>
                      {value}
                      <small> / 100</small>
                    </dd>
                    {range && (
                      <div className="score-track" role="img" aria-label={`${names[key] || key}: ${value} out of 100`}>
                        <span style={{ width: range.low + "%" }} />
                        {range.high > range.low && <i style={{ left: range.low + "%", width: (range.high - range.low) + "%" }} />}
                      </div>
                    )}
                  </div>
                ); })}
            </dl>
          </section>
        ))}
    </div>
  );
}
