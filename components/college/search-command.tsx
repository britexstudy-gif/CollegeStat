"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Globe2, Search, Clock3, X } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";
import { searchCatalogue } from "@/lib/supabase/catalogue";
import { countryName, countries, type University } from "@/lib/domain";
import { parseResearchQuery, filterURL } from "@/lib/research";
import { UniversityLogo } from "./primitives";
import { VoiceSearch } from "./voice-search";
export function SearchCommand() {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<University[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    const show = (event: Event) => {
      const q = (event as CustomEvent<{ query?: string }>).detail?.query;
      if (q) setQuery(q);
      setOpen(true);
    };
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") ||
        (e.key === "/" &&
          !target.isContentEditable &&
          !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("college-search", show);
    window.addEventListener("keydown", key);
    try {
      const v = JSON.parse(
        localStorage.getItem("collegestat:searches") || "[]",
      );
      if (Array.isArray(v))
        setRecent(v.filter((x) => typeof x === "string").slice(0, 3));
    } catch {}
    return () => {
      window.removeEventListener("college-search", show);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setBusy(true);
    setResults([]);
    setError("");
    const timer = setTimeout(
      () =>
        searchCatalogue(query.trim())
          .then((r) => {
            if (live) setResults(r);
          })
          .catch(() => {
            if (live) {
              setResults([]);
              setError("Search could not load. Try again.");
            }
          })
          .finally(() => {
            if (live) setBusy(false);
          }),
      150,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, open]);
  const go = (url: string) => {
    if (query.trim()) {
      const next = [
        query.trim(),
        ...recent.filter((x) => x !== query.trim()),
      ].slice(0, 3);
      setRecent(next);
      try {
        localStorage.setItem("collegestat:searches", JSON.stringify(next));
      } catch {}
    }
    setOpen(false);
    router.push(url);
  };
  const interpreted = parseResearchQuery(query);
  const places = query.trim()
    ? Object.entries(countries)
        .filter(([, v]) => v.toLowerCase().startsWith(query.toLowerCase()))
        .slice(0, 3)
    : [];
  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search CollegeStat"
      description="Find universities and destinations. Arrow keys select a result; Enter opens it."
      className="search-dialog spotlight-window"
      showCloseButton={false}
      shouldFilter={false}
    >
      <div className="spotlight-input">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search universities"
          aria-label="Search universities"
        />
        <VoiceSearch onResult={setQuery} />
        <button
          className="spotlight-close"
          onClick={() => setOpen(false)}
          aria-label="Close search"
        >
          <X size={19} />
        </button>
      </div>
      {interpreted.recognized && (
        <p className="search-understood">
          Searching{" "}
          {[
            interpreted.filters.field,
            interpreted.filters.degree,
            interpreted.filters.country &&
              countryName(interpreted.filters.country),
            interpreted.filters.cost_max != null &&
              `up to $${interpreted.filters.cost_max.toLocaleString()}`,
            interpreted.filters.q && `“${interpreted.filters.q}”`,
          ]
            .filter(Boolean)
            .join(" · ") || "your selected criteria"}
        </p>
      )}
      <CommandList aria-busy={busy}>
        {error && <p role="alert">{error}</p>}
        {busy && (
          <p className="search-status" role="status">
            Finding universities…
          </p>
        )}
        <CommandEmpty>
          {busy ? "" : "Try a university name, abbreviation or country."}
        </CommandEmpty>
        {!query && recent.length > 0 && (
          <CommandGroup heading="Recent searches">
            {recent.map((q) => (
              <CommandItem
                key={q}
                value={"recent:" + q}
                onSelect={() => setQuery(q)}
              >
                <Clock3 size={17} />
                <span>{q}</span>
              </CommandItem>
            ))}
            <button
              className="clear-searches"
              onClick={() => {
                setRecent([]);
                try {
                  localStorage.removeItem("collegestat:searches");
                } catch {}
              }}
            >
              Clear recent searches
            </button>
          </CommandGroup>
        )}
        <CommandGroup heading={query ? "Universities" : "Explore a university"}>
          {results.slice(0, 6).map((u) => (
            <CommandItem
              key={u.id}
              value={u.id}
              onSelect={() => go("/university/" + u.slug)}
            >
              <UniversityLogo university={u} size="sm" />
              <div>
                <strong>{u.name}</strong>
                <span>
                  {[u.city, countryName(u.country_code)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <ArrowUpRight size={16} />
            </CommandItem>
          ))}
        </CommandGroup>
        {places.length > 0 && (
          <CommandGroup heading="Destinations">
            {places.map(([code, name]) => (
              <CommandItem
                key={code}
                value={code}
                onSelect={() => go("/universities?country=" + code)}
              >
                <Globe2 size={18} />
                <span>{name}</span>
                <ArrowUpRight size={16} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {query && (
          <CommandGroup>
            <CommandItem
              value="all-results"
              onSelect={() =>
                go(
                  "/universities?" +
                    filterURL(parseResearchQuery(query).filters),
                )
              }
            >
              <Search size={18} />
              <span>See all results for “{query}”</span>
              <ArrowUpRight size={16} />
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
