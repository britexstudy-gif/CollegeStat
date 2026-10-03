"use client";
import { useState } from "react";
import type { University } from "@/lib/domain";
import { uniquePapers } from "@/lib/profile-library";
export function ResearchLibrary({ university: u }: { university: University }) {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState("newest");
  const [page, setPage] = useState(1);
  const r = u.research_identity;
  const papers = uniquePapers(r?.papers || [])
    .filter((p) =>
      (p.title + " " + p.authors.join(" ") + " " + p.venue)
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      order === "citations"
        ? b.citations - a.citations || b.date.localeCompare(a.date)
        : b.date.localeCompare(a.date),
    );
  const pages = Math.max(1, Math.ceil(papers.length / 10));
  if (!r)
    return (
      <section className="profile-library">
        <h2>Research publications</h2>
        <p>
          Publication metadata has not been linked for this institution yet.
        </p>
        {u.website && (
          <a
            className="text-link"
            href={u.official_web?.links.research?.url || u.website}
            target="_blank"
            rel="noreferrer"
          >
            Explore the official university website ↗
          </a>
        )}
      </section>
    );
  return (
    <section className="profile-library">
      <h2>Research & recent papers</h2>
      <p>
        Matched to the university’s ROR identity in OpenAlex. Bibliographic
        identity checked {r.retrieved_at}; papers checked{" "}
        {r.papers_checked_at || r.retrieved_at}. Coverage varies by institution
        and publication.
      </p>
      <div className="student-snapshot-facts">
        <div>
          <strong>{r.works_count.toLocaleString()}</strong>
          <p>Indexed works · all years</p>
        </div>
        <div>
          <strong>{r.cited_by_count.toLocaleString()}</strong>
          <p>Indexed citations · all years</p>
        </div>
        {r.recent_works_count != null && (
          <div>
            <strong>{r.recent_works_count.toLocaleString()}</strong>
            <p>
              Articles, reviews & preprints ·{" "}
              {r.papers_from_date || "2025-01-01"} to{" "}
              {r.papers_to_date || r.papers_checked_at || r.retrieved_at}
            </p>
          </div>
        )}
      </div>
      {r.papers.length > 0 && (
        <div className="paper-controls">
          <input
            className="filter-input"
            aria-label="Search research papers"
            placeholder="Search titles, authors, or journals…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="filter-input"
            aria-label="Sort research papers"
            value={order}
            onChange={(e) => {
              setOrder(e.target.value);
              setPage(1);
            }}
          >
            <option value="newest">Newest first</option>
            <option value="citations">Most cited first</option>
          </select>
        </div>
      )}
      <div className="paper-list">
        {papers.slice((page - 1) * 10, page * 10).map((p) => (
          <article key={p.id}>
            <p className="section-caption">
              {p.date} · {p.type}
            </p>
            <h3>
              <a href={p.url} target="_blank" rel="noreferrer">
                {p.title} ↗
              </a>
            </h3>
            <p>
              {p.authors.join(", ")}
              {p.authors.length === 5 ? " et al." : ""}
            </p>
            <p>
              {p.venue || "Publication venue not supplied"} · {p.citations}{" "}
              indexed citations
            </p>
            {p.open_access_url && (
              <a
                className="text-link"
                href={p.open_access_url}
                target="_blank"
                rel="noreferrer"
              >
                Open-access version ↗
              </a>
            )}
          </article>
        ))}
      </div>
      {r.papers.length > 0 && (
        <div className="library-pagination">
          <button
            className="button button-secondary"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            ← Previous
          </button>
          <span>
            {papers.length} papers · {page} / {pages}
          </span>
          <button
            className="button button-secondary"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next →
          </button>
        </div>
      )}
      {!!r.papers.length && !papers.length && (
        <p>No papers match your search.</p>
      )}
      {!r.papers.length && (
        <p>
          Recent paper records are not in this local download yet. This does not
          mean the institution has no recent research.
        </p>
      )}
      <a
        className="text-link"
        href={r.openalex_id}
        target="_blank"
        rel="noreferrer"
      >
        Explore the full OpenAlex research record ↗
      </a>
    </section>
  );
}

export function PublisherSubjects({
  university: u,
}: {
  university: University;
}) {
  const subjects = u.publisher_students?.subjects || [];
  if (!subjects.length) return null;
  return (
    <section className="profile-library">
      <h2>Subjects at this university</h2>
      <p>
        {subjects.length} subject areas listed in the THE 2026 institutional
        profile. These are broad subjects, not named degree programs or
        confirmation of current admission availability.
      </p>
      <div className="subject-list">
        {subjects.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      <a
        className="text-link"
        href={u.publisher_students!.source_url}
        target="_blank"
        rel="noreferrer"
      >
        THE university profile ↗
      </a>
      {u.website && (
        <a
          className="text-link"
          href={u.website}
          target="_blank"
          rel="noreferrer"
        >
          Official course catalogue & requirements ↗
        </a>
      )}
    </section>
  );
}
