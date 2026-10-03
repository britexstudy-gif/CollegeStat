"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { University, currency, dateLabel } from "@/lib/domain";
import { deadlineLabel } from "@/lib/application-dates";
import { costBreakdown, similarity } from "@/lib/intelligence";
import { exploreUniversities } from "@/lib/supabase/catalogue";
import { defaultFilters } from "@/lib/research";
import { SourceDrawer } from "./metrics";
import { EmptyState } from "./primitives";
export function CostBreakdown({ university: u }: { university: University }) {
  const group = costBreakdown(u);
  if (!group) return null;
  const max = Math.max(1, ...group.items.map((c) => c.amount));
  return (
    <div className="cost-breakdown">
      <p className="caption">
        {group.year} · {group.studentCategory} · {group.currency} /{" "}
        {group.period}
      </p>
      {group.items.map((c) => (
        <div className="cost-line" key={c.id}>
          <div>
            <span>{c.category.replaceAll("_", " ")}</span>
            <SourceDrawer record={c} label={c.category}>
              {currency(c.amount, c.currency)}
            </SourceDrawer>
          </div>
          <div className="cost-track">
            <span style={{ width: `${(100 * c.amount) / max}%` }} />
          </div>
        </div>
      ))}
      <p className="caption">
        Reported components. An incomplete breakdown is not a total cost
        estimate.
      </p>
    </div>
  );
}
export function ProfileIntelligence({
  university: u,
  tab,
}: {
  university: University;
  tab: string;
}) {
  if (tab === "Research" && !u.professors.length && !u.research.length)
    return null;
  if (tab === "Research")
    return (
      <section className="evidence-section">
        <div className="eyebrow">PEOPLE & IDEAS</div>
        <h2>Research starts with people.</h2>
        {!u.professors.length && !u.research.length && (
          <EmptyState
            title="Faculty evidence is not yet available"
            description="Visit the official department directory for current research groups and faculty."
          />
        )}
        {u.professors.map((p) => (
          <article className="faculty-row" key={p.id}>
            <div className="faculty-initial" aria-hidden="true">
              {p.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </div>
            <div>
              <h3>{p.name}</h3>
              <p>{p.title}</p>
              <p className="caption">
                {u.departments.find((d) => d.id === p.department_id)?.name}
              </p>
              <div className="filter-chips">
                {p.research_areas.map((a) => (
                  <span key={a}>{a}</span>
                ))}
              </div>
              <p className="caption">{p.biography}</p>
              <div className="control-row">
                <a
                  className="text-link"
                  href={p.profile_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Official faculty profile ↗
                </a>
                <SourceDrawer record={p} label="Faculty verification">
                  Source · {dateLabel(p.verified_at)}
                </SourceDrawer>
              </div>
            </div>
          </article>
        ))}
        {u.research.map((r) => (
          <article className="research-lab" key={r.id}>
            <div className="eyebrow">RESEARCH GROUP</div>
            <h3>{r.title}</h3>
            <p>{r.summary}</p>
            <div className="control-row">
              <a
                className="text-link"
                href={r.official_url}
                target="_blank"
                rel="noreferrer"
              >
                Explore the lab ↗
              </a>
              <SourceDrawer record={r} label="Research source">
                Inspect source
              </SourceDrawer>
            </div>
          </article>
        ))}
      </section>
    );
  if (tab === "Deadlines")
    return (
      <section className="evidence-section">
        <h2>Dates with context.</h2>
        {!u.deadlines.length ? (
          <EmptyState
            title="No verified deadlines published"
            description="Deadlines vary by program, round, and applicant category. Check the official admissions site."
          />
        ) : (
          <ol className="deadline-timeline">
            {[...u.deadlines]
              .sort((a, b) => a.due_at.localeCompare(b.due_at))
              .map((d) => (
                <li key={d.id}>
                  <time dateTime={d.due_at}>{deadlineLabel(d)}</time>
                  <h3>{d.title}</h3>
                  <p className="caption">
                    {d.cycle} · {d.student_category}
                  </p>
                  <a
                    href={d.application_url}
                    className="text-link"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Application details ↗
                  </a>
                  <SourceDrawer record={d} label={d.title}>
                    Inspect source
                  </SourceDrawer>
                </li>
              ))}
          </ol>
        )}
        {u.admissions_url && (
          <a
            className="text-link"
            href={u.admissions_url}
            target="_blank"
            rel="noreferrer"
          >
            Official admissions ↗
          </a>
        )}
      </section>
    );
  if (tab === "Scholarships")
    return (
      <section className="evidence-section">
        <h2>Funding tied to this university.</h2>
        {!u.university_scholarships.some((l) => l.scholarships) ? (
          <p className="caption">
            Named institutional awards have not been verified yet. Use the
            university funding page and external programme directories below to
            identify options for your degree.
          </p>
        ) : (
          u.university_scholarships.map(
            ({ scholarships: s }) =>
              s && (
                <article className="research-lab" key={s.id}>
                  <h3>{s.name}</h3>
                  <p>{s.description}</p>
                  <p>
                    {s.amount === null
                      ? "Variable award"
                      : currency(s.amount, s.currency)}{" "}
                    · {s.level}
                  </p>
                  <SourceDrawer record={s} label={s.name}>
                    Award evidence
                  </SourceDrawer>
                  {s.application_url && (
                    <a
                      className="text-link"
                      href={s.application_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Eligibility & application ↗
                    </a>
                  )}
                </article>
              ),
          )
        )}
      </section>
    );
  if (tab === "Admissions")
    return (
      <section className="evidence-section requirement-section">
        {!!u.requirements.length && <h2>Entry requirements</h2>}
        {u.requirements.map((r) => (
          <article className="entry-policy" key={r.id}>
            <div className="entry-policy-description">
              <h3>{r.label}</h3>
              <p className="caption">{r.student_category}</p>
              {r.notes && <p className="entry-policy-note">{r.notes}</p>}
              <span className="entry-policy-status">
                {r.required === null
                  ? "See conditions"
                  : r.required
                    ? "Required"
                    : "Optional"}
              </span>
            </div>
            <div className="entry-policy-value">
              {r.minimum !== null && (
                <>
                  <small>Published minimum</small>
                  <strong>
                    {r.minimum}
                    {r.maximum !== null ? "–" + r.maximum : ""}
                  </strong>
                </>
              )}
              <SourceDrawer record={r} label={r.label}>
                View source ↗
              </SourceDrawer>
              {r.verified_at && (
                <small>Checked {dateLabel(r.verified_at)}</small>
              )}
            </div>
          </article>
        ))}
      </section>
    );
  return (
    <section className="evidence-section">
      {u.financial_aid_url && (
        <div className="official-funding-resource">
          <h2>Scholarships and financial aid</h2>
          <p>
            Check the university’s funding options, eligibility and application
            dates for your course and student category.
          </p>
          <a
            className="text-link"
            href={u.financial_aid_url}
            target="_blank"
            rel="noreferrer"
          >
            Explore official funding options ↗
          </a>
          {u.net_price_url && (
            <a
              className="text-link"
              href={u.net_price_url}
              target="_blank"
              rel="noreferrer"
            >
              Estimate your net price ↗
            </a>
          )}
        </div>
      )}
      {u.financial_aid.map((a) => (
        <article className="research-lab" key={a.id}>
          <h3>{a.name}</h3>
          <p>{a.eligibility}</p>
          <p className="caption">
            {a.student_category} ·{" "}
            {a.amount !== null && a.currency
              ? currency(a.amount, a.currency)
              : "Amount varies"}
          </p>
          <a
            className="text-link"
            href={a.application_url}
            target="_blank"
            rel="noreferrer"
          >
            Official financial aid ↗
          </a>
          <SourceDrawer record={a} label={a.name}>
            Inspect evidence
          </SourceDrawer>
        </article>
      ))}
    </section>
  );
}
export function SimilarUniversities({
  university: u,
}: {
  university: University;
}) {
  const [rows, setRows] = useState<University[]>([]),
    [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    exploreUniversities({ ...defaultFilters, country: u.country_code })
      .then((r) => {
        if (live) setRows(r.universities);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [u.country_code]);
  const matches = rows
    .filter((b) => b.id !== u.id)
    .map((b) => ({ university: b, ...similarity(u, b) }))
    .filter((b) => b.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return (
    <section className="evidence-section">
      <div className="eyebrow">EXPAND YOUR SHORTLIST</div>
      <h2>Related places to investigate.</h2>
      <p className="caption">
        Compared within up to 24 institutions in the same country. Shared
        characteristics describe similarity, not admission chances.
      </p>
      {error ? (
        <p role="status">Related universities are temporarily unavailable.</p>
      ) : matches.length ? (
        matches.map((m) => (
          <Link
            className="similar-row"
            key={m.university.id}
            href={"/university/" + m.university.slug}
          >
            <div>
              <h3>{m.university.name}</h3>
              <p className="caption">{m.reasons.join(" · ")}</p>
            </div>
            <span>↗</span>
          </Link>
        ))
      ) : (
        <p className="caption">
          More published institutions are needed for a useful comparison.
        </p>
      )}
    </section>
  );
}
