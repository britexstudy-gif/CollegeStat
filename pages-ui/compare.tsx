"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Download,
  Share2,
  Plus,
  X,
  Bookmark,
  Search,
  ArrowLeft,
  ArrowRight,
  SlidersHorizontal,
  RotateCcw,
  ArrowUpRight,
} from "lucide-react";
import { useCollege } from "@/components/college/provider";
import { UniversityLogo, EmptyState } from "@/components/college/primitives";
import { SourceDrawer, formatMetric } from "@/components/college/metrics";
import {
  type University,
  type Sourced,
  countryName,
  currency,
} from "@/lib/domain";
import {
  metricDefinitions,
  valueOf,
  convertCurrency,
  type ExchangeRate,
} from "@/lib/research";
import { universitiesByIds, searchCatalogue } from "@/lib/supabase/catalogue";
import { getSupabase } from "@/lib/supabase/client";
import { usesHostedCatalogue } from "@/lib/catalogue-mode";
import { universityRanks, rankLabel } from "@/lib/ranking-highlights";
import {
  canonicalComparisonIDs,
  moveComparisonID,
  comparisonRowVisible,
  csvCell,
} from "@/lib/comparison";
import {
  regionalRanksForUniversity,
  regionalRankLabel,
} from "@/lib/regional-rankings";
import { useLiquidGlass } from "@/components/college/use-liquid-glass";
import { comparisonEvidence } from "@/lib/comparison-evidence";
import { EvidenceBars } from "@/components/college/evidence-bars";

type Cell = {
  key: string | null;
  text: string;
  detail?: string;
  url?: string;
  node: ReactNode;
};
type ComparisonRow = {
  id: string;
  group: string;
  label: string;
  cells: Cell[];
};
const groups = [
  "All",
  "Overview",
  "Admissions",
  "Costs",
  "Financial aid",
  "Academics",
  "Students",
  "Outcomes",
  "Rankings",
  "Programs & research",
];
const missing: Cell = {
  key: null,
  text: "Not reported",
  node: <span className="comparison-missing">Not reported</span>,
};
function textCell(text: string | null | undefined, detail?: string): Cell {
  return text
    ? {
        key: JSON.stringify([text, detail]),
        text,
        detail,
        node: (
          <>
            <strong>{text}</strong>
            {detail && <small>{detail}</small>}
          </>
        ),
      }
    : missing;
}
function linkCell(
  text: string,
  url: string | null | undefined,
  detail?: string,
): Cell {
  return url
    ? {
        key: JSON.stringify([text, detail, url]),
        text,
        detail,
        url,
        node: (
          <a
            href={url}
            target={url.startsWith("/") ? undefined : "_blank"}
            rel={url.startsWith("/") ? undefined : "noreferrer"}
          >
            {text}
            <ArrowUpRight size={13} aria-hidden="true" />
            {detail && <small>{detail}</small>}
          </a>
        ),
      }
    : missing;
}

export default function Compare({
  initialUniversities = [],
  initialError = "",
}: {
  initialUniversities?: University[];
  initialError?: string;
}) {
  const glass = useLiquidGlass<HTMLDivElement>();
  const s = useCollege(),
    params = useSearchParams(),
    router = useRouter();
  const idsParam = params.get("ids"),
    share = params.get("share");
  const selectedIDs = canonicalComparisonIDs(
    idsParam !== null ? idsParam.split(",") : s.compare,
  );
  const selectionKey = selectedIDs.join(",");
  const [rows, setRows] = useState(initialUniversities),
    [loading, setLoading] = useState(
      selectedIDs.length > 0 && !initialUniversities.length,
    ),
    [query, setQuery] = useState(""),
    [matches, setMatches] = useState<University[]>([]),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState(""),
    [focus, setFocus] = useState("All"),
    [differences, setDifferences] = useState(false),
    [hideMissing, setHideMissing] = useState(false),
    [years, setYears] = useState(true),
    [charts, setCharts] = useState(false),
    [displayCurrency, setDisplayCurrency] = useState("original"),
    [rates, setRates] = useState<ExchangeRate[]>([]),
    [error, setError] = useState(initialError),
    [retry, setRetry] = useState(0);
  const { setCompare } = s;
  const updateSelection = (ids: string[]) => {
    const next = canonicalComparisonIDs(ids);
    setCompare(next);
    router.replace("/compare?ids=" + next.join(","), { scroll: false });
  };
  useEffect(() => {
    setCompare(canonicalComparisonIDs(selectionKey.split(",")));
  }, [selectionKey, setCompare]);
  useEffect(() => {
    if (!share || idsParam !== null) return;
    let live = true;
    const db = getSupabase();
    if (!db) {
      setError(
        "This saved share link needs the account service. Ask for a direct comparison link.",
      );
      return;
    }
    setLoading(true);
    void db
      .rpc("read_shared_comparison", { share_id: share })
      .then(({ data, error }) => {
        if (!live) return;
        setLoading(false);
        if (error || !Array.isArray(data))
          setError("This shared comparison is unavailable.");
        else
          router.replace(
            "/compare?ids=" + canonicalComparisonIDs(data).join(","),
            { scroll: false },
          );
      });
    return () => {
      live = false;
    };
  }, [share, idsParam, router, retry]);
  useEffect(() => {
    let live = true;
    if (share && idsParam === null) return;
    const ids = selectionKey ? selectionKey.split(",") : [];
    setLoading(!!ids.length);
    setError("");
    setRows((previous) =>
      ids.flatMap((id) => previous.filter((u) => u.id === id)),
    );
    universitiesByIds(ids)
      .then((result) => {
        if (live) {
          setRows(ids.flatMap((id) => result.filter((u) => u.id === id)));
          setLoading(false);
        }
      })
      .catch(() => {
        if (live) {
          setRows([]);
          setLoading(false);
          setError(
            "Comparison could not be loaded. Your selection is kept; try again.",
          );
        }
      });
    return () => {
      live = false;
    };
  }, [selectionKey, retry, share, idsParam]);
  useEffect(() => {
    let live = true;
    setMatches([]);
    setSearchError("");
    setSearching(true);
    const timer = setTimeout(() => {
      void searchCatalogue(query.trim())
        .then((result) => {
          if (live) {
            setMatches(result);
            setSearching(false);
          }
        })
        .catch(() => {
          if (live) {
            setSearchError(
              "University search is unavailable. Try again or open the directory.",
            );
            setSearching(false);
          }
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);
  useEffect(() => {
    if (!usesHostedCatalogue()) return;
    let live = true;
    void getSupabase()
      ?.from("exchange_rates")
      .select("*,data_sources(name,url)")
      .order("observed_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (live && !error) setRates((data || []) as ExchangeRate[]);
      });
    return () => {
      live = false;
    };
  }, []);

  const comparisonRows: ComparisonRow[] = [];
  const addRow = (id: string, group: string, label: string, cells: Cell[]) =>
    comparisonRows.push({ id, group, label, cells });
  addRow(
    "location",
    "Overview",
    "Location",
    rows.map((u) =>
      textCell(
        [u.city, countryName(u.country_code)].filter(Boolean).join(", "),
      ),
    ),
  );
  addRow(
    "type",
    "Overview",
    "University type",
    rows.map((u) => textCell(u.university_type)),
  );
  addRow(
    "founded",
    "Overview",
    "Established",
    rows.map((u) => textCell(u.founded_year ? String(u.founded_year) : null)),
  );
  addRow(
    "requirements",
    "Admissions",
    "Application requirements",
    rows.map((u) => {
      const brief = u.application_brief;
      const structured = u.requirements
        .map((r) => r.label + (r.minimum != null ? ": " + r.minimum : ""))
        .join(" · ");
      const detail = brief
        ? (brief.scope || "First-year undergraduate") +
          " · checked " +
          brief.checked_at
        : structured ||
          "Planning checklist; confirm exact requirements with the university";
      return linkCell(
        brief?.requirements.slice(0, 2).join(" ") ||
          structured ||
          "View requirements checklist",
        "/university/" + u.slug + "?tab=Admissions",
        detail,
      );
    }),
  );
  addRow(
    "application",
    "Admissions",
    "Official application link",
    rows.map((u) =>
      linkCell(
        u.application_url
          ? "Application portal"
          : u.admissions_url
            ? "Admissions guidance"
            : "University website",
        u.application_url ||
          u.admissions_url ||
          u.official_web?.links.admissions?.url ||
          u.website,
      ),
    ),
  );
  for (const m of metricDefinitions) {
    addRow(
      m.key,
      m.group,
      m.label,
      rows.map((u) => {
        const v = valueOf(u, m.key);
        if (v.value == null) return missing;
        const record = v.record;
        let text = formatMetric(u, m.key),
          conversionDetail = "";
        if (displayCurrency !== "original" && v.currency) {
          const conversion = convertCurrency(
            v.value,
            v.currency,
            displayCurrency,
            rates,
          );
          if (conversion) {
            text =
              (conversion.estimated ? "≈ " : "") +
              currency(conversion.amount, displayCurrency);
            conversionDetail =
              "Original: " +
              formatMetric(u, m.key) +
              (conversion.rate ? " · rate " + conversion.rate.observed_at : "");
          } else
            conversionDetail =
              "Original currency retained; no sourced conversion rate";
        }
        const cost =
          record && "student_category" in record
            ? (record as Sourced & {
                student_category: string;
                period?: string;
                program_id?: string | null;
              })
            : undefined;
        const detail = [
          record?.year ? String(record.year) : "Reporting year not stated",
          cost?.student_category,
          cost?.period ? "per " + cost.period : undefined,
          cost?.program_id ? "Programme-specific figure" : undefined,
          record?.notes,
          conversionDetail,
        ]
          .filter(Boolean)
          .join(" · ");
        return {
          key: JSON.stringify([v.value, v.currency, detail]),
          text,
          detail,
          url: record?.source_url || record?.data_sources?.url,
          node: (
            <>
              <SourceDrawer label={m.label} record={record}>
                <strong>{text}</strong>
                {years && (
                  <small>{record?.year || "Reporting year not stated"}</small>
                )}
              </SourceDrawer>
              {(cost?.student_category || cost?.period) && (
                <small>
                  {[
                    cost.student_category,
                    cost.period && "per " + cost.period,
                    cost.program_id && "programme-specific",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              )}
              {conversionDetail && <small>{conversionDetail}</small>}
              {(record?.source_url || record?.data_sources?.url) && (
                <a
                  className="comparison-source-link"
                  href={record.source_url || record.data_sources?.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Source <ArrowUpRight size={12} aria-hidden="true" />
                </a>
              )}
            </>
          ),
        };
      }),
    );
  }
  addRow(
    "funding-link",
    "Financial aid",
    "Scholarships & funding",
    rows.map((u) =>
      linkCell(
        "View funding options",
        "/university/" + u.slug + "?tab=Costs",
        u.financial_aid_url || u.official_web?.links.scholarships
          ? "Official university funding link available"
          : "University and external funding directories",
      ),
    ),
  );
  for (const provider of ["qs", "the", "arwu"] as const) {
    addRow(
      provider,
      "Rankings",
      provider.toUpperCase() + " · world overall",
      rows.map((u) => {
        const r = universityRanks(u).find((r) => r.provider === provider);
        return r
          ? linkCell(
              rankLabel(r),
              r.url,
              r.year +
                (r.country_position
                  ? " · Country position " +
                    r.country_position +
                    " in this world table"
                  : " · Publisher edition"),
            )
          : missing;
      }),
    );
  }
  for (const scope of ["Asia", "Europe"]) {
    addRow(
      "regional-" + scope,
      "Rankings",
      "QS · " + scope + " regional",
      rows.map((u) => {
        const rank = regionalRanksForUniversity(u).find(
          (r) => r.scope === scope,
        );
        return rank
          ? linkCell(
              regionalRankLabel(rank.rank_label),
              rank.source_url,
              String(rank.year) + " · separate regional edition",
            )
          : missing;
      }),
    );
  }
  addRow(
    "courses",
    "Academics",
    "Programs & entry routes",
    rows.map((u) =>
      linkCell("Explore programs", "/university/" + u.slug + "?tab=Academics"),
    ),
  );
  addRow(
    "reported-programs",
    "Programs & research",
    "Reported programme / qualification combinations",
    rows.map((u) =>
      u.reported_programs?.length
        ? linkCell(
            u.reported_programs.length.toLocaleString(),
            "/university/" + u.slug + "?tab=Academics",
            "IPEDS · completions, 2024–25; not a current course list",
          )
        : missing,
    ),
  );
  addRow(
    "subjects",
    "Programs & research",
    "Publisher subject areas",
    rows.map((u) =>
      u.publisher_students?.subjects?.length
        ? linkCell(
            u.publisher_students.subjects.join(" · "),
            "/university/" + u.slug + "?tab=Academics",
            "THE " + u.publisher_students.edition + " · broad subjects",
          )
        : missing,
    ),
  );
  addRow(
    "works",
    "Programs & research",
    "Indexed research works",
    rows.map((u) =>
      u.research_identity
        ? linkCell(
            u.research_identity.works_count.toLocaleString(),
            "/university/" + u.slug + "?tab=Research",
            "OpenAlex · all years · checked " +
              u.research_identity.retrieved_at,
          )
        : missing,
    ),
  );
  const extraEvidence = rows.map(comparisonEvidence);
  const evidenceDefinitions = new Map(extraEvidence.flatMap(items => items.map(item => [item.id, item] as const)));
  for (const definition of evidenceDefinitions.values()) {
    addRow(definition.id, definition.group, definition.label, extraEvidence.map(items => {
      const evidence = items.find(item => item.id === definition.id);
      return !evidence ? missing : evidence.url ? linkCell(evidence.text, evidence.url, evidence.detail) : textCell(evidence.text, evidence.detail);
    }));
  }
  const ordered = groups
    .slice(1)
    .flatMap((group) => comparisonRows.filter((row) => row.group === group));
  const visibleRows = ordered.filter(
    (row) =>
      (focus === "All" || row.group === focus) &&
      comparisonRowVisible(
        row.cells.map((c) => c.key),
        { onlyDifferences: differences, hideEmpty: hideMissing },
      ),
  );
  const hiddenSelection = selectedIDs.filter(
    (id) => !rows.some((u) => u.id === id),
  );
  const enabled = !loading && rows.length >= 2;
  const shareComparison = async () => {
    if (!enabled) return;
    const url =
      location.origin + "/compare?ids=" + rows.map((u) => u.id).join(",");
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Comparison link copied");
    } catch {
      updateSelection(rows.map((u) => u.id));
      toast("Share this page’s URL from your browser");
    }
  };
  const exportCSV = () => {
    const lines = [
      ["Metric", ...rows.map((u) => u.name)],
      ...visibleRows.map((row) => [
        row.group + " · " + row.label,
        ...row.cells.map((cell) =>
          [cell.text, cell.detail, cell.url].filter(Boolean).join(" | "),
        ),
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([lines.map((row) => row.map(csvCell).join(",")).join("\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "collegestat-comparison.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const suggestions = matches.filter((u) => !selectedIDs.includes(u.id));
  return (
    <div className="research-page compare-workspace">
      <header className="page-intro">
        <div className="eyebrow">SIDE BY SIDE</div>
        <h1>Compare universities.</h1>
        <p>
          Add two to five universities. Compare the same questions, with sources
          and reporting years beside the figures.
        </p>
      </header>
      <section className="comparison-builder" aria-label="Choose universities">
        <div className="comparison-builder-heading">
          <h2>Your universities</h2>
          <span>{selectedIDs.length}/5 selected</span>
          {selectedIDs.length > 0 && (
            <button className="text-link" onClick={() => updateSelection([])}>
              <RotateCcw size={14} />
              Clear
            </button>
          )}
        </div>
        <div className="comparison-selected-list">
          {rows.map((u, index) => (
            <article key={u.id}>
              <UniversityLogo university={u} size="sm" />
              <div>
                <Link href={"/university/" + u.slug}>{u.name}</Link>
                <span>
                  {[u.city, countryName(u.country_code)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <div className="comparison-selection-actions">
                <button
                  className="icon-button"
                  disabled={index === 0}
                  aria-label={"Move " + u.name + " left"}
                  onClick={() =>
                    updateSelection(moveComparisonID(selectedIDs, u.id, -1))
                  }
                >
                  <ArrowLeft size={14} />
                </button>
                <button
                  className="icon-button"
                  disabled={index === rows.length - 1}
                  aria-label={"Move " + u.name + " right"}
                  onClick={() =>
                    updateSelection(moveComparisonID(selectedIDs, u.id, 1))
                  }
                >
                  <ArrowRight size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={"Remove " + u.name + " from comparison"}
                  onClick={() =>
                    updateSelection(selectedIDs.filter((id) => id !== u.id))
                  }
                >
                  <X size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
        <label
          className="comparison-search-label"
          htmlFor="comparison-university-search"
        >
          <Search size={17} aria-hidden="true" />
          Add a university
        </label>
        <input
          id="comparison-university-search"
          className="filter-input"
          placeholder="Search by university name, city or country"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={selectedIDs.length >= 5}
        />
        <p className="caption" role="status">
          {selectedIDs.length >= 5
            ? "Five selected. Remove a university to add another."
            : searching
              ? "Searching universities…"
              : searchError ||
                (query.trim() && !suggestions.length
                  ? "No new matches. Try another name or open the directory."
                  : query.trim()
                    ? "Choose a result to add it."
                    : "Start with a suggestion or search the full directory.")}
        </p>
        {selectedIDs.length < 5 && (
          <div className="comparison-search-results">
            {suggestions.slice(0, query.trim() ? 8 : 4).map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  updateSelection([...selectedIDs, u.id]);
                  setQuery("");
                }}
              >
                <UniversityLogo university={u} size="sm" />
                <span>
                  <strong>{u.name}</strong>
                  <small>
                    {[u.city, countryName(u.country_code)]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                <Plus size={17} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        <Link className="text-link" href="/universities">
          Find universities with filters <ArrowUpRight size={14} />
        </Link>
      </section>
      {error && (
        <div role="alert" className="inline-error">
          {error}
          <button className="text-link" onClick={() => setRetry((v) => v + 1)}>
            Try again
          </button>
        </div>
      )}
      {loading && (
        <p role="status" className="comparison-loading">
          Loading your comparison…
        </p>
      )}
      {!loading && !error && hiddenSelection.length > 0 && (
        <p role="status" className="reference-note">
          {hiddenSelection.length} selected institution(s) are unavailable in
          this catalogue.{" "}
          <button
            className="text-link"
            onClick={() => updateSelection(rows.map((u) => u.id))}
          >
            Remove unavailable choices
          </button>
        </p>
      )}
      {rows.length > 0 ? (
        <>
          <div ref={glass} data-glass="rim" className="comparison-toolbar">
            <label>
              <SlidersHorizontal size={17} aria-hidden="true" />
              <span>Compare</span>
              <select
                aria-label="Comparison category"
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
              >
                {groups.map((group) => (
                  <option key={group}>{group}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Currency</span>
              <select
                aria-label="Comparison currency"
                value={displayCurrency}
                onChange={(event) => setDisplayCurrency(event.target.value)}
              >
                <option value="original">Original currencies</option>
                {["USD", "EUR", "GBP", "UZS"].map((code) => (
                  <option key={code}>{code}</option>
                ))}
              </select>
            </label>
            <div className="comparison-export-actions">
              <button
                className="button button-secondary"
                disabled={!enabled}
                onClick={s.persistCompare}
              >
                <Bookmark size={15} />
                Save
              </button>
              <button
                className="button button-secondary"
                disabled={!enabled}
                onClick={shareComparison}
              >
                <Share2 size={15} />
                Share
              </button>
              <button
                className="button button-secondary"
                disabled={!enabled || !visibleRows.length}
                onClick={exportCSV}
              >
                <Download size={15} />
                Export
              </button>
            </div>
          </div>
          <div className="comparison-view-options">
            {[
              [differences, setDifferences, "Only differences"],
              [hideMissing, setHideMissing, "Hide empty rows"],
              [years, setYears, "Show years"],
              [charts, setCharts, "Show charts"],
            ].map(([value, set, label]) => (
              <label key={String(label)}>
                <input
                  type="checkbox"
                  checked={value as boolean}
                  onChange={(event) =>
                    (set as (value: boolean) => void)(event.target.checked)
                  }
                />
                {label as string}
              </label>
            ))}
            <span>{visibleRows.length} comparison rows</span>
          </div>
          {rows.length === 1 && (
            <p className="reference-note">
              Add one more university to compare side by side. Save, share and
              export become available with two selections.
            </p>
          )}
          {displayCurrency !== "original" && (
            <p className="caption">
              Conversions use stored source rates. Where no rate is available,
              the original amount is shown. The export includes the displayed
              value, original amount and source.
            </p>
          )}
          {charts &&
            (focus === "All" ||
              focus === "Admissions" ||
              focus === "Students") && (
              <div className="comparison-graphs">
                {(focus === "All" || focus === "Admissions") && (
                  <EvidenceBars
                    label="Admission rates · latest reported year"
                    max={100}
                    unit="%"
                    rows={rows.map((u) => {
                      const v = valueOf(u, "admission");
                      return {
                        label: u.short_name || u.name,
                        value: v.value,
                        detail: String(
                          v.record?.year || "Reporting year not stated",
                        ),
                        url:
                          v.record?.source_url || v.record?.data_sources?.url,
                      };
                    })}
                  />
                )}
                {(focus === "All" || focus === "Students") && (
                  <EvidenceBars
                    label="Enrollment · latest reported figures"
                    rows={rows.map((u) => {
                      const v = valueOf(u, "enrollment");
                      return {
                        label: u.short_name || u.name,
                        value: v.value,
                        detail: String(
                          v.record?.year || "Reporting year not stated",
                        ),
                        url:
                          v.record?.source_url || v.record?.data_sources?.url,
                      };
                    })}
                  />
                )}
              </div>
            )}
          <p className="comparison-scroll-hint">
            Scroll across to see every university. Sources and reporting years
            can differ.
          </p>
          <div
            className="table-wrap comparison-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="University comparison table"
          >
            <table className="research-table comparison-table">
              <caption className="sr-only">
                University comparison, {focus.toLowerCase()}; {rows.length}{" "}
                universities
              </caption>
              <thead>
                <tr>
                  <th scope="col">What matters</th>
                  {rows.map((u) => (
                    <th key={u.id} scope="col">
                      <UniversityLogo university={u} size="sm" />
                      <Link href={"/university/" + u.slug}>{u.name}</Link>
                      <span>{countryName(u.country_code)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => (
                  <ComparisonTableRow
                    key={row.id}
                    row={row}
                    group={
                      index === 0 || visibleRows[index - 1].group !== row.group
                    }
                  />
                ))}
              </tbody>
            </table>
            {!visibleRows.length && (
              <div className="comparison-no-rows">
                <h2>No rows match these filters.</h2>
                <p>
                  Try showing all categories, identical values or empty rows.
                </p>
                <button
                  className="text-link"
                  onClick={() => {
                    setFocus("All");
                    setDifferences(false);
                    setHideMissing(false);
                  }}
                >
                  Reset view filters
                </button>
              </div>
            )}
          </div>
          <p className="reference-note">
            Compare the same student category and reporting year before judging
            a difference. Rank bands and ties retain the publisher’s labels; an
            unavailable rank is never assigned a guessed position.
          </p>
          {enabled && (
            <Link
              className="text-link"
              href={"/research?ids=" + rows.map((u) => u.id).join(",")}
            >
              Explain this comparison <ArrowRight size={15} />
            </Link>
          )}
        </>
      ) : (
        !loading &&
        !error && (
          <EmptyState
            title="Choose your universities."
            description="Search above or open the directory to build a comparison."
            action={
              <Link className="button button-primary" href="/universities">
                Explore universities
              </Link>
            }
          />
        )
      )}
    </div>
  );
}
function ComparisonTableRow({
  row,
  group,
}: {
  row: ComparisonRow;
  group: boolean;
}) {
  return (
    <>
      {group && (
        <tr className="group-row">
          <th colSpan={row.cells.length + 1}>{row.group}</th>
        </tr>
      )}
      <tr>
        <th scope="row">{row.label}</th>
        {row.cells.map((cell, index) => (
          <td key={index}>{cell.node}</td>
        ))}
      </tr>
    </>
  );
}
