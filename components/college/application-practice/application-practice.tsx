"use client";
import { List, ListRow, Page, PageHeader, StatusPill, Tabs, UniLogo } from "@/components/college/dash-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarClock, Check, ExternalLink, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { countryName } from "@/lib/domain";
import { ALTERNATIVES, detectPlatform, groupApplications, nextDeadline, type PlatformData, type PlatformMatch } from "@/lib/application-platforms";
import { useI18n, type Translate } from "../i18n";
import { cn } from "@/lib/utils";
import rawData from "./platform-data.json";
import { Simulator } from "./simulator";
import { emptyState, loadState, saveState, type PracticeState, type StoredUniversity } from "./store";
import { overallProgress, sectionsFor, seedChoices, validate, type FormContext, type Values } from "./forms";
import { prefillValues, type PracticeProfile } from "./prefill";
import { useCollege } from "../provider";
import { answersFrom, testScore } from "../onboarding-steps";
import { GRADE_SCALES } from "@/lib/grades/convert";
import type { IntakePreferences } from "@/lib/student-intake";

/** The parts of the student's profile a practice form can reuse. */
export function practiceProfile(prefs: unknown, name: string | null | undefined, email: string | undefined): PracticeProfile {
  const a = answersFrom((prefs || {}) as IntakePreferences, name);
  const taken = (id: string) => {
    const t = a.tests.find((x) => x.id === id && x.status === "taken");
    return t && testScore(t.id, t.score) ? t.score : undefined;
  };
  const english = ["ielts", "toefl", "duolingo"].map((id) => ({ test: id, score: taken(id) })).find((x) => x.score);
  return {
    name: a.name,
    email,
    country: a.home_country ? countryName(a.home_country) : undefined,
    city: a.home_city,
    school: a.school_name,
    certificate: a.certificate,
    grade: a.grade,
    gradeMax: a.grade_scale ? GRADE_SCALES[a.grade_scale].max : undefined,
    sat: taken("sat"),
    act: taken("act"),
    english: english?.score ? { test: english.test, score: english.score } : undefined,
    activities: a.activity_list,
    honours: a.honours,
  };
}

const data = rawData as unknown as PlatformData;

const platformName = (m: PlatformMatch, t: Translate) => (m.platform.id === "direct" ? t("app.sim.platform.direct") : m.platform.name);

/** "United Kingdom → UCAS": why this university is on this platform. */
function routeLabel(m: PlatformMatch, u: StoredUniversity, t: Translate) {
  const to = platformName(m, t);
  const r = m.reason;
  const from =
    r.kind === "verified" ? t("app.sim.why.verified")
    : r.kind === "member" ? t("app.sim.why.member")
    : r.kind === "institution" ? r.portal
    : r.kind === "region" ? r.region
    : r.kind === "country" ? countryName(u.country_code)
    : t("app.sim.why.fallback");
  return `${from} → ${to}`;
}

function RouteChip({ match, uni }: { match: PlatformMatch; uni: StoredUniversity }) {
  const { t } = useI18n();
  const source = match.reason.kind === "verified" || match.reason.kind === "member" || match.reason.kind === "institution" ? match.reason.source : null;
  return (
    <Badge variant="secondary" className="max-w-full gap-1.5 whitespace-normal font-normal">
      <span>{routeLabel(match, uni, t)}</span>
      {source && (
        <a href={source} target="_blank" rel="noreferrer" aria-label={t("app.sim.source")} className="text-muted-foreground hover:text-foreground">
          <ExternalLink className="size-3" />
        </a>
      )}
    </Badge>
  );
}

function toStored(u: Record<string, unknown>): StoredUniversity {
  return {
    id: String(u.id),
    name: String(u.name),
    slug: String(u.slug || ""),
    country_code: String(u.country_code || ""),
    city: typeof u.city === "string" ? u.city : null,
    website: typeof u.website === "string" ? u.website : null,
  };
}

function UniversityPicker({ added, onAdd }: { added: Set<string>; onAdd: (u: StoredUniversity) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<StoredUniversity[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch("/api/catalog?mode=search&q=" + encodeURIComponent(query), { signal: ctl.signal });
        const rows = res.ok ? await res.json() : [];
        setResults(Array.isArray(rows) ? rows.slice(0, 8).map(toStored) : []);
      } catch {
        if (!ctl.signal.aborted) setResults([]);
      } finally {
        if (!ctl.signal.aborted) setBusy(false);
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q]);
  const shown = q.trim().length < 2 ? [] : results;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="dk-btn dk-btn--secondary w-full !justify-start font-normal text-[var(--dk-muted)] sm:w-80">
          <Search />
          {t("app.sim.add")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,26rem)] p-0">
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder={t("app.sim.search")} />
          <CommandList>
            {busy && <div className="flex justify-center p-3"><Spinner /></div>}
            {!busy && q.trim().length >= 2 && shown.length === 0 && <CommandEmpty>{t("app.sim.none")}</CommandEmpty>}
            {shown.length > 0 && (
              <CommandGroup>
                {shown.map((u) => {
                  const m = detectPlatform(u, data);
                  const on = added.has(u.id);
                  return (
                    <CommandItem
                      key={u.id}
                      value={u.id}
                      disabled={on}
                      onSelect={() => {
                        onAdd(u);
                        setOpen(false);
                        setQ("");
                      }}
                      className="flex-col items-start gap-0.5"
                    >
                      <span className="flex w-full items-center gap-2 font-medium">{u.name}{on && <Check className="ml-auto size-4" />}</span>
                      <span className="text-xs text-muted-foreground">{[u.city, countryName(u.country_code)].filter(Boolean).join(", ")} · {routeLabel(m, u, t)}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DeadlineBanner({ universities }: { universities: StoredUniversity[] }) {
  const { t, lang } = useI18n();
  const [now] = useState(() => Date.now());
  const found = useMemo(() => {
    const owner = new Map<object, StoredUniversity>();
    const rows = universities.flatMap((u) => (data.dates[u.id] || []).map((r) => (owner.set(r, u), r)));
    const hit = nextDeadline(rows, new Date(now).toISOString().slice(0, 10));
    return hit ? { ...hit, uni: owner.get(hit.row)! } : null;
  }, [universities, now]);
  if (!found) return null;
  const date = new Date(found.row.date.slice(0, 10) + "T12:00:00Z");
  const days = Math.round((date.getTime() - now) / 86400000);
  const when = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: "UTC" }).format(date);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border px-4 py-3 text-sm", found.past ? "bg-muted/40 text-muted-foreground" : "bg-primary/5")}>
      <CalendarClock className="size-4 shrink-0" />
      <span className="font-medium">{found.past ? t("app.sim.dl.past") : t("app.sim.dl.next")}</span>
      <span className="min-w-0">{found.uni.name} · {found.row.title} · {when}</span>
      {!found.past && <Badge variant="outline">{t("app.sim.dl.days", { n: Math.max(0, days) })}</Badge>}
      <a href={found.row.source} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline">
        {t("app.sim.source")}
        <ExternalLink className="size-3" />
      </a>
    </div>
  );
}

/** Application practice: add universities, get the right application system for
 * each, and fill in a practice copy of it. Practice only, nothing is sent. */
export function ApplicationPractice({ initial }: { initial?: PracticeState }) {
  const { t } = useI18n();
  const slug = useSearchParams().get("u");
  const [state, setState] = useState<PracticeState>(initial || emptyState);
  const [ready, setReady] = useState(!!initial);
  const [saved, setSaved] = useState(true);
  const seeded = useRef<string | null>(null);

  useEffect(() => {
    if (initial) return;
    const stored = loadState();
    queueMicrotask(() => {
      setState(stored);
      setReady(true);
    });
  }, [initial]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setSaved(saveState(state)), 400);
    return () => clearTimeout(timer);
  }, [state, ready]);

  const add = useCallback((u: StoredUniversity) => {
    setState((s) => {
      if (s.universities.some((x) => x.id === u.id)) return s;
      const key = groupApplications([...s.universities, u], data).find((g) => g.universities.some((x) => x.id === u.id))!.key;
      return { ...s, universities: [...s.universities, u], active: key };
    });
  }, []);

  // ?u=<slug> adds that university once.
  useEffect(() => {
    if (!ready || !slug || seeded.current === slug) return;
    seeded.current = slug;
    // Already added: open that university's application instead.
    const existing = state.universities.find((u) => u.slug === slug);
    if (existing) {
      const key = groupApplications(state.universities, data).find((g) => g.universities.some((x) => x.id === existing.id))?.key;
      if (key) queueMicrotask(() => setState((s) => ({ ...s, active: key })));
      return;
    }
    fetch("/api/catalog?slug=" + encodeURIComponent(slug))
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, unknown> | null>) : null))
      .then((u) => u?.id && u.name && add(toStored(u)))
      .catch(() => {});
  }, [ready, slug, state.universities, add]);

  const groups = useMemo(() => groupApplications(state.universities, data), [state.universities]);
  const group = groups.find((g) => g.key === state.active) || groups[0];

  // UK universities fill the empty UCAS choice slots.
  useEffect(() => {
    setState((s) => {
      let changed = false;
      const values = { ...s.values };
      for (const g of groups)
        if (g.platform.id === "ucas") {
          const next = seedChoices(values[g.key] || {}, g.universities);
          if (Object.keys(next).length !== Object.keys(values[g.key] || {}).length) {
            values[g.key] = next;
            changed = true;
          }
        }
      return changed ? { ...s, values } : s;
    });
  }, [groups]);

  const ctxOf = useCallback(
    (g: (typeof groups)[number]): FormContext => {
      const matches = g.universities.map((u) => detectPlatform(u, data));
      return {
        kind: g.platform.kind,
        platform: g.platform.id,
        universities: g.universities.map((u) => ({ id: u.id, name: u.name, country_code: u.country_code })),
        commonApp: data.common_app,
        vpd: matches.some((m) => m.vpd),
      };
    },
    [],
  );
  const ctx = useMemo(() => (group ? ctxOf(group) : null), [group, ctxOf]);

  // Untouched fields are filled from the profile once per application.
  const { profile, user } = useCollege();
  const fromProfile = useMemo(
    () => (profile ? practiceProfile(profile.preferences, profile.display_name, user?.email) : null),
    [profile, user?.email],
  );
  const [filled, setFilled] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!ready || !group || !ctx || !fromProfile) return;
    const add = prefillValues(sectionsFor(ctx), fromProfile, state.values[group.key] || {});
    const n = Object.keys(add).length;
    if (!n) return;
    queueMicrotask(() => {
      setState((s) => ({ ...s, values: { ...s.values, [group.key]: { ...add, ...(s.values[group.key] || {}) } } }));
      setFilled((f) => ({ ...f, [group.key]: (f[group.key] || 0) + n }));
    });
  }, [ready, group, ctx, fromProfile, state.values]);
  const percents = useMemo(
    () =>
      Object.fromEntries(
        groups.map((g) => {
          const c = ctxOf(g);
          const sections = sectionsFor(c);
          const values = state.values[g.key] || {};
          return [g.key, overallProgress(sections, values, validate(sections, values)).percent];
        }),
      ),
    [groups, state.values, ctxOf],
  );

  const setValues = (update: (v: Values) => Values) =>
    setState((s) => ({ ...s, values: { ...s.values, [group.key]: update(s.values[group.key] || {}) } }));
  const remove = (id: string) =>
    setState((s) => ({ ...s, universities: s.universities.filter((u) => u.id !== id) }));
  const alternatives = group
    ? [...new Set(group.universities.flatMap((u) => detectPlatform(u, data).alternatives))].filter((a) => ALTERNATIVES[a].url)
    : [];

  return (
    <Page>
      <PageHeader title={t("d2.nav.forms")} description={t("app.sim.lead")} />

      <section className="dk-section" aria-label={t("app.sim.applications")}>
        <UniversityPicker added={new Set(state.universities.map((u) => u.id))} onAdd={add} />
        {state.universities.length > 0 && (
          <List>
            {state.universities.map((u) => (
              <ListRow
                key={u.id}
                className="ap-uni"
                leading={<UniLogo university={{ ...u, slug: u.slug || "", logo_url: null } as never} />}
                title={u.name}
                meta={<RouteChip match={detectPlatform(u, data)} uni={u} />}
                trailing={
                  <Button variant="ghost" size="icon-xs" className="dk-btn dk-btn--ghost dk-btn--icon dk-btn--sm" onClick={() => remove(u.id)} aria-label={t("app.sim.remove", { name: u.name })}>
                    <X />
                  </Button>
                }
              />
            ))}
          </List>
        )}
      </section>

      {group && ctx && (
        <>
          {groups.length > 1 && (
            <Tabs
              label={t("app.sim.applications")}
              value={group.key}
              onChange={(key) => setState((s) => ({ ...s, active: key }))}
              tabs={groups.map((g) => ({
                value: g.key,
                label: (
                  <span className="inline-flex items-center gap-2">
                    {g.platform.id === "direct" ? g.universities[0].name : g.platform.name}
                    <span className="dk-faint dk-num text-[12px]">{percents[g.key]}%</span>
                  </span>
                ),
              }))}
            />
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-[16px] font-semibold tracking-tight">
              {group.platform.id === "direct" ? group.universities[0].name : group.platform.name}
            </h2>
            <StatusPill>{t("app.sim.practice")}</StatusPill>
            {alternatives.map((a) => (
              <a key={a} href={ALTERNATIVES[a].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
                {t("app.sim.also", { name: ALTERNATIVES[a].name })}
                <ExternalLink className="size-3" />
              </a>
            ))}
            <span className="ml-auto text-[12px] text-[var(--dk-faint)]">{saved ? t("app.sim.saved") : t("app.sim.save_failed")}</span>
          </div>
          <DeadlineBanner universities={group.universities} />
          {!!filled[group.key] && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Check className="size-4 text-primary" />
              {t("ws.sim.prefilled", { n: filled[group.key] })}
            </p>
          )}
          <Simulator
            key={group.key}
            ctx={ctx}
            values={state.values[group.key] || {}}
            setValues={setValues}
            section={state.section[group.key] || ""}
            setSection={(id) => setState((s) => ({ ...s, section: { ...s.section, [group.key]: id } }))}
            title={(group.platform.id === "direct" ? group.universities[0].name : group.platform.name) + " · " + t("app.sim.practice")}
          />
        </>
      )}
      {!group && ready && (
        <p className="flex items-center gap-2 text-[13px] text-[var(--dk-muted)]"><Plus className="size-4" />{t("app.sim.empty")}</p>
      )}
    </Page>
  );
}
