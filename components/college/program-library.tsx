"use client";
import { useLiquidGlass } from "./use-liquid-glass";
import { useState } from "react";
import { ArrowUpRight, GraduationCap, Search } from "lucide-react";
import type { University } from "@/lib/domain";
import {
  discoverPrograms,
  programLetter,
  programListings,
} from "@/lib/program-discovery";

export function ProgramLibrary({ university: u }: { university: University }) {
  const glass = useLiquidGlass<HTMLDivElement>();
  const all = programListings(u);
  const [query, setQuery] = useState(""),
    [degree, setDegree] = useState(""),
    [origin, setOrigin] = useState(
      all.some((p) => p.origin === "official") ? "official" : "",
    ),
    [letter, setLetter] = useState(""),
    [page, setPage] = useState(1);
  const filtered = discoverPrograms(all, { query, degree, origin, letter: "" });
  const letters = [
    ...new Set(filtered.map((p) => programLetter(p.name))),
  ].sort();
  const rows = discoverPrograms(filtered, {
    query: "",
    degree: "",
    origin: "",
    letter,
  });
  const pages = Math.max(1, Math.ceil(rows.length / 24));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * 24, current * 24);
  const directory = u.official_web?.links.programs?.url || u.website;
  const reset = () => {
    setQuery("");
    setDegree("");
    setOrigin("");
    setLetter("");
    setPage(1);
  };
  return (
    <section
      className="profile-library program-library"
      aria-labelledby="program-library-heading"
    >
      <div className="program-library-heading">
        <div>
          <h2 id="program-library-heading">Programs</h2>
          <p>
            Find a subject and degree level, then open the university’s listing
            for requirements and intake details.
          </p>
        </div>
        {directory && (
          <a
            className="button button-secondary"
            href={directory}
            target="_blank"
            rel="noreferrer"
          >
            University directory <ArrowUpRight size={15} />
          </a>
        )}
      </div>
      {all.length ? (
        <>
          <div ref={glass} data-glass="rim" className="program-filter-bar">
            <label>
              <span>
                <Search size={15} aria-hidden="true" />
                Search programs
              </span>
              <input
                className="filter-input"
                placeholder="Program or qualification"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLetter("");
                  setPage(1);
                }}
              />
            </label>
            <label>
              <span>Degree level</span>
              <select
                value={degree}
                onChange={(e) => {
                  setDegree(e.target.value);
                  setLetter("");
                  setPage(1);
                }}
              >
                <option value="">All degree levels</option>
                {[...new Set(all.map((p) => p.level))].sort().map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Listing type</span>
              <select
                value={origin}
                onChange={(e) => {
                  setOrigin(e.target.value);
                  setLetter("");
                  setPage(1);
                }}
              >
                <option value="">All records</option>
                <option value="official">Official program listings</option>
                <option value="reported">Reported qualifications</option>
              </select>
            </label>
          </div>
          <p className="program-result-count" role="status">
            {rows.length.toLocaleString()} matching records · A–Z order
          </p>
          <nav
            className="program-alphabet"
            aria-label="Filter programs by first letter"
          >
            <button
              aria-pressed={!letter}
              onClick={() => {
                setLetter("");
                setPage(1);
              }}
            >
              All
            </button>
            {letters.map((l) => (
              <button
                key={l}
                aria-pressed={letter === l}
                onClick={() => {
                  setLetter(l);
                  setPage(1);
                }}
              >
                {l}
              </button>
            ))}
          </nav>
          {origin !== "official" &&
            all.some((p) => p.origin === "reported") && (
              <p className="reference-note">
                Reported qualifications describe completed awards in the
                installed IPEDS release. They do not confirm current
                availability. Check the university directory for open intakes.
              </p>
            )}
          <div className="program-results">
            {[...new Set(shown.map((p) => programLetter(p.name)))].map((l) => (
              <section
                key={l}
                className="program-letter-group"
                aria-label={"Programs starting with " + l}
              >
                <h3>{l}</h3>
                <ul>
                  {shown
                    .filter((p) => programLetter(p.name) === l)
                    .map((p) => (
                      <li key={p.id}>
                        <div className="program-row-title">
                          <GraduationCap size={18} aria-hidden="true" />
                          <div>
                            {p.url ? (
                              <a href={p.url} target="_blank" rel="noreferrer">
                                {p.name}
                                <ArrowUpRight size={14} aria-hidden="true" />
                              </a>
                            ) : (
                              <strong>{p.name}</strong>
                            )}
                            <span>
                              {p.level}
                              {p.qualification !== p.level
                                ? " · " + p.qualification
                                : ""}
                            </span>
                          </div>
                        </div>
                        <div className="program-record-detail">
                          <span>
                            {p.origin === "official"
                              ? "Official listing"
                              : "Reported qualification"}
                          </span>
                          <small>
                            {p.origin === "official"
                              ? "Checked " + (p.checked || "date not supplied")
                              : p.year +
                                " · " +
                                p.completions?.toLocaleString() +
                                " completions"}
                          </small>
                          <span>
                            {p.origin === "official"
                              ? "Confirm intake on program page"
                              : "Current availability not confirmed"}
                          </span>
                          {p.sourceURL && (
                            <a
                              href={p.sourceURL}
                              target="_blank"
                              rel="noreferrer"
                            >
                              IPEDS source file{" "}
                              <ArrowUpRight size={12} aria-hidden="true" />
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
          {!rows.length && (
            <div className="program-empty">
              <h3>No programs match these filters.</h3>
              <p>Try another name, degree level or listing type.</p>
              <button className="text-link" onClick={reset}>
                Reset program filters
              </button>
            </div>
          )}
          {pages > 1 && (
            <nav
              className="library-pagination"
              aria-label="Program result pages"
            >
              <button
                className="button button-secondary"
                disabled={current <= 1}
                onClick={() => setPage(current - 1)}
              >
                ← Previous
              </button>
              <span>
                {current} / {pages}
              </span>
              <button
                className="button button-secondary"
                disabled={current >= pages}
                onClick={() => setPage(current + 1)}
              >
                Next →
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="program-empty">
          <GraduationCap size={24} aria-hidden="true" />
          <h3>Start with the university’s program directory.</h3>
          <p>
            A named program list has not been linked here yet. Use the official
            directory to check available bachelor’s, master’s and doctoral
            programs, teaching language and application dates.
          </p>
        </div>
      )}
    </section>
  );
}
