"use client";
import { useState } from "react";
import records from "@/data/published/regional-rankings.json";
import Link from "next/link";
import { UniversityLogo, type UniversityIdentity } from "./primitives";

export function RegionalRankingLibrary({ universities = {} }: { universities?: Record<string, UniversityIdentity> }) {
  const [scope, setScope] = useState("Asia");
  const [query, setQuery] = useState("");
  const [descending, setDescending] = useState(false);
  const rows = records
    .filter(
      (r) =>
        r.scope === scope &&
        r.name.toLowerCase().includes(query.toLowerCase().trim()),
    )
    .sort(
      (a, b) =>
        (Number(a.rank_label.replace("=", "")) -
          Number(b.rank_label.replace("=", ""))) *
        (descending ? -1 : 1),
    );
  return (
    <section className="regional-library" id="regional-tables">
      <header>
        <span className="eyebrow">REGIONAL RANKINGS</span>
        <h2>Compare regional positions.</h2>
        <p>
          Official QS regional positions use a separate methodology from the
          world table above. This is a sourced selection of {records.length}{" "}
          positions, not the full regional rankings.
        </p>
      </header>
      <div className="regional-library-controls">
        <label>
          Regional edition
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option>Asia</option>
            <option>Europe</option>
          </select>
        </label>
        <label>
          University
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find in this selection…"
          />
        </label>
        <label>
          Order
          <select
            value={descending ? "desc" : "asc"}
            onChange={(e) => setDescending(e.target.value === "desc")}
          >
            <option value="asc">Highest ranked first</option>
            <option value="desc">Lowest ranked first</option>
          </select>
        </label>
      </div>
      <div className="regional-library-table">
        <div className="regional-library-labels">
          <span>QS {scope} 2026</span>
          <span>University</span>
          <span>Evidence</span>
        </div>
        {rows.map((r) => (
          <article
            key={r.domain}
          >
            <strong>
              {r.rank_label.startsWith("=") ? r.rank_label : "#" + r.rank_label}
            </strong>
            <div className="regional-university">
              {universities[r.domain] && <UniversityLogo university={universities[r.domain]} size="sm" />}
              {universities[r.domain] ? <Link href={"/university/" + universities[r.domain].slug}>{r.name}<small>View university →</small></Link> : <span>{r.name}</span>}
            </div>
            <a href={r.source_url} target="_blank" rel="noreferrer" className="regional-source">QS source ↗</a>
          </article>
        ))}
      </div>
      {!rows.length && (
        <p>
          No university in this selection matches. Try the full publisher table
          below.
        </p>
      )}
      <div className="funding-footer">
        <p>
          “=” marks a tied position. Checked 30 September 2026. Institutions
          outside this selection may still appear in the full table.
        </p>
        <a
          className="text-link"
          target="_blank"
          rel="noreferrer"
          href={
            scope === "Asia"
              ? "https://www.topuniversities.com/asia-university-rankings"
              : "https://www.topuniversities.com/europe-university-rankings"
          }
        >
          Full QS {scope} table ↗
        </a>
      </div>
    </section>
  );
}
