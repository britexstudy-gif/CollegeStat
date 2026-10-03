"use client";
import { useState } from "react";
import type { ImportedRecord } from "@/lib/domain";
import {
  historicalSeries,
  isCurrentObservation,
  recordsForCategory,
} from "@/lib/profile-records";
import { HistoryChart } from "@/charts/research-charts";

const label = (s: string) =>
  s.replaceAll("_", " ").replace(/^completions cip /, "Degrees awarded · CIP ");
function EvidenceRows({ records }: { records: ImportedRecord[] }) {
  return (
    <div className="profile-evidence-list">
      {records.map((r) => (
        <div key={r.id}>
          <span>
            {label(r.metric)}
            <small>{r.cohort}</small>
          </span>
          <strong>
            {typeof r.value === "number"
              ? r.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
              : r.value}
            {r.unit ? ` ${r.unit}` : ""}
          </strong>
          <span>
            {r.period || r.reporting_year || r.release}
            <a href={r.source_url} target="_blank" rel="noreferrer">
              {r.source_name} ↗
            </a>
          </span>
        </div>
      ))}
    </div>
  );
}
export function ProfileData({
  records,
  category,
}: {
  records: ImportedRecord[];
  category: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const relevant = recordsForCategory(records, category);
  if (!relevant.length) return null;
  const current = relevant.filter(isCurrentObservation);
  const undated = relevant.filter((r) => r.reporting_year == null);
  const history = historicalSeries(relevant);
  return (
    <section
      className="profile-data-section"
      aria-label={`${category} source data`}
    >
      {current.length > 0 && (
        <>
          <h2>
            {category === "Overview"
              ? "Institution details"
              : `${category} · 2025 onwards`}
          </h2>
          <EvidenceRows records={current} />
        </>
      )}
      {undated.length > 0 && (
        <details>
          <summary>Additional source records</summary>
          <EvidenceRows records={undated} />
        </details>
      )}
      {history.length > 0 && (
        <details className="profile-history" open={!current.length}>
          <summary>
            Historical {category.toLowerCase()} data <span>Before 2025</span>
          </summary>
          <p className="caption">
            Earlier observations are shown with their original year and
            population. They are not current requirements or prices.
          </p>
          {(expanded ? history : history.slice(0, 6)).map((series) => (
            <div className="profile-history-series" key={series[0].id}>
              {series.length > 1 ? (
                <HistoryChart
                  title={label(series[0].metric)}
                  unit={series[0].unit || ""}
                  records={series.map((r) => ({
                    id: r.id,
                    year: r.reporting_year,
                    value: Number(r.value),
                    source_id: r.source,
                    source_url: r.source_url,
                    notes: r.notes,
                    verified_at: r.last_verified_at,
                    verification_status: r.verification_status,
                    data_sources: {
                      id: r.source,
                      name: r.source_name,
                      url: r.source_url,
                      organization: null,
                      source_type: "dataset",
                      license_notes: r.license_note,
                      retrieved_at: r.retrieved_at,
                    },
                  }))}
                />
              ) : (
                <EvidenceRows records={series} />
              )}
            </div>
          ))}
          {history.length > 6 && (
            <button
              className="text-link"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded
                ? "Show less"
                : `Show all ${history.length} historical measures`}
            </button>
          )}
        </details>
      )}
    </section>
  );
}
