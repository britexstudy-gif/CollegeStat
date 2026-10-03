"use client";
import {
  ResearchLibrary,
  PublisherSubjects,
} from "@/components/college/profile-library";
import { ProgramLibrary } from "@/components/college/program-library";
import { PublisherProfile } from "@/components/college/publisher-profile";
import { LinkedScholarships } from "@/components/college/linked-scholarships";
import { FundingDiscovery } from "@/components/college/funding-discovery";
import {
  CampusNextSteps,
  AcademicNextSteps,
  ProfileSourceLinks,
} from "@/components/college/profile-next-steps";
import {
  RegionalProfilePositions,
  SubjectRankingPathways,
} from "@/components/college/ranking-pathways";
import { RankingContext } from "@/components/college/ranking-context";
import { NotablePeople } from "@/components/college/notable-people";
import { AdmissionsOverview } from "@/components/college/admissions-overview";
import { CurrentGuidance } from "@/components/college/current-guidance";
import { rememberUniversity } from "@/components/college/recent-exploration";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Check, ExternalLink, ArrowRight } from "lucide-react";
import { ApplicationPlatformBadge } from "@/components/college/application-platform";
import { ProfileNavigation } from "@/components/college/profile-navigation";
import { UniversityContactButtons } from "@/components/college/university-contact-buttons";
import { applicationRoute } from "@/lib/application-routes";
import { University, countryName, admission, currency } from "@/lib/domain";
import { universityBySlug } from "@/lib/supabase/catalogue";
import { getSupabase } from "@/lib/supabase/client";
import { useCollege } from "@/components/college/provider";
import { UniversityLogo, EmptyState } from "@/components/college/primitives";
import { Metric, SourceDrawer, FitPanel } from "@/components/college/metrics";
import { SaveButton } from "@/components/college/save-button";
import { CampusGallery } from "@/components/college/campus-gallery";
import { campusGallery } from "@/lib/campus-gallery";
import { CampusImage } from "@/components/college/campus-image";
import {
  ProfileIntelligence,
  SimilarUniversities,
  CostBreakdown,
} from "@/components/college/profile-intelligence";
import { RankingBadges } from "@/components/college/ranking-badges";
import { PublisherStudents } from "@/components/college/publisher-students";
import { RankingScores } from "@/components/college/ranking-scores";
import { ApplicationDates } from "@/components/college/application-dates";
import { ApplicationGuide } from "@/components/college/application-guide";
import { universityRanks } from "@/lib/ranking-highlights";
import { ProfileData } from "@/components/college/profile-data";
import {
  profileNavigation,
  profileSection,
  latestReportedCosts,
} from "@/lib/profile-navigation";
import { profileCategories, recordsForCategory } from "@/lib/profile-records";
import { HistoryChart } from "@/charts/research-charts";
import { UniversityMap } from "@/components/college/university-map";
import { valueOf, metricDefinitions, Preferences } from "@/lib/research";
export default function UniversityPage({
  slug,
  initialUniversity,
}: {
  slug: string;
  initialUniversity?: University;
}) {
  const s = useCollege(),
    params = useSearchParams(),
    router = useRouter(),
    tab = profileSection(params.get("tab"));
  const [u, setU] = useState<University | undefined>(
      initialUniversity || s.universities.find((u) => u.slug === slug),
    ),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    if (initialUniversity?.slug === slug) {
      setU(initialUniversity);
      setError("");
      setLoading(false);
      return;
    }
    let live = true;
    universityBySlug(slug)
      .then((u) => {
        if (live) {
          setU(u);
          setLoading(false);
        }
      })
      .catch(() => {
        if (live) {
          setError("This university could not be loaded.");
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [slug, initialUniversity]);
  useEffect(() => {
    if (u) rememberUniversity(u.id);
    if (!u || !s.user) return;
    const db = getSupabase();
    void db?.from("research_history").upsert(
      {
        user_id: s.user.id,
        university_id: u.id,
        viewed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,university_id" },
    );
  }, [u, s.user]);
  if (!u)
    return (
      <EmptyState
        title={
          loading ? "Loading university…" : error || "University not found"
        }
        description="Explore the directory to find a published institution."
        action={
          <Link href="/universities" className="button button-primary">
            Open explorer
          </Link>
        }
      />
    );
  const route = applicationRoute(u);
  const recentAdmissions = u.admissions;
  const a = admission({ ...u, admissions: recentAdmissions });
  const all = [
    ...u.data_points,
    ...u.costs,
    ...u.admissions,
    ...u.ranking_entries,
    ...u.departments,
    ...u.professors,
    ...u.research,
    ...u.deadlines,
    ...u.requirements,
    ...u.financial_aid,
    ...u.media,
  ];
  const importedRecords = u.imported_records || [];
  const costs = latestReportedCosts(u.costs);
  return (
    <div className="research-page profile-page">
      <Link className="text-link" href="/universities">
        ← University explorer
      </Link>
      <CampusImage media={campusGallery(u.media)[0]} priority />
      <header className="profile-hero">
        <UniversityLogo university={u} size="xl" />
        <div>
          <div className="eyebrow">UNIVERSITY PROFILE</div>
          <h1>{u.name}</h1>
          <p>
            {u.city ? u.city + " · " : ""}
            {countryName(u.country_code)}
            {u.university_type ? " · " + u.university_type : ""}
          </p>
        </div>
        <div className="control-row">
          <SaveButton id={u.id} />
          <button
            className="button button-primary"
            onClick={() => s.toggleCompare(u.id)}
          >
            {s.compare.includes(u.id) ? (
              <Check size={15} />
            ) : (
              <Plus size={15} />
            )}
            Compare
          </button>
        </div>
      </header>
      <UniversityContactButtons university={u} />
      {tab !== "Admissions" && (
        <div className="profile-action-strip">
          <ApplicationPlatformBadge route={route} university={u} />
          <div>
            <span className="eyebrow">
              {route?.kind === "country-guide"
                ? "APPLICATION PLATFORM GUIDE"
                : "APPLICATION ROUTE"}
            </span>
            <h2>{route?.name || "Plan your application"}</h2>
            <p>
              {route?.scope ||
                "Find the official application route and programme requirements."}
            </p>
          </div>
          <Link
            className="button button-primary"
            href={"/university/" + u.slug + "?tab=How%20to%20apply"}
          >
            View steps <ArrowRight size={16} />
          </Link>
        </div>
      )}
      <RankingBadges university={u} />
      <RegionalProfilePositions university={u} />
      {(["admission", "tuition", "enrollment", "aid_recipients"] as const).some(
        (key) => valueOf(u, key).value !== null,
      ) && (
        <div className="stats-row">
          {(["admission", "tuition", "enrollment", "aid_recipients"] as const)
            .filter((key) => valueOf(u, key).value !== null)
            .map((key) => (
              <div key={key}>
                <Metric university={u} metricKey={key} />
              </div>
            ))}
        </div>
      )}
      {valueOf(u, "admission").value == null && (
        <p className="caption">
          Application guidance and official links are available below. An
          acceptance rate is not yet linked for this university.
        </p>
      )}
      <ProfileNavigation
        selected={tab}
        onSelect={(section) =>
          router.replace("?tab=" + encodeURIComponent(section), {
            scroll: false,
          })
        }
      />
      <div id="university-panel" role="tabpanel" aria-labelledby={"section-" + tab} tabIndex={0}>
      {["Overview", "Admissions"].includes(tab) && <ApplicationDates university={u}/>}
      {tab === "Gallery" && <CampusGallery university={u}/>}
      {tab === "Admissions" && (
        <>
          <ApplicationGuide university={u} />
          <AdmissionsOverview university={u} />
        </>
      )}
      {tab === "Overview" && (
        <>
          <div className="detail-grid">
            <section className="panel">
              <div className="eyebrow">THE BIGGER PICTURE</div>
              <h2>
                Why explore{" "}
                {u.short_name === "S" ? "Stanford" : u.short_name || u.name}?
              </h2>
              <p className="muted" style={{ lineHeight: 1.9 }}>
                {u.description}
              </p>
              <dl className="profile-facts-list">
                <div>
                  <dt>Country</dt>
                  <dd>{countryName(u.country_code)}</dd>
                </div>
                {u.city && (
                  <div>
                    <dt>City</dt>
                    <dd>{u.city}</dd>
                  </div>
                )}
                {u.founded_year && (
                  <div>
                    <dt>Established</dt>
                    <dd>{u.founded_year}</dd>
                  </div>
                )}
                {u.website && (
                  <div>
                    <dt>Official website</dt>
                    <dd>
                      <a href={u.website} target="_blank" rel="noreferrer">
                        {new URL(u.website).hostname}
                        <ExternalLink size={12} />
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
              {u.reference_url?.includes("github.com/Hipo") && (
                <p className="caption">
                  Identity supplied by the community-maintained Hipo directory.
                  A listing does not confirm accreditation.
                </p>
              )}
              <div className="control-row" style={{ marginTop: 24 }}>
                <Link
                  href={"/research?university=" + u.id}
                  className="button button-secondary"
                >
                  Ask about this university →
                </Link>
                {u.reference_url && (
                  <a
                    className="text-link"
                    href={u.reference_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Profile source
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </section>
            {s.user && Object.keys(s.profile?.preferences || {}).length > 0 && (
              <FitPanel
                university={u}
                preferences={(s.profile?.preferences || {}) as Preferences}
              />
            )}
          </div>
          <div className="detail-grid">
            <section className="panel">
              <h2>Explore this university</h2>
              {importedRecords.length ? (
                <>
                  <p className="caption">
                    Available figures retain their reporting year and student
                    group.
                  </p>
                  <div className="profile-category-links">
                    {profileCategories
                      .filter(
                        (c) => recordsForCategory(importedRecords, c).length,
                      )
                      .map((category) => (
                        <button
                          className="text-link"
                          key={category}
                          onClick={() =>
                            router.replace(
                              "?tab=" + encodeURIComponent(category),
                              { scroll: false },
                            )
                          }
                        >
                          {category} →
                        </button>
                      ))}
                  </div>
                </>
              ) : (
                <p className="caption">
                  This profile currently includes directory details and official
                  links. Visit the university’s website for its current courses,
                  fees and admissions requirements.
                </p>
              )}
            </section>
            <section className="panel">
              <h2>Your next research steps</h2>
              <p className="caption">
                Check the latest requirements directly. Compare costs for the
                same student category. Verify funding eligibility before
                applying.
              </p>
              <div className="tabs-row">
                <button onClick={() => router.replace("?tab=Admissions")}>
                  Admission requirements →
                </button>
              </div>
              <div className="tabs-row">
                <button onClick={() => router.replace("?tab=Sources")}>
                  Review source coverage →
                </button>
              </div>
            </section>
          </div>
        </>
      )}
      {tab === "Research" && (
        <ProfileIntelligence university={u} tab="Research" />
      )}
      {["Admissions", "Costs"].includes(tab) && (
        <CurrentGuidance
          university={u}
          category={tab === "Costs" ? "Funding" : undefined}
        />
      )}
      {tab === "Research" && <ResearchLibrary university={u} />}
      {tab === "Costs" && (
        <>
          <LinkedScholarships university={u} />
          <FundingDiscovery university={u} />
        </>
      )}
      {tab === "Research" && <NotablePeople university={u} />}
      {tab === "Academics" && (
        <>
          <ProgramLibrary key={u.id} university={u} />
          <SubjectRankingPathways university={u} />
          <PublisherSubjects university={u} />
          <AcademicNextSteps university={u} />
        </>
      )}
      {["Campus", "Sources"].includes(tab) && (
        <PublisherProfile university={u} />
      )}
      {tab === "Overview" && <SimilarUniversities university={u} />}
      {tab === "Admissions" && (
        <ProfileIntelligence university={u} tab="Admissions" />
      )}
      {tab === "Admissions" && recentAdmissions.length > 0 && (
        <div className="detail-grid">
          <section className="panel">
            <HistoryChart
              title="Reported admission rate"
              unit="%"
              records={u.admissions
                .filter((r) => !r.program_id)
                .map((r) => ({ ...r, value: r.acceptance_rate }))}
            />
            <p className="caption">
              Different years can represent different applicant populations.
              Rates are descriptive, not personal probabilities.
            </p>
          </section>
          <section className="panel">
            <h2>Reported admissions · {a?.year || "year not stated"}</h2>
            <p className="caption">
              These describe the reported applicant group. Test ranges are
              historical context; confirm current entry requirements with the
              admissions office.
            </p>
            <table className="research-table">
              <tbody>
                {[
                  [
                    "SAT range",
                    a?.sat_min != null
                      ? `${a.sat_min}–${a.sat_max ?? "—"}`
                      : "—",
                  ],
                  [
                    "ACT range",
                    a?.act_min != null
                      ? `${a.act_min}–${a.act_max ?? "—"}`
                      : "—",
                  ],
                  ["IELTS minimum", a?.ielts_min ?? "—"],
                  ["TOEFL minimum", a?.toefl_min ?? "—"],
                  ["Deadline", a?.deadline ?? "—"],
                  [
                    "Requirements",
                    a?.requirements ??
                      "Consult the official admissions website.",
                  ],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>
                      <SourceDrawer label={String(label)} record={a}>
                        {value}
                      </SourceDrawer>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
      {tab === "Costs" && costs.length > 0 && (
        <div className="detail-grid">
          <section className="panel">
            <h2>Annual costs, in context</h2>
            <CostBreakdown
              university={{
                ...u,
                costs,
              }}
            />
            <p className="caption">
              Amounts retain their source currency and student category. Total
              cost is not inferred from an incomplete breakdown.
            </p>
            <table className="research-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Year</th>
                </tr>
              </thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.category}
                      <small className="caption"> · {c.student_category}</small>
                    </td>
                    <td>
                      <SourceDrawer record={c} label={c.category}>
                        {currency(c.amount, c.currency)} / {c.period}
                      </SourceDrawer>
                    </td>
                    <td>{c.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="panel">
            <HistoryChart
              title="Tuition history · USD"
              unit=" USD"
              records={u.costs
                .filter(
                  (c) =>
                    c.category === "tuition" &&
                    c.currency === "USD" &&
                    c.period === "year" &&
                    c.student_category === "international",
                )
                .map((c) => ({ ...c, value: c.amount }))}
            />
          </section>
        </div>
      )}
      {tab === "Costs" && (
        <ProfileIntelligence university={u} tab="Financial Aid" />
      )}
      {tab === "Campus" && <PublisherStudents university={u} />}
      {["Costs", "Campus"].includes(tab) && (
        <div className="detail-grid">
          {metricDefinitions
            .filter(
              (m) =>
                (tab === "Costs"
                  ? m.group === "Financial aid"
                  : ["Students", "Outcomes"].includes(m.group)) &&
                u.data_points.some((d) => d.metric === m.key),
            )
            .map((m) => (
              <section className="panel" key={m.key}>
                <Metric university={u} metricKey={m.key} />
                <HistoryChart
                  title={m.label + " history"}
                  unit={m.unit === "currency" ? "Original currency" : m.unit}
                  records={u.data_points.filter((d) => d.metric === m.key)}
                />
              </section>
            ))}
        </div>
      )}
      {tab === "Rankings" && (
        <section className="panel">
          <h2>Across the rankings</h2>
          <RankingBadges university={u} />
          <RankingScores university={u} />
          <RankingContext university={u} />
          <PublisherProfile university={u} history />
          {universityRanks(u).length > 0 && (
            <p className="caption">
              Each position links to its source. Editions are shown separately;
              these positions are not a combined score.
            </p>
          )}
          {Array.from(
            new Set(
              u.ranking_entries.map((r) =>
                [
                  r.ranking_editions?.provider_id,
                  r.ranking_editions?.subject,
                  r.ranking_editions?.region,
                ].join("|"),
              ),
            ),
          ).map((key) => {
            const rows = u.ranking_entries.filter(
              (r) =>
                [
                  r.ranking_editions?.provider_id,
                  r.ranking_editions?.subject,
                  r.ranking_editions?.region,
                ].join("|") === key,
            );
            const edition = rows[0]?.ranking_editions;
            return (
              <HistoryChart
                key={key}
                title={`${edition?.ranking_providers?.name || "Provider"} · ${edition?.subject} · ${edition?.region}`}
                unit=" rank (lower is better)"
                reversed
                records={rows.map((r) => ({
                  ...r,
                  value: r.rank,
                  year: r.ranking_editions?.year ?? r.year,
                }))}
              />
            );
          })}
          {u.ranking_entries.length ? (
            <table className="research-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Edition</th>
                  <th>Subject</th>
                  <th>Rank</th>
                </tr>
              </thead>
              <tbody>
                {u.ranking_entries.map((r) => (
                  <tr key={r.id}>
                    <td>{r.ranking_editions?.ranking_providers?.name}</td>
                    <td>{r.ranking_editions?.year}</td>
                    <td>{r.ranking_editions?.subject}</td>
                    <td>
                      <SourceDrawer record={r} label="Ranking">
                        {r.rank_label || r.rank}
                      </SourceDrawer>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      )}
      {tab === "Campus" && (
        <>
          {u.latitude != null && u.longitude != null && (
            <UniversityMap universities={[u]} />
          )}
          <div className="panel" style={{ marginTop: 24 }}>
            <h2>
              {[u.city, countryName(u.country_code)].filter(Boolean).join(", ")}
            </h2>
            <p className="caption">
              {u.campuses.length
                ? u.campuses.map((c) => c.name).join(" · ")
                : "Confirm your teaching location with the university before planning travel or accommodation."}
            </p>
          </div>
          <CampusNextSteps university={u} />
        </>
      )}
      {profileNavigation
        .find((section) => section.id === tab)
        ?.categories.map((category) => (
          <ProfileData
            key={category}
            records={importedRecords}
            category={category}
          />
        ))}
      {tab === "Sources" && (
        <section className="panel">
          <h2>An open record of the evidence.</h2>
          <ProfileSourceLinks university={u} />
          <RankingBadges university={u} />
          {!!importedRecords.length && (
            <div className="profile-source-releases">
              {[
                ...new Map(
                  importedRecords.map((r) => [r.source_url + r.release, r]),
                ).values(),
              ].map((r) => (
                <a
                  key={r.source_url + r.release}
                  href={r.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <strong>
                    {r.source_name} · {r.release}
                  </strong>
                  <span>
                    {r.period || r.reporting_year} · Retrieved{" "}
                    {r.retrieved_at?.slice(0, 10)} ↗
                  </span>
                </a>
              ))}
            </div>
          )}
          {u.logo_source_url && (
            <p className="caption">
              <a
                className="text-link"
                href={u.logo_source_url}
                target="_blank"
                rel="noreferrer"
              >
                University mark source ↗
              </a>{" "}
              · {u.logo_usage_notes}
            </p>
          )}
          <p className="caption">
            Each observation retains its academic year, retrieval date,
            verification status, and uncertainty.
          </p>
          <table className="research-table">
            <thead>
              <tr>
                <th>Observation</th>
                <th>Year</th>
                <th>Source & verification</th>
              </tr>
            </thead>
            <tbody>
              {all.map((r) => (
                <tr key={r.id}>
                  <td>
                    {"metric" in r
                      ? r.metric
                      : "category" in r
                        ? r.category
                        : "acceptance_rate" in r
                          ? "Admissions"
                          : "name" in r
                            ? String(r.name)
                            : "title" in r
                              ? String(r.title)
                              : "Ranking"}
                  </td>
                  <td>{r.year ?? "—"}</td>
                  <td>
                    <SourceDrawer record={r} label="Source evidence">
                      {r.data_sources?.name || "Source pending"} ↗
                    </SourceDrawer>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!all.length && !importedRecords.length && (
            <p className="caption">
              The official links above are available for this profile.
              Institutional metrics will appear with their reporting year and
              source as coverage expands.
            </p>
          )}
          {u.reference_url && (
            <a
              className="text-link"
              href={u.reference_url}
              target="_blank"
              rel="noreferrer"
            >
              Institution identity reference
              <ExternalLink size={14} />
            </a>
          )}
        </section>
      )}
      </div>
    </div>
  );
}
