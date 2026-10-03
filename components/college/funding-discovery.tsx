import Link from "next/link";
import { ArrowUpRight, Globe2, GraduationCap, Trophy } from "lucide-react";
import { fundingRoutes } from "@/lib/funding-routes";
import type { University } from "@/lib/domain";
export function FundingDiscovery({
  university,
  home = false,
}: {
  university?: University;
  home?: boolean;
}) {
  const direct =
    university?.financial_aid_url ||
    university?.official_web?.links.scholarships?.url;
  return (
    <section className={"funding-discovery " + (home ? "home-funding" : "")}>
      <header className="funding-discovery-heading">
        <div>
          <span className="section-caption">SCHOLARSHIPS & FINANCIAL AID</span>
          <h2>
            {home
              ? "Find scholarships and funding."
              : "Official funding programmes."}
          </h2>
          <p>
            {university
              ? `Start with ${university.short_name || university.name}’s funding rules, then explore external programmes.`
              : "Explore official scholarship programmes, understand eligibility, and plan for the costs an award may not cover."}
          </p>
        </div>
        {home && (
          <Link className="text-link" href="/scholarships">
            Explore scholarships <ArrowUpRight size={17} />
          </Link>
        )}
      </header>
      {university && (
        <div className="funding-university">
          <div>
            <h3>University funding</h3>
            <p>
              Confirm your citizenship category, degree, funding deadline, and
              whether a separate scholarship application is required.
            </p>
          </div>
          {(direct || university.website) && (
            <a
              className="button button-secondary"
              href={direct || university.website!}
              target="_blank"
              rel="noreferrer"
            >
              {direct ? "Official funding page" : "University website"} ↗
            </a>
          )}
        </div>
      )}
      <div className="funding-route-grid">
        {fundingRoutes.map((r) => {
          const Icon =
            r.id === "erasmus"
              ? Globe2
              : r.id === "daad"
                ? GraduationCap
                : Trophy;
          return (
            <article key={r.id}>
              <span className="product-icon">
                <Icon size={22} aria-hidden="true" />
              </span>
              <div className="funding-tags">
                <span>{r.destination}</span>
                <span>{r.level}</span>
              </div>
              <h3>{r.name}</h3>
              <p>{r.summary}</p>
              <p className="funding-step">{r.steps}</p>
              <a
                className="text-link"
                href={r.url}
                target="_blank"
                rel="noreferrer"
              >
                View official programme <ArrowUpRight size={16} />
              </a>
            </article>
          );
        })}
      </div>
      <div className="funding-footer">
        <p>
          External programmes have their own university, course, nationality,
          and eligibility rules. Listings do not confirm that a particular
          university participates. Sources checked 30 September 2026.
        </p>
        <Link href="/resources/funding" className="text-link">
          Build a funding budget →
        </Link>
      </div>
    </section>
  );
}
