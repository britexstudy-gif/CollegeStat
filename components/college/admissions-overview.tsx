"use client";
import { useState } from "react";
import {
  CalendarDays,
  FileCheck2,
  ArrowUpRight,
  ListChecks,
} from "lucide-react";
import type { University } from "@/lib/domain";
import {
  applicationChecklist,
  type ApplicationLevel,
} from "@/lib/admission-guidance";
import { OfficialApplicationLinks } from "./application-platform";
export function AdmissionsOverview({
  university: u,
}: {
  university: University;
}) {
  const brief = u.application_brief;
  const [level, setLevel] = useState<ApplicationLevel>("undergraduate");
  const requirements =
    brief?.requirements_source ||
    u.official_web?.links.requirements?.url ||
    u.admissions_url ||
    u.website;
  const admissions =
    u.admissions_url || u.official_web?.links.admissions?.url || u.website;
  return (
    <section className="admissions-overview">
      <div className="admissions-heading">
        <div>
          <h2>Requirements & dates</h2>
          <p>
            Confirm these for your course, applicant category, and entry year.
          </p>
        </div>
      </div>
      <div className="admissions-cards admissions-detail-cards">
        <article>
          <span className="product-icon">
            <FileCheck2 size={22} aria-hidden="true" />
          </span>
          <h3>What you need</h3>
          <p>
            {brief
              ? "Read the university guidance below, then check any extra requirements for your course."
              : "Check your qualifications, language tests, documents, and any entrance assessment with the university."}
          </p>
          {requirements && (
            <a
              className="text-link"
              href={requirements}
              target="_blank"
              rel="noreferrer"
            >
              Check entry requirements <ArrowUpRight size={15} />
            </a>
          )}
        </article>
        <article>
          <span className="product-icon">
            <CalendarDays size={22} aria-hidden="true" />
          </span>
          <h3>When to apply</h3>
          <p>
            Find the deadline for your course and application round. Check the
            entry year and time zone before submitting.
          </p>
          {admissions && (
            <a
              className="text-link"
              href={admissions}
              target="_blank"
              rel="noreferrer"
            >
              Check application dates <ArrowUpRight size={15} />
            </a>
          )}
        </article>
      </div>
      {brief && (
        <div className="requirements-checklist">
          <h3>Published application guidance</h3>
          <p className="caption">
            {brief.scope || "First-year undergraduate applicants"} · Summary of
            the linked university guidance.
          </p>
          <ul>
            {brief.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <a
            className="text-link"
            href={brief.requirements_source}
            target="_blank"
            rel="noreferrer"
          >
            University requirements · checked {brief.checked_at}{" "}
            <ArrowUpRight size={15} />
          </a>
        </div>
      )}
      <details className="requirements-planner" open={!brief || undefined}>
        <summary>
          <ListChecks size={18} aria-hidden="true" /> What to confirm for your
          application
        </summary>
        <div className="requirements-planner-controls">
          <label htmlFor="requirements-degree">Study level</label>
          <select
            id="requirements-degree"
            value={level}
            onChange={(event) =>
              setLevel(event.target.value as ApplicationLevel)
            }
          >
            <option value="undergraduate">Undergraduate</option>
            <option value="postgraduate">Postgraduate</option>
          </select>
        </div>
        <p className="caption">
          Use this planning checklist with the official course page. The
          university sets the exact requirements.
        </p>
        <dl className="requirements-planner-grid">
          {applicationChecklist(level).map((item) => (
            <div key={item.title}>
              <dt>{item.title}</dt>
              <dd>{item.text}</dd>
            </div>
          ))}
        </dl>
        {requirements && (
          <a
            className="text-link"
            href={requirements}
            target="_blank"
            rel="noreferrer"
          >
            {brief || u.official_web?.links.requirements
              ? "Open published requirements"
              : "Find requirements on the university website"}
            <ArrowUpRight size={15} />
          </a>
        )}
      </details>
      <h3 className="official-links-heading">Useful university links</h3>
      <OfficialApplicationLinks university={u} />
    </section>
  );
}
