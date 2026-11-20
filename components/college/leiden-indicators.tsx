"use client";
import type { ResearchMetric, University } from "@/lib/domain";

const indicators = [
  { metric: "publications_fractional_core", label: "Core publications", short: "P" },
  { metric: "top_5_percent_publications_fractional_core", label: "Among the most cited 5%", short: "P(top 5%)" },
  { metric: "top_5_percent_publications_share_fractional_core", label: "Share among the most cited 5%", short: "PP(top 5%)" },
] as const;

function isReviewedIndicator(record: ResearchMetric, universityId: string) {
  if (record.university_id !== universityId || record.verification_status !== "verified" || !Number.isFinite(record.value) || record.value < 0 || !Number.isFinite(Date.parse(record.retrieved_at))) return false;
  const indicator = indicators.find(indicator => indicator.metric === record.metric);
  if (!indicator || record.unit !== (indicator.short.startsWith("PP") ? "%" : "publications") || (record.unit === "%" && record.value > 100)) return false;
  if (record.evidence?.counting_method !== "fractional" || record.evidence?.core_publications_only !== true) return false;
  try { const url = new URL(record.source_url); return url.protocol === "https:" && url.hostname === "open.leidenranking.com"; } catch { return false; }
}

export function LeidenIndicators({ university: u }: { university: University }) {
  const records = (u.research_metrics || []).filter(record => isReviewedIndicator(record, u.id));
  const snapshot = records.filter(record => indicators.some(indicator => record.metric === indicator.metric))
    .sort((a, b) => (b.edition || "").localeCompare(a.edition || "") || Date.parse(b.retrieved_at) - Date.parse(a.retrieved_at))[0];
  if (!snapshot) return null;
  const rows = indicators.flatMap(indicator => {
    const record = records.find(record => record.metric === indicator.metric && record.period === snapshot.period && record.field === snapshot.field && record.edition === snapshot.edition && record.retrieved_at === snapshot.retrieved_at);
    if (!record || (record.unit === "%" && record.value > 100)) return [];
    return [{ indicator, record }];
  });
  if (!rows.length) return null;
  return (
    <section className="research-metrics leiden-indicators" aria-label="Leiden scientific-impact indicators">
      <header><div><span className="section-caption">Leiden Open Edition · {snapshot.evidence?.publication_year as number || 2025}</span><h3>Scientific impact</h3></div></header>
      <p>{snapshot.period} publications · {snapshot.field || "All sciences"} · fractional counting · core publications.</p>
      <div className="research-table-scroll"><table>
        <caption className="sr-only">Scientific-impact indicators for this university, with the source and observation window.</caption>
        <thead><tr><th scope="col">Indicator</th><th scope="col">Published value</th><th scope="col">Evidence</th></tr></thead>
        <tbody>{rows.map(({ indicator, record }) => <tr key={record.id}>
          <th scope="row">{indicator.label}<small> {indicator.short}</small></th>
          <td><strong>{record.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}{record.unit === "%" ? "%" : ""}</strong></td>
          <td><a href={record.source_url} target="_blank" rel="noreferrer">CWTS source ↗</a></td>
        </tr>)}</tbody>
      </table></div>
      <p>Citations through {snapshot.evidence?.citation_window_end as number || 2024}. These figures describe a defined publication set; they are not an overall university rank.</p>
      <a className="text-link" href="https://open.leidenranking.com/information/indicators" target="_blank" rel="noreferrer">Definitions & counting methods ↗</a>
    </section>
  );
}
