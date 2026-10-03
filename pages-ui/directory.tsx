"use client";
import { useLiquidGlass } from "@/components/college/use-liquid-glass";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  SlidersHorizontal,
  Grid2X2,
  List,
  Table2,
  Map,
  Bookmark,
  X,
  ArrowRight,
} from "lucide-react";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { PercentageRange } from "@/components/college/percentage-range";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useCollege } from "@/components/college/provider";
import { UniversityCard } from "@/components/college/university-card";
import {
  Choice,
  EmptyState,
  UniversityLogo,
} from "@/components/college/primitives";
import { UniversityMap } from "@/components/college/university-map";
import { QuickView } from "@/components/college/quick-view";
import { formatMetric, SourceDrawer } from "@/components/college/metrics";
import { countryName, countries, University } from "@/lib/domain";
import {
  Filters,
  readFilters,
  filterURL,
  defaultFilters,
  parseResearchQuery,
  metricDefinitions,
  valueOf,
  MetricKey,
} from "@/lib/research";
import { exploreUniversities, ExplorerResult } from "@/lib/supabase/catalogue";
import { filterLabel } from "@/lib/filter-labels";
import { getSupabase } from "@/lib/supabase/client";
export default function Directory({
  initialResult,
  initialQuery = "",
}: {
  initialResult?: ExplorerResult;
  initialQuery?: string;
}) {
  const searchGlass = useLiquidGlass<HTMLDivElement>();
  const s = useCollege(),
    router = useRouter(),
    params = useSearchParams(),
    query = params.toString(),
    f = readFilters(new URLSearchParams(query));
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<ExplorerResult | null>(
      initialResult || null,
    ),
    [busy, setBusy] = useState(!initialResult),
    [error, setError] = useState(""),
    [unparsed, setUnparsed] = useState(params.get("unresolved") || ""),
    [view, setView] = useState(params.get("view") || "list"),
    [open, setOpen] = useState(false),
    [quick, setQuick] = useState<University | null>(null),
    [search, setSearch] = useState(f.q),
    [columns, setColumns] = useState<MetricKey[]>([
      "admission",
      "tuition",
      "aid_recipients",
      "international_students",
    ]);
  const update = (patch: Partial<Filters>) => {
    router.replace(
      "/universities?" + filterURL({ ...f, ...patch, page: patch.page ?? 1 }),
      { scroll: false },
    );
  };
  useEffect(() => {
    if (initialResult && query === initialQuery && retry === 0) {
      setResult(initialResult);
      setBusy(false);
      setError("");
      return;
    }
    let live = true;
    setBusy(true);
    exploreUniversities(readFilters(new URLSearchParams(query)))
      .then((r) => {
        if (live) {
          setResult(r);
          setError("");
        }
      })
      .catch(() => {
        if (live)
          setError("University results could not be loaded. Please retry.");
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [query, retry, initialResult, initialQuery]);
  useEffect(() => {
    setSearch(f.q);
  }, [f.q]);
  const saveSearch = async () => {
    const db = getSupabase();
    if (!db || !s.user) {
      s.openAuth();
      return;
    }
    const { error } = await db.from("saved_searches").insert({
      user_id: s.user.id,
      name:
        search ||
        [f.country && countryName(f.country), f.field, f.region]
          .filter(Boolean)
          .join(" · ") ||
        "University research",
      filters: f,
    });
    toast[error ? "error" : "success"](
      error ? "Could not save search" : "Search saved to your workspace",
    );
  };
  const active = Object.entries(f).filter(
    ([key, value]) =>
      key !== "page" &&
      key !== "sort" &&
      value !== undefined &&
      value !== "" &&
      value !== defaultFilters[key as keyof Filters],
  );
  const choice = (key: keyof Filters, label: string, options: string[]) => (
    <Choice
      label={label}
      value={String(f[key] || "all")}
      onChange={(v) => update({ [key]: v === "all" ? "" : v })}
      options={[
        { value: "all", label: "Any " + label.toLowerCase() },
        ...options,
      ]}
    />
  );
  const field = (key: keyof Filters, label: string) => (
    <label className="form-field">
      {label}
      <input
        className="filter-input"
        defaultValue={String(f[key] || "")}
        key={String(f[key])}
        onBlur={(e) => update({ [key]: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
  const filters = (
    <>
      <div className="filter-heading">
        <span>FILTERS</span>
        <button onClick={() => router.replace("/universities")}>
          Reset all
        </button>
      </div>
      <Accordion
        type="multiple"
        defaultValue={[
          "Location",
          "Cost",
          ...(f.admission_min !== undefined ||
          f.admission_max !== undefined ||
          f.ielts_max !== undefined
            ? ["Admissions"]
            : []),
          ...(f.field || f.degree || f.language ? ["Academics"] : []),
        ]}
      >
        <AccordionItem value="Location">
          <AccordionTrigger>Location</AccordionTrigger>
          <AccordionContent>
            <Choice
              label="Country"
              value={f.country || "all"}
              onChange={(v) => update({ country: v === "all" ? "" : v })}
              options={[
                { value: "all", label: "All countries" },
                ...Object.entries(countries).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
            <div style={{ marginTop: 12 }}>
              {choice("region", "Region", [
                "Europe",
                "North America",
                "Asia",
                "Oceania",
                "Africa",
                "South America",
              ])}
            </div>
            {field("city", "City")}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="Academics">
          <AccordionTrigger>Academics</AccordionTrigger>
          <AccordionContent>
            {field("field", "Field or program")}
            {choice("degree", "Degree", ["Bachelor", "Master", "Doctorate"])}
            <div style={{ marginTop: 12 }}>
              {choice("language", "Language", ["English", "German", "French"])}
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="Cost">
          <AccordionTrigger>Cost & aid</AccordionTrigger>
          <AccordionContent>
            <label className="caption">Maximum annual tuition (USD)</label>
            <input
              aria-label="Maximum tuition in USD"
              className="filter-input"
              type="number"
              min="0"
              value={f.cost_max ?? ""}
              placeholder="Any amount"
              onChange={(e) =>
                update({
                  cost_max: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
            <label className="filter-checkbox">
              <Checkbox
                checked={f.aid === "yes"}
                onCheckedChange={(v) => update({ aid: v ? "yes" : "" })}
              />
              Aid recipients reported
            </label>
            <label className="check-label">
              <Checkbox
                checked={f.scholarships === "yes"}
                onCheckedChange={(v) =>
                  update({ scholarships: v ? "yes" : "" })
                }
              />{" "}
              Verified scholarships available
            </label>
            <p className="caption" style={{ marginTop: 12 }}>
              Original USD figures only. Missing costs are excluded when a
              budget is set.
            </p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="Admissions">
          <AccordionTrigger>Admissions</AccordionTrigger>
          <AccordionContent>
            <PercentageRange
              minimum={f.admission_min ?? 0}
              maximum={f.admission_max ?? 100}
              onCommit={(v) =>
                update({ admission_min: v[0], admission_max: v[1] })
              }
            />
            <label className="form-field" style={{ marginTop: 20 }}>
              Maximum IELTS requirement
              <input
                type="number"
                min="0"
                max="9"
                step=".5"
                value={f.ielts_max ?? ""}
                onChange={(e) =>
                  update({
                    ielts_max: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
            </label>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="University">
          <AccordionTrigger>University & students</AccordionTrigger>
          <AccordionContent>
            {choice("type", "Type", ["Public", "Private"])}
            <label className="form-field">
              Minimum international students %
              <input
                type="number"
                min="0"
                max="100"
                value={f.intl_min ?? ""}
                onChange={(e) =>
                  update({
                    intl_min: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
            </label>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="Outcomes">
          <AccordionTrigger>Outcomes</AccordionTrigger>
          <AccordionContent>
            <label className="form-field">
              Minimum graduation rate %
              <input
                type="number"
                min="0"
                max="100"
                value={f.graduation_min ?? ""}
                onChange={(e) =>
                  update({
                    graduation_min: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
            </label>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <p className="filter-footnote">
        A filter is a constraint, not a recommendation. Unknown values never
        count as zero.
      </p>
    </>
  );
  return (
    <div className="research-page directory-page">
      <header className="page-intro">
        <div className="eyebrow">UNIVERSITY INTELLIGENCE</div>
        <h1>Find universities.</h1>
        <p>
          Search by name, country, or subject. Use the filters to narrow your
          choices.
        </p>
      </header>
      <form
        className="directory-search-row control-row"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = parseResearchQuery(search);
          setUnparsed(parsed.unparsed);
          update(parsed.recognized ? parsed.filters : { q: parsed.filters.q });
        }}
      >
        <div ref={searchGlass} data-glass="rim" className="catalogue-search">
          <Search size={18} />
          <input
            aria-label="Search universities"
            placeholder="Try “universities in Germany under $20k”"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="icon-button"
            type="submit"
            aria-label="Apply search"
          >
            <ArrowRight size={17} />
          </button>
        </div>
        <button
          type="button"
          className="button button-secondary mobile-filters-button"
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontal size={16} />
          Filters
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={saveSearch}
        >
          <Bookmark size={15} />
          Save these filters
        </button>
      </form>
      {unparsed && (
        <p className="reference-note" role="status">
          Not applied: {unparsed}. Refine your query or use the filters below.
        </p>
      )}
      <div className="directory-workspace">
        <aside className="directory-filters">{filters}</aside>
        <section>
          <div className="directory-toolbar">
            <span aria-live="polite">
              {busy
                ? "Updating…"
                : `${result?.total ?? 0} ${(result?.total ?? 0) === 1 ? "university matches" : "universities match"}`}
            </span>
            <div>
              <Choice
                label="Sort results"
                value={f.sort}
                onChange={(v) => update({ sort: v as Filters["sort"] })}
                options={[
                  { value: "rank", label: "QS rank: top first" },
                  { value: "rank_desc", label: "QS rank: bottom first" },
                  { value: "tuition", label: "Tuition: low to high" },
                  { value: "tuition_desc", label: "Tuition: high to low" },
                  { value: "admission", label: "Admission %: low to high" },
                  {
                    value: "admission_desc",
                    label: "Admission %: high to low",
                  },
                  {
                    value: "international",
                    label: "International %: high to low",
                  },
                  {
                    value: "international_asc",
                    label: "International %: low to high",
                  },
                ]}
              />
              <div className="view-switch">
                {(
                  [
                    [Grid2X2, "grid"],
                    [List, "list"],
                    [Table2, "table"],
                    [Map, "map"],
                  ] as const
                ).map(([Icon, name]) => (
                  <button
                    key={name}
                    className={view === name ? "active" : ""}
                    aria-label={name + " view"}
                    aria-pressed={view === name}
                    onClick={() => setView(name)}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="directory-sort-note caption">
            {f.sort.startsWith("rank")
              ? "QS 2027 world positions. Universities without a linked position appear last."
              : "Reported values only; missing values appear last. Open a figure to see its year and source."}
          </p>
          {active.length > 0 && (
            <div className="active-filters">
              {active.map(([key, value]) => (
                <button
                  key={key}
                  onClick={() =>
                    update({ [key]: defaultFilters[key as keyof Filters] })
                  }
                >
                  {filterLabel(key, value)}
                  <X size={12} />
                </button>
              ))}
            </div>
          )}
          {!!result?.suggestions?.length && !busy && (
            <div className="search-suggestions" role="status">
              <h3>Did you mean one of these?</h3>
              <p>Your other filters are still applied.</p>
              {result.suggestions.map((u) => (
                <button
                  key={u.slug}
                  className="text-link"
                  onClick={() => update({ q: u.name })}
                >
                  {u.name} →
                </button>
              ))}
            </div>
          )}
          {error ? (
            <EmptyState
              title="Results are unavailable"
              description={error}
              action={
                <button
                  className="button button-primary"
                  onClick={() => setRetry((n) => n + 1)}
                >
                  Retry
                </button>
              }
            />
          ) : busy && !result ? (
            <div className="university-grid">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-72 rounded-xl" />
              ))}
            </div>
          ) : result?.universities.length ? (
            view === "map" ? (
              <UniversityMap
                universities={result.universities}
                onSelect={setQuick}
              />
            ) : view === "table" ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="text-link"
                    style={{ marginBottom: 14 }}
                  >
                    Customize columns
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {metricDefinitions.map((m) => (
                      <DropdownMenuCheckboxItem
                        checked={columns.includes(m.key)}
                        key={m.key}
                        onCheckedChange={(v) =>
                          setColumns((old) =>
                            v
                              ? [...old, m.key]
                              : old.filter((k) => k !== m.key),
                          )
                        }
                      >
                        {m.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="table-wrap">
                  <table className="research-table">
                    <thead>
                      <tr>
                        <th>Compare</th>
                        <th className="resizable">University</th>
                        {columns.map((key) => (
                          <th className="resizable" key={key}>
                            {
                              metricDefinitions.find((m) => m.key === key)!
                                .label
                            }
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.universities.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <Checkbox
                              aria-label={"Compare " + u.name}
                              checked={s.compare.includes(u.id)}
                              onCheckedChange={() => s.toggleCompare(u.id)}
                            />
                          </td>
                          <td>
                            <button
                              className="table-school"
                              onClick={() => setQuick(u)}
                            >
                              <UniversityLogo university={u} size="sm" />
                              <span>
                                {u.name}
                                <small>{countryName(u.country_code)}</small>
                              </span>
                            </button>
                          </td>
                          {columns.map((key) => (
                            <td key={key}>
                              <SourceDrawer
                                label={
                                  metricDefinitions.find((m) => m.key === key)!
                                    .label
                                }
                                record={valueOf(u, key).record}
                              >
                                {formatMetric(u, key)}
                              </SourceDrawer>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div
                className={
                  "university-grid " +
                  (view === "list" ? "university-list" : "")
                }
              >
                {result.universities.map((u) => (
                  <UniversityCard
                    key={u.id}
                    university={u}
                    layout={view === "list" ? "list" : "grid"}
                    onPreview={() => setQuick(u)}
                  />
                ))}
              </div>
            )
          ) : (
            <EmptyState
              title={`No universities match all ${active.length || "your"} filters.`}
              description="Increase your tuition limit, remove an admission constraint, or explore another country. Unreported figures are excluded from numeric filters."
              action={
                <button
                  className="button button-primary"
                  onClick={() => router.replace("/universities")}
                >
                  Clear filters
                </button>
              }
            />
          )}
          <div className="pagination-row">
            <button
              disabled={(result?.page ?? f.page) === 1 || busy}
              onClick={() => update({ page: (result?.page ?? f.page) - 1 })}
            >
              ← Previous
            </button>
            <span>
              Page {result?.page ?? f.page} of{" "}
              {Math.max(1, Math.ceil((result?.total ?? 0) / 24))}
            </span>
            <button
              disabled={
                (result?.page ?? f.page) * 24 >= (result?.total ?? 0) || busy
              }
              onClick={() => update({ page: (result?.page ?? f.page) + 1 })}
            >
              Next →
            </button>
          </div>
        </section>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mobile-filter-sheet"
          data-glass="panel"
        >
          <SheetTitle>Refine your research</SheetTitle>
          <SheetDescription>
            Changes update results immediately.
          </SheetDescription>
          {filters}
          <button
            className="button button-primary"
            onClick={() => setOpen(false)}
          >
            Show {result?.total ?? 0} results
          </button>
        </SheetContent>
      </Sheet>
      <QuickView university={quick} onClose={() => setQuick(null)} />
    </div>
  );
}
