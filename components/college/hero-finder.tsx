"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Globe2, Search, X } from "lucide-react";
import { countries, countryName, type University } from "@/lib/domain";
import { filterURL, parseResearchQuery } from "@/lib/research";
import { exploreUniversities, searchCatalogue } from "@/lib/supabase/catalogue";
import { UniversityLogo } from "./primitives";
import { useT } from "./i18n";
import type { MessageKey } from "@/lib/i18n/messages";

/** Common destinations for bachelor's applicants from Central Asia. */
const DESTINATIONS: [string, MessageKey][] = [
  ["DE", "land.find.de"],
  ["GB", "land.find.gb"],
  ["US", "land.find.us"],
  ["KR", "land.find.kr"],
];

/** The form still submits to the server before hydration. Suggestions are optional. */
export function HeroFinder({
  onSearch,
}: {
  onSearch: (query: string) => void;
}) {
  const router = useRouter();
  const t = useT();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const [results, setResults] = useState<University[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A shorter placeholder on phones, where the full one would be cut off.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const text = query.trim();
  const parsed = parseResearchQuery(text);
  const places =
    text.length >= 2
      ? Object.entries(countries)
          .filter(([, name]) =>
            name.toLowerCase().startsWith(text.toLowerCase()),
          )
          .slice(0, 2)
      : [];
  const options = [
    {
      key: "all",
      title: t("land.find.all", { q: text }),
      detail: t("land.find.all.detail"),
      href: "",
      university: undefined,
    },
    ...places.map(([code, name]) => ({
      key: code,
      title: name,
      detail: t("land.find.country.detail"),
      href: "/universities?" + filterURL({ country: code }),
      university: undefined,
    })),
    ...results.slice(0, 4).map((university) => ({
      key: university.id,
      title: university.name,
      detail: [university.city, countryName(university.country_code)]
        .filter(Boolean)
        .join(" · "),
      href: `/university/${university.slug}`,
      university,
    })),
  ];
  const open = focused && !dismissed && text.length >= 2;
  const interpretation = [
    parsed.filters.country && countryName(parsed.filters.country),
    parsed.filters.field,
    parsed.filters.degree,
    parsed.filters.cost_max != null &&
      `Reported tuition under $${parsed.filters.cost_max.toLocaleString()}`,
    parsed.filters.ielts_max != null &&
      `Reported IELTS minimum up to ${parsed.filters.ielts_max}`,
    parsed.filters.scholarships && "With scholarship records",
  ]
    .filter(Boolean)
    .join(" · ");

  useEffect(() => {
    if (open && active >= 0)
      document
        .getElementById(id + "-option-" + active)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setDismissed(true);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    const parsed = parseResearchQuery(text);
    setResults([]);
    setError("");
    setActive(-1);
    if (!focused || text.length < 2 || !parsed.filters.q.trim()) {
      setBusy(false);
      return;
    }
    let live = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(() => {
      timeout = setTimeout(() => controller.abort(), 8000);
      const request = parsed.recognized
        ? exploreUniversities(
            { ...parsed.filters, page: 1 },
            controller.signal,
          ).then((result) => result.universities)
        : searchCatalogue(text, controller.signal);
      request
        .then((rows) => {
          if (live) setResults(rows);
        })
        .catch(() => {
          if (live)
            // A flag, translated at render time, so the effect needs no `t`.
            setError("load");
        })
        .finally(() => {
          clearTimeout(timeout);
          if (live) setBusy(false);
        });
    }, 220);
    return () => {
      live = false;
      clearTimeout(timer);
      clearTimeout(timeout);
      controller.abort();
    };
    // Recognized country-only searches are available immediately, without fetching profiles.
  }, [text, focused]);

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    setDismissed(true);
    if (option.href) router.push(option.href);
    else onSearch(text);
  };
  return (
    <div
      className="lp-find"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setFocused(false);
      }}
    >
      <form
        className="lp-find-form"
        role="search"
        action="/universities"
        method="get"
        onSubmit={(event) => {
          event.preventDefault();
          setDismissed(true);
          onSearch(String(new FormData(event.currentTarget).get("q") || ""));
        }}
      >
        <input type="hidden" name="interpret" value="1" />
        <Search className="lp-find-icon" size={25} aria-hidden="true" />
        <input
          ref={input}
          aria-label={t("find.label")}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? id + "-results" : undefined}
          aria-activedescendant={
            open && active >= 0 ? id + "-option-" + active : undefined
          }
          name="q"
          maxLength={200}
          autoComplete="off"
          placeholder={narrow ? t("find.placeholder.short") : t("find.placeholder")}
          value={query}
          onFocus={() => {
            setFocused(true);
            setDismissed(false);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setDismissed(false);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDismissed(true);
              setActive(-1);
            }
            if (text.length < 2) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setDismissed(false);
              setActive((current) =>
                event.key === "ArrowDown"
                  ? (current + 1) % options.length
                  : current < 0
                    ? options.length - 1
                    : (current - 1 + options.length) % options.length,
              );
            } else if (event.key === "Enter" && open && active >= 0) {
              event.preventDefault();
              choose(active);
            }
          }}
        />
        {query && (
          <button
            type="button"
            className="lp-find-clear"
            aria-label={t("land.find.clear")}
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
          >
            <X size={16} />
          </button>
        )}
        <button className="lp-find-submit" type="submit">
          {t("nav.search")} <ArrowRight size={18} />
        </button>
      </form>
      {open && (
        <div className="lp-find-pop">
          <div
            id={id + "-results"}
            role="listbox"
            aria-label={t("land.find.results")}
            aria-busy={busy}
          >
            {options.map((option, index) => (
              <button
                key={option.key}
                id={id + "-option-" + index}
                type="button"
                role="option"
                aria-selected={index === active}
                tabIndex={-1}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <span className="lp-find-ico">
                  {option.university ? (
                    <UniversityLogo university={option.university} size="sm" />
                  ) : index === 0 ? (
                    <Search size={18} />
                  ) : (
                    <Globe2 size={18} />
                  )}
                </span>
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.detail}</small>
                </span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
          <p className="lp-find-status" role="status">
            {(error && t("land.find.error")) ||
              (busy
                ? t("find.busy")
                : interpretation
                  ? `Filters: ${interpretation}`
                  : t("land.find.hint"))}
          </p>
        </div>
      )}
      <nav className="lp-find-chips" aria-label={t("land.find.suggested")}>
        <span>{t("find.start")}</span>
        {DESTINATIONS.map(([code, label]) => (
          <Link key={code} href={"/universities?country=" + code}>
            {t(label)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
