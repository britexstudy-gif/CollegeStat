"use client";
import { useEffect, useState } from "react";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { useLiquidGlass } from "@/components/college/use-liquid-glass";
import { useSearchParams } from "next/navigation";
import { SaveButton } from "@/components/college/save-button";
import { toast } from "sonner";
import {
  ArrowUpRight,
  CalendarDays,
  GraduationCap,
  MapPin,
  Search,
  Wallet,
} from "lucide-react";
import { useCollege } from "@/components/college/provider";
import { Choice } from "@/components/college/primitives";
import { SourceDrawer } from "@/components/college/metrics";
import { AwardIdentity } from "@/components/college/award-identity";
import { getSupabase } from "@/lib/supabase/client";
import { usesHostedCatalogue } from "@/lib/catalogue-mode";
import {
  filterScholarships,
  scholarshipDeadline,
} from "@/lib/scholarship-discovery";
import { Scholarship, currency, dateLabel, countryName } from "@/lib/domain";

export default function Scholarships({ slug }: { slug?: string }) {
  const glass = useLiquidGlass<HTMLDivElement>();
  const s = useCollege();
  const params = useSearchParams();
  const selectedUniversity = params.get("university") || "";
  const [university, setUniversity] = useState(selectedUniversity);
  const institutions = [
    ...new Map(
      s.scholarships.flatMap((a) =>
        a.university_scholarships.flatMap((l) =>
          l.universities ? [[l.university_id, l.universities] as const] : [],
        ),
      ),
    ).values(),
  ];
  const [query, setQuery] = useState(""),
    [funding, setFunding] = useState("all"),
    [level, setLevel] = useState("all");
  const [includeClosed, setIncludeClosed] = useState(!!slug),
    [page, setPage] = useState(0),
    [retry, setRetry] = useState(0);
  const hosted = usesHostedCatalogue();
  const today = new Date().toISOString().slice(0, 10);
  // The verified server snapshot renders before hydration; exact remote counts
  // replace it after fetching. A changed query never displays stale cards.
  const initialRows = filterScholarships(s.scholarships, {
    query: "",
    funding: "all",
    level: "all",
    includeClosed: !!slug,
    slug,
    today,
    university: selectedUniversity,
  }).slice(0, 24);
  const [remoteRows, setRows] = useState<Scholarship[]>(initialRows),
    [remoteTotal, setTotal] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(hosted);
  const local = hosted
    ? []
    : filterScholarships(s.scholarships, {
        query,
        funding,
        level,
        includeClosed,
        slug,
        today,
        university,
      });
  const rows = hosted ? remoteRows : local.slice(page * 24, page * 24 + 24);
  const total = hosted ? remoteTotal : local.length;
  useEffect(() => {
    if (!hosted) return;
    const db = getSupabase();
    if (!db) {
      setLoading(false);
      setError(
        "Award records are not connected. Explore the official funding programmes below.",
      );
      return;
    }
    let live = true;
    setLoading(true);
    setError("");
    const initialQuery =
      !query &&
      funding === "all" &&
      level === "all" &&
      page === 0 &&
      includeClosed === !!slug &&
      university === selectedUniversity;
    if (!initialQuery) setRows([]);
    setTotal(0);
    const timer = setTimeout(() => {
      let request = db
        .from("scholarships")
        .select(
          university
            ? "*,data_sources(*),university_scholarships!inner(university_id,universities(id,name,slug))"
            : "*,data_sources(*),university_scholarships(university_id,universities(id,name,slug))",
          {
            count: "exact",
          },
        )
        .eq("published", true)
        .eq("verification_status", "verified")
        .order("deadline", { nullsFirst: false })
        .order("name")
        .order("id")
        .range(page * 24, page * 24 + 23);
      if (query) request = request.ilike("name", "%" + query + "%");
      if (funding !== "all") request = request.eq("funding_type", funding);
      if (level !== "all") request = request.eq("level", level);
      if (university)
        request = request.eq(
          "university_scholarships.university_id",
          university,
        );
      if (slug) request = request.eq("slug", slug);
      if (!includeClosed)
        request = request.or("deadline.is.null,deadline.gte." + today);
      void request.then(({ data, count, error }) => {
        if (!live) return;
        setLoading(false);
        if (error) {
          setRows([]);
          setTotal(0);
          setError(
            "Award records could not load. The official funding programmes below are still available.",
          );
        } else {
          setRows((data || []) as unknown as Scholarship[]);
          setTotal(count || 0);
        }
      });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [
    hosted,
    query,
    funding,
    level,
    includeClosed,
    page,
    retry,
    slug,
    today,
    university,
    selectedUniversity,
  ]);
  const track = async (a: Scholarship) => {
    const db = getSupabase();
    if (!db || !s.user) {
      s.openAuth();
      return;
    }
    const { error } = await db
      .from("saved_scholarships")
      .upsert(
        { user_id: s.user.id, scholarship_id: a.id, track_deadline: true },
        { onConflict: "user_id,scholarship_id" },
      );
    if (error) toast.error("Could not track deadline");
    else {
      await s.refreshAccount();
      toast.success("Deadline added to your workspace");
    }
  };
  return (
    <div className="research-page scholarships-page">
      <header className="page-intro scholarship-intro">
        <div>
          <h1>Scholarships</h1>
          <p>
            Awards with official eligibility, coverage and deadlines. Save the
            ones that fit and track their deadlines in your plan.
          </p>
        </div>
      </header>
      <div ref={glass} data-glass="rim" className="scholarship-filter-bar">
        <label>
          <span className="filter-label">
            <Search size={16} aria-hidden="true" /> Search awards
          </span>
          <input
            className="filter-input"
            value={query}
            placeholder="Award or keyword"
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <div className="scholarship-filter-field">
          <span className="filter-label">
            <Wallet size={16} aria-hidden="true" /> Funding
          </span>
          <Choice
            label="Funding"
            value={funding}
            onChange={(v) => {
              setFunding(v);
              setPage(0);
            }}
            options={[
              { value: "all", label: "Any funding" },
              { value: "full", label: "Full funding" },
              { value: "partial", label: "Partial funding" },
              { value: "variable", label: "Variable / need-based" },
            ]}
          />
        </div>
        <div className="scholarship-filter-field">
          <span className="filter-label">
            <GraduationCap size={16} aria-hidden="true" /> Degree
          </span>
          <Choice
            label="Degree"
            value={level}
            onChange={(v) => {
              setLevel(v);
              setPage(0);
            }}
            options={[
              { value: "all", label: "Any degree" },
              "Bachelor",
              "Master",
              "Doctorate",
              "Graduate",
            ]}
          />
        </div>
        <div className="scholarship-filter-field">
          <span className="filter-label">University</span>
          <Choice
            label="University"
            value={university}
            onChange={(v) => {
              setUniversity(v);
              setPage(0);
            }}
            options={[
              { value: "", label: "All universities" },
              ...institutions.map((u) => ({ value: u.id, label: u.name })),
            ]}
          />
        </div>
      </div>
      <div className="scholarship-results-heading">
        <span aria-live="polite">
          {loading
            ? "Loading awards…"
            : `${total} sourced award${total === 1 ? "" : "s"}`}
        </span>
        <label>
          <input
            type="checkbox"
            checked={includeClosed}
            onChange={(e) => {
              setIncludeClosed(e.target.checked);
              setPage(0);
            }}
          />{" "}
          Include closed cycles
        </label>
      </div>
      {error ? (
        <div className="search-suggestions" role="alert">
          <p>{error}</p>
          <button onClick={() => setRetry((v) => v + 1)}>Try again</button>
        </div>
      ) : !loading && rows.length === 0 ? (
        <div className="funding-empty">
          <h2>No award records match yet.</h2>
          <p>
            Try fewer filters, or include closed cycles to see past awards.
          </p>
        </div>
      ) : (
        <div className="resource-grid">
          {rows.map((a) => {
            const status = scholarshipDeadline(a, today);
            return (
              <article className="panel scholarship-award" key={a.id}>
                <AwardIdentity award={a} />
                <span className={"award-cycle " + status}>
                  <CalendarDays size={14} aria-hidden="true" />
                  {status === "closed"
                    ? "Closed cycle"
                    : status === "upcoming"
                      ? "Upcoming deadline"
                      : "Confirm current cycle"}
                </span>
                <h2>{a.name}</h2>
                <div className="award-details">
                  <span>
                    <MapPin size={15} aria-hidden="true" />
                    {a.country_code
                      ? countryName(a.country_code)
                      : "Check destinations"}
                  </span>
                  <span>
                    <GraduationCap size={15} aria-hidden="true" />
                    {a.level}
                  </span>
                  <span>
                    <Wallet size={15} aria-hidden="true" />
                    {a.funding_type === "variable"
                      ? "Variable / need-based"
                      : a.funding_type === "full"
                        ? "Full funding"
                        : a.funding_type === "partial"
                          ? "Partial funding"
                          : a.funding_type}
                  </span>
                </div>
                <SourceDrawer label="Scholarship award" record={a}>
                  <strong className="award-amount">
                    {a.amount == null
                      ? a.funding_type === "full"
                        ? "Study and living support"
                        : "Award assessed individually"
                      : currency(a.amount, a.currency)}
                  </strong>
                </SourceDrawer>
                <div className="award-universities">
                  {a.university_scholarships.map(
                    (link) =>
                      link.universities && (
                        <Link
                          key={link.university_id}
                          href={"/university/" + link.universities.slug}
                        >
                          {link.universities.name} <ArrowUpRight size={13} />
                        </Link>
                      ),
                  )}
                </div>
                <p>{a.description}</p>
                {a.notes && (
                  <details className="award-notes">
                    <summary>Cycle and eligibility details</summary>
                    <p className="caption">{a.notes}</p>
                  </details>
                )}
                <p className="caption">
                  {a.deadline
                    ? "Deadline: " + dateLabel(a.deadline)
                    : "A deadline is not recorded. Confirm it with the provider."}
                </p>
                <div className="control-row">
                  {a.application_url && (
                    <a
                      className="button button-primary"
                      href={a.application_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Check eligibility <ArrowUpRight size={16} />
                    </a>
                  )}
                  <SaveButton id={a.id} scholarship />
                  {status === "upcoming" && (
                    <button className="text-link" onClick={() => track(a)}>
                      <CalendarDays size={16} aria-hidden="true" />
                      Track deadline
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!error && total > 24 && (
        <nav className="pagination-row" aria-label="Scholarship pages">
          <button
            disabled={page === 0 || loading}
            onClick={() => setPage((v) => v - 1)}
          >
            ← Previous
          </button>
          <span>
            Page {page + 1} of {Math.ceil(total / 24)}
          </span>
          <button
            disabled={(page + 1) * 24 >= total || loading}
            onClick={() => setPage((v) => v + 1)}
          >
            Next →
          </button>
        </nav>
      )}
    </div>
  );
}
