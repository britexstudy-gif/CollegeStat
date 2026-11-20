"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Clock3,
  FileText,
  Globe2,
  GraduationCap,
  HandCoins,
  LayoutGrid,
  Map,
  Search,
} from "lucide-react";
import { CommandDialog, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from "@/components/ui/command";
import { searchCatalogue } from "@/lib/supabase/catalogue";
import { countryName, countries, type University } from "@/lib/domain";
import { parseResearchQuery, filterURL } from "@/lib/research";
import { regions } from "@/lib/regions";
import { exams } from "@/lib/certificates";
import { externalArticles } from "@/lib/article-library";
import { UniversityLogo } from "./primitives";
import { useCollege } from "./provider";
import { workspaceHref } from "@/lib/workspace-navigation";
import { FEATURES } from "@/lib/features";
import "./search-command.css";

const PAGES = [
  { label: "Home", href: "/dashboard", keys: "dashboard start today" },
  { label: "Plan and calendar", href: "/dashboard?section=Checklist", keys: "deadlines tasks calendar" },
  { label: "Writing", href: "/dashboard/prepare?section=Writing", keys: "essay personal statement common app ucas" },
  ...(FEATURES.testPrep ? [{ label: "Certificates", href: "/dashboard/certificates", keys: "tests exams practice mock sat ielts" }] : []),
  { label: "AI coach", href: "/dashboard/assistant", keys: "ai chat help assistant" },
  { label: "Articles", href: "/dashboard/library/articles", keys: "guides reading advice" },
  { label: "Universities", href: "/dashboard/universities", keys: "explore search colleges" },
  { label: "Rankings", href: "/dashboard/rankings", keys: "qs the arwu cwur" },
  { label: "Compare", href: "/dashboard/compare", keys: "side by side" },
  { label: "Scholarships", href: "/dashboard/library/scholarships", keys: "funding money aid" },
  { label: "Chances", href: "/dashboard/admissions-check", keys: "chances odds decision admission simulator" },
  { label: "Application forms", href: "/dashboard/application-practice", keys: "common app ucas uni-assist form practice" },
  { label: "People", href: "/dashboard/people", keys: "groups leaderboard community" },
  { label: "Plans", href: "/dashboard/plans", keys: "pricing plus pro upgrade early access" },
  { label: "Profile and settings", href: "/dashboard/profile", keys: "account settings goals" },
];

/** One minimal search for everything: pages, universities, regions,
 * scholarships, exams and articles, or ask the AI coach. */
export function SearchCommand() {
  const router = useRouter();
  const pathname = usePathname();
  const { universities, user, scholarships } = useCollege();
  const historyKey = "collegestat:searches:" + (user?.id || "anonymous");
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<University[]>([]),
    [busy, setBusy] = useState(false),
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
        (e.key === "/" && !target.isContentEditable && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("college-search", show);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("college-search", show);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    try {
      const v = JSON.parse(localStorage.getItem(historyKey) || "[]");
      if (Array.isArray(v)) queueMicrotask(() => alive && setRecent(v.filter((x) => typeof x === "string").slice(0, 4)));
    } catch {}
    return () => {
      alive = false;
    };
  }, [historyKey]);
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      queueMicrotask(() => {
        setResults([]);
        setBusy(false);
      });
      return;
    }
    let live = true;
    const controller = new AbortController();
    queueMicrotask(() => live && setBusy(true));
    const timer = setTimeout(() => {
      searchCatalogue(query.trim().slice(0, 200), controller.signal)
        .then((r) => live && setResults(r))
        .catch(() => live && setResults([]))
        .finally(() => live && setBusy(false));
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const q = query.trim().toLowerCase();
  const has = (...texts: (string | null | undefined)[]) => texts.some((t) => t?.toLowerCase().includes(q));
  const pages = useMemo(() => (q ? PAGES.filter((p) => has(p.label, p.keys)) : PAGES.slice(0, 6)), [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const places = q
    ? [
        ...regions.filter((r) => r.toLowerCase().startsWith(q)).map((r) => ({ code: "", name: r })),
        ...Object.entries(countries)
          .filter(([, v]) => v.toLowerCase().startsWith(q))
          .map(([code, name]) => ({ code, name })),
      ].slice(0, 4)
    : [];
  const awards = q.length >= 2 ? scholarships.filter((s) => has(s.name, s.description)).slice(0, 4) : [];
  const tests = q && FEATURES.testPrep ? exams.filter((e) => has(e.name, e.short, e.provider)).slice(0, 3) : [];
  const reads = q.length >= 3 ? externalArticles.filter((a) => has(a.title)).slice(0, 3) : [];

  const go = (url: string, external = false) => {
    if (query.trim()) {
      const next = [query.trim(), ...recent.filter((x) => x !== query.trim())].slice(0, 4);
      setRecent(next);
      try {
        localStorage.setItem(historyKey, JSON.stringify(next));
      } catch {}
    }
    setOpen(false);
    if (external) window.open(url, "_blank", "noreferrer");
    else router.push(url.startsWith("/dashboard") ? url : workspaceHref(url, user ? true : pathname || ""));
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search CollegeStat"
      description="Search pages, universities, regions, scholarships, exams and articles."
      className="cmd"
      showCloseButton={false}
      shouldFilter={false}
    >
      <div className="cmd-input">
        <Search size={18} aria-hidden="true" />
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search anything…" aria-label="Search" maxLength={200} />
        <kbd>esc</kbd>
      </div>
      <CommandList className="cmd-list" aria-busy={busy}>
        <CommandEmpty>{busy ? "Searching…" : "No results. Try a university, country or page name."}</CommandEmpty>

        {query.trim().length >= 2 && (
          <CommandGroup heading="Ask">
            <CommandItem value="ask-ai" onSelect={() => go("/dashboard/assistant?ask=" + encodeURIComponent(query.trim()))}>
              <Bot size={16} aria-hidden="true" />
              <span>
                Ask the AI coach: <b>{query.trim()}</b>
              </span>
              <ArrowRight size={14} aria-hidden="true" className="cmd-go" />
            </CommandItem>
          </CommandGroup>
        )}

        {!q && recent.length > 0 && (
          <CommandGroup heading="Recent">
            {recent.map((r) => (
              <CommandItem key={r} value={"recent:" + r} onSelect={() => setQuery(r)}>
                <Clock3 size={16} aria-hidden="true" />
                <span>{r}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {pages.length > 0 && (
          <CommandGroup heading="Pages">
            {pages.map((p) => (
              <CommandItem key={p.href} value={"page:" + p.href} onSelect={() => go(p.href)}>
                <LayoutGrid size={16} aria-hidden="true" />
                <span>{p.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(q.length >= 2 ? results : universities).length > 0 && (
          <CommandGroup heading="Universities">
            {(q.length >= 2 ? results : universities).slice(0, 5).map((u) => (
              <CommandItem key={u.id} value={"uni:" + u.id} onSelect={() => go("/dashboard/university/" + u.slug)}>
                <UniversityLogo university={u} size="sm" />
                <span className="cmd-two">
                  <b>{u.name}</b>
                  <small>{[u.city, countryName(u.country_code)].filter(Boolean).join(" · ")}</small>
                </span>
              </CommandItem>
            ))}
            {q.length >= 2 && (
              <CommandItem value="all-unis" onSelect={() => go("/dashboard/universities?" + filterURL(parseResearchQuery(query).filters))}>
                <Search size={16} aria-hidden="true" />
                <span>All universities for “{query.trim()}”</span>
              </CommandItem>
            )}
          </CommandGroup>
        )}

        {places.length > 0 && (
          <CommandGroup heading="Regions">
            {places.map((p) => (
              <CommandItem
                key={p.name}
                value={"place:" + p.name}
                onSelect={() =>
                  go("/dashboard/universities?" + (p.code ? "country=" + p.code : "region=" + encodeURIComponent(p.name)))
                }
              >
                {p.code ? <Globe2 size={16} aria-hidden="true" /> : <Map size={16} aria-hidden="true" />}
                <span>{p.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {awards.length > 0 && (
          <CommandGroup heading="Scholarships">
            {awards.map((s) => (
              <CommandItem
                key={s.id}
                value={"sch:" + s.id}
                onSelect={() => go(s.slug ? "/dashboard/library/scholarship/" + s.slug : "/dashboard/library/scholarships")}
              >
                <HandCoins size={16} aria-hidden="true" />
                <span>{s.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {tests.length > 0 && (
          <CommandGroup heading="Exams">
            {tests.map((e) => (
              <CommandItem key={e.slug} value={"exam:" + e.slug} onSelect={() => go("/dashboard/certificates/" + e.slug)}>
                <GraduationCap size={16} aria-hidden="true" />
                <span>{e.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {reads.length > 0 && (
          <CommandGroup heading="Articles">
            {reads.map((a) => (
              <CommandItem
                key={a.slug}
                value={"art:" + a.slug}
                onSelect={() => go("/dashboard/library/articles?read=" + encodeURIComponent(a.slug))}
              >
                {a.provider ? <BookOpen size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
                <span>{a.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      <footer className="cmd-foot">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> to move
        </span>
        <span>
          <kbd>↵</kbd> to open
        </span>
      </footer>
    </CommandDialog>
  );
}
