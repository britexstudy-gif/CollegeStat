import { applicationRoute } from "@/lib/application-routes";
import type { University } from "@/lib/domain";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  FileCheck2,
  Send,
  Wallet,
} from "lucide-react";
import { ApplicationPlatformBadge } from "./application-platform";

export function ApplicationGuide({
  university: u,
}: {
  university: University;
}) {
  const route = applicationRoute(u);
  return (
    <section className="application-guide">
      <div className="application-guide-heading">
        <h2>How to apply</h2>
        <p>Follow the official route for your degree and applicant category.</p>
      </div>
      {route ? (
        <div className="application-route-layout">
          <div className="application-route-summary">
            <ApplicationPlatformBadge route={route} university={u} />
            <span className="section-caption">
              {route.kind === "institution"
                ? "University application"
                : "Application platform guide"}
            </span>
            <h3>{route.name}</h3>
            <p>{route.scope}</p>
            {route.kind === "country-guide" && (
              <p className="route-membership-note">
                <Check size={15} aria-hidden="true" />
                Confirm this platform on the university’s admissions page first.
              </p>
            )}
            <a
              href={route.url}
              target="_blank"
              rel="noreferrer"
              className="button button-primary"
            >
              Open {route.name} <ArrowUpRight size={17} />
            </a>
            <details className="route-source">
              <summary>Source & checked date</summary>
              <a href={route.source} target="_blank" rel="noreferrer">
                Official process source ↗
              </a>
              <p>Checked {route.checked}</p>
            </details>
          </div>
          <ol className="route-process" aria-label="Application steps">
            {route.steps.map((step, i) => (
              <li key={step}>
                <span className="route-step-number">{i + 1}</span>
                <p>{step}</p>
                {i === route.steps.length - 1 && (
                  <Send size={18} aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="application-route-layout">
          <div className="application-route-summary">
            <ApplicationPlatformBadge university={u} />
            <h3>Start with the university</h3>
            <p>
              Check the application instructions for your course and entry year.
              The admissions office will confirm the portal and documents you
              need.
            </p>
            {(u.admissions_url || u.website) && (
              <a
                className="button button-primary"
                href={u.admissions_url || u.website!}
                target="_blank"
                rel="noreferrer"
              >
                Open admissions guidance <ArrowUpRight size={17} />
              </a>
            )}
          </div>
        </div>
      )}
      <div className="preparation-heading">
        <h3>Prepare before you submit</h3>
        <p className="caption">
          Use your course’s current requirements as your checklist.
        </p>
      </div>
      <div className="application-preparation">
        {[
          {
            icon: BookOpen,
            title: "Choose a course",
            text: "Confirm the degree, teaching language, campus, and entry requirements.",
          },
          {
            icon: FileCheck2,
            title: "Gather documents",
            text: "Prepare qualifications, translations, references, and any test results.",
          },
          {
            icon: Wallet,
            title: "Plan your funding",
            text: "Check tuition, living costs, aid eligibility, and scholarship applications.",
          },
          {
            icon: CalendarDays,
            title: "Check the deadline",
            text: "Allow time for documents and submit before the correct closing date.",
          },
        ].map(({ icon: Icon, title, text }) => (
          <article key={title}>
            <span className="product-icon">
              <Icon size={21} aria-hidden="true" />
            </span>
            <h4>{title}</h4>
            <p>{text}</p>
          </article>
        ))}
      </div>
      {(u.address || u.phone) && (
        <address>
          {u.address && <p>{u.address}</p>}
          {u.phone && (
            <a href={`tel:${u.phone.replace(/[^+\d]/g, "")}`}>{u.phone}</a>
          )}
        </address>
      )}
      {u.contact_email && (
        <p>
          <a href={`mailto:${u.contact_email}`}>{u.contact_email}</a>
        </p>
      )}
      {u.contact_email && (
        <p className="caption">
          <a
            href={u.contact_source_url || undefined}
            target="_blank"
            rel="noreferrer"
          >
            Contact and social-link source ↗
          </a>
        </p>
      )}
      {!!u.social_links?.length && (
        <p className="caption">
          <a
            href={u.social_source_url || undefined}
            target="_blank"
            rel="noreferrer"
          >
            Social-account source ↗
          </a>
        </p>
      )}
      {u.identity_release && (
        <p className="caption">
          Official links from {u.identity_release}.{" "}
          <a href={u.reference_url} target="_blank" rel="noreferrer">
            View source ↗
          </a>
        </p>
      )}
    </section>
  );
}
