"use client";
import { AdmissionChip } from "@/components/college/admission-chip";
import { MoreResults, nextPageHref, useMoreResults } from "@/components/college/more-results";
import { workspaceHref } from "@/lib/workspace-navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Check,
  Grid2X2,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { useCollege } from "@/components/college/provider";
import { useT } from "@/components/college/i18n";
import { UniversityLogo } from "@/components/college/primitives";
import { VerifiedMark } from "@/components/college/essentials-check";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { countries, countryName, currency, type University } from "@/lib/domain";
import {
  Filters,
  readFilters,
  filterURL,
  filterSchema,
  defaultFilters,
  parseResearchQuery,
  valueOf,
} from "@/lib/research";
import { exploreUniversities, ExplorerResult } from "@/lib/supabase/catalogue";
import { filterLabel } from "@/lib/filter-labels";
import { rankLabel, rankingPublishers, universityRanks, type Publisher } from "@/lib/ranking-highlights";
import { saveProviderSearch } from "@/services/provider-account";

const ALLOWED_VIEWS = ["grid", "list"] as const;
export type DirectoryView = (typeof ALLOWED_VIEWS)[number];
const DIRECTORY_DEBOUNCE_MS = 220;
const DIRECTORY_TIMEOUT_MS = 8000;
const DIRECTORY_TIMEOUT_MESSAGE =
  "University results took too long to load. Please retry.";
const DIRECTORY_ERROR_MESSAGE =
  "University results could not be loaded. Please retry.";
function directoryView(value: string | null): DirectoryView {
  return (ALLOWED_VIEWS as readonly string[]).includes(value ?? "")
    ? (value as DirectoryView)
    : "list";
}

const HEADING = "font-[family-name:Poppins,Montserrat,Inter,system-ui,sans-serif]";
const MAX_COMPARE = 4;
const CENTRAL_ASIA = ["UZ", "KZ", "KG", "TJ", "TM"];
/** Foundation is not offered until programme data carries that level (no dead filters). */
const LEVELS = [
  ["Bachelor", "uni.list.level.bachelor"],
  ["Master", "uni.list.level.master"],
  ["Doctorate", "uni.list.level.phd"],
] as const;
const CENTRAL_ASIA_VALUE = CENTRAL_ASIA.join(",");
/** Broad subject areas published with the student data (THE subject tables). */
const SUBJECTS = [
  "Accounting & Finance", "Agriculture & Forestry", "Archaeology", "Architecture", "Art",
  "Biological Sciences", "Business & Management", "Chemical Engineering", "Chemistry",
  "Civil Engineering", "Communication & Media Studies", "Computer Science",
  "Earth & Marine Sciences", "Economics & Econometrics", "Education",
  "Electrical & Electronic Engineering", "Environmental", "General Engineering", "Geography",
  "Geology", "History", "Languages", "Law", "Literature & Linguistics",
  "Mathematics & Statistics", "Mechanical & Aerospace Engineering", "Medicine & Dentistry",
  "Other Health", "Performing Arts & Design", "Philosophy & Theology", "Physics & Astronomy",
  "Politics & International Studies (incl Development Studies)", "Psychology", "Sociology",
  "Sport Science", "Veterinary Science",
];
/** The hosted explorer (a SQL function) orders by QS only; THE and ARWU ordering exists in the bundled explorer. */
const HOSTED = process.env.NEXT_PUBLIC_CATALOGUE_SOURCE === "supabase";
const SORTS = [
  ["rank", "uni.list.sort.qs"],
  ...(HOSTED
    ? []
    : ([
        ["rank_the", "uni.list.sort.the"],
        ["rank_arwu", "uni.list.sort.arwu"],
      ] as const)),
  ["tuition", "uni.list.sort.tuition"],
  ["admission", "uni.list.sort.admission"],
] as const;
const TUITION_MIN = 2000;
const TUITION_MAX = 60000;
/** Filters the bar does not show; when set from a link or a query they appear as removable chips. */
const CHIP_KEYS = [
  "region", "city", "language", "type", "ielts_max", "admission_min", "admission_max",
  "intl_min", "graduation_min", "aid",
] as const;

function bestRank(u: University, sort: Filters["sort"]) {
  const ranks = universityRanks(u);
  const wanted: Publisher | undefined =
    sort === "rank_the" ? "the" : sort === "rank_arwu" ? "arwu" : sort === "rank" ? "qs" : undefined;
  return (
    (wanted && ranks.find((r) => r.provider === wanted)) ||
    (["qs", "the", "arwu"] as const).map((p) => ranks.find((r) => r.provider === p)).find(Boolean)
  );
}

export default function Directory({
  initialResult,
  initialQuery = "",
  initialError = "",
}: {
  initialResult?: ExplorerResult;
  initialQuery?: string;
  initialError?: string;
}) {
  const t = useT();
  const [hydrated, setHydrated] = useState(false);
  const s = useCollege(),
    pathname = usePathname(),
    router = useRouter(),
    params = useSearchParams(),
    query = hydrated ? params.toString() : initialQuery,
    f = readFilters(new URLSearchParams(query)),
    filterKey = filterURL(f),
    view = directoryView(new URLSearchParams(query).get("view"));
  const accountGeneration = useSyncExternalStore(
    useCallback(
      (listener) => s.accountScope.subscribe(listener),
      [s.accountScope],
    ),
    () => s.accountScope.capture().generation,
    () => 0,
  );
  const renderedAccount = {
    owner: s.user?.id || null,
    generation: accountGeneration,
  };
  const searchDraft = useRef<{ fingerprint: string; id: string } | null>(null);
  const searchPending = useRef<string | null>(null);
  const [pendingSearch, setPendingSearch] = useState<string | null>(null);
  const accountKey = `${renderedAccount.owner}:${accountGeneration}`;
  useEffect(() => setHydrated(true), []);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<ExplorerResult | null>(
      initialResult || null,
    ),
    [busy, setBusy] = useState(!initialResult && !initialError),
    [error, setError] = useState(initialError),
    [unparsed, setUnparsed] = useState(
      new URLSearchParams(query).get("unresolved") || "",
    ),
    [sheet, setSheet] = useState(false),
    [more, setMore] = useState(false),
    [search, setSearch] = useState(f.q);
  const update = (patch: Partial<Filters>) => {
    const next = new URLSearchParams(query);
    for (const key of Object.keys(filterSchema.shape)) next.delete(key);
    for (const [key, value] of new URLSearchParams(
      filterURL({ ...f, ...patch, page: patch.page ?? 1 }),
    ))
      next.set(key, value);
    router.replace(
      workspaceHref("/universities?" + next + window.location.hash, pathname),
      { scroll: false },
    );
  };
  const setViewParam = (name: DirectoryView) => {
    const next = new URLSearchParams(query);
    next.set("view", name);
    router.replace(
      workspaceHref("/universities?" + next + window.location.hash, pathname),
      { scroll: false },
    );
  };
  useEffect(() => {
    const initialKey = filterURL(
      readFilters(new URLSearchParams(initialQuery)),
    );
    if (initialError && filterKey === initialKey && retry === 0) {
      setBusy(false);
      return;
    }
    if (initialResult && filterKey === initialKey && retry === 0) {
      setResult(initialResult);
      setBusy(false);
      setError("");
      return;
    }
    let live = true;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    setBusy(true);
    const timer = setTimeout(() => {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, DIRECTORY_TIMEOUT_MS);
      exploreUniversities(
        readFilters(new URLSearchParams(filterKey)),
        controller.signal,
      )
        .then((r) => {
          if (live) {
            setResult(r);
            setError("");
          }
        })
        .catch(() => {
          if (!live) return;
          if (controller.signal.aborted && !timedOut) return;
          setError(
            timedOut ? DIRECTORY_TIMEOUT_MESSAGE : DIRECTORY_ERROR_MESSAGE,
          );
        })
        .finally(() => {
          if (timeout !== undefined) clearTimeout(timeout);
          if (live) setBusy(false);
        });
    }, DIRECTORY_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
      if (timeout !== undefined) clearTimeout(timeout);
      controller.abort();
    };
  }, [filterKey, retry, initialResult, initialQuery, initialError]);
  useEffect(() => {
    setSearch(f.q);
  }, [f.q]);
  const saveSearch = async () => {
    const token = { ...renderedAccount };
    if (!token.owner) {
      s.openAuth();
      return;
    }
    if (
      !s.accountScope.isCurrent(token) ||
      searchPending.current === accountKey
    )
      return;
    const name =
      search ||
      [f.country && (f.country === CENTRAL_ASIA_VALUE ? t("uni.list.country.ca") : countryName(f.country)), f.field, f.region]
        .filter(Boolean)
        .join(" · ") ||
      t("uni.list.title");
    const fingerprint = JSON.stringify([accountKey, name, f]);
    if (searchDraft.current?.fingerprint !== fingerprint)
      searchDraft.current = { fingerprint, id: crypto.randomUUID() };
    const draft = searchDraft.current;
    searchPending.current = accountKey;
    setPendingSearch(accountKey);
    try {
      await saveProviderSearch(s.accountScope, name, f, draft.id, token);
      if (!s.accountScope.isCurrent(token)) return;
      if (searchDraft.current === draft) searchDraft.current = null;
      toast.success(t("uni.list.saved"));
    } catch {
      if (s.accountScope.isCurrent(token)) toast.error(t("uni.list.save_failed"));
    } finally {
      if (s.accountScope.isCurrent(token)) {
        if (searchPending.current === accountKey) searchPending.current = null;
        setPendingSearch(null);
      }
    }
  };
  const chips = CHIP_KEYS.flatMap((key) => {
    const value = f[key];
    return value !== undefined && value !== "" && value !== defaultFilters[key]
      ? [[key, value] as const]
      : [];
  });
  const filterCount =
    [f.country, f.degree, f.field, f.scholarships].filter(Boolean).length +
    (f.cost_max != null ? 1 : 0) +
    chips.length;
  const reset = () => router.replace(workspaceHref("/universities", pathname));
  const total = result?.total ?? 0;
  const pages = useMoreResults(filterKey, busy ? null : result);
  const [tuitionDraft, setTuitionDraft] = useState(f.cost_max ?? TUITION_MAX);
  useEffect(() => setTuitionDraft(f.cost_max ?? TUITION_MAX), [f.cost_max]);
  const countries_ = Object.entries(countries).sort((a, b) => a[1].localeCompare(b[1]));
  const sortValue = SORTS.some(([v]) => v === f.sort) ? f.sort : "rank";
  const subjects = f.field && !SUBJECTS.includes(f.field) ? [f.field, ...SUBJECTS] : SUBJECTS;

  const fields = (inSheet: boolean) => (
    <div
      className={
        inSheet
          ? "flex flex-col gap-5 [&_[data-slot=native-select-wrapper]]:w-full"
          : "flex flex-wrap items-center gap-2"
      }
    >
      <Field label={t("uni.list.country")} show={inSheet}>
        <NativeSelect
          aria-label={t("uni.list.country")}
          value={f.country}
          onChange={(e) => update({ country: e.target.value })}
          className={inSheet ? "w-full" : ""}
        >
          <NativeSelectOption value="">{t("uni.list.country.all")}</NativeSelectOption>
          <NativeSelectOptGroup label={t("uni.list.country.ca")}>
            <NativeSelectOption value={CENTRAL_ASIA_VALUE}>{t("uni.list.country.ca")}</NativeSelectOption>
            {CENTRAL_ASIA.filter((c) => countries[c]).map((c) => (
              <NativeSelectOption key={c} value={c}>{countries[c]}</NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
          <NativeSelectOptGroup label={t("uni.list.country.all")}>
            {countries_.filter(([c]) => !CENTRAL_ASIA.includes(c)).map(([c, name]) => (
              <NativeSelectOption key={c} value={c}>{name}</NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        </NativeSelect>
      </Field>
      <Toggle
        variant="outline"
        pressed={f.country === CENTRAL_ASIA_VALUE}
        onPressedChange={(v) => update({ country: v ? CENTRAL_ASIA_VALUE : "" })}
        className={inSheet ? "w-full justify-start" : ""}
      >
        {f.country === CENTRAL_ASIA_VALUE && <Check />}
        {t("uni.list.country.ca")}
      </Toggle>
      <Field label={t("uni.list.level")} show={inSheet}>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label={t("uni.list.level")}
          value={f.degree}
          onValueChange={(v) => update({ degree: v })}
          className={inSheet ? "w-full flex-wrap" : ""}
        >
          {LEVELS.map(([value, key]) => (
            <ToggleGroupItem key={value} value={value} className={inSheet ? "flex-1" : ""}>
              {t(key)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field label={t("uni.list.subject")} show={inSheet}>
        <NativeSelect
          aria-label={t("uni.list.subject")}
          value={f.field}
          onChange={(e) => update({ field: e.target.value })}
          className={inSheet ? "w-full" : "max-w-44"}
        >
          <NativeSelectOption value="">{t("uni.list.subject")}</NativeSelectOption>
          {subjects.map((name) => (
            <NativeSelectOption key={name} value={name}>
              {name.replace(" (incl Development Studies)", "")}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <div
          className={
            "flex h-9 items-center gap-3 rounded-md border border-input px-3 text-sm " +
            (inSheet ? "w-full" : "")
          }
        >
          <span className="shrink-0 text-muted-foreground">{t("uni.list.tuition")}</span>
          <Slider
            aria-label={t("uni.list.tuition")}
            className={inSheet ? "flex-1" : "w-24"}
            min={TUITION_MIN}
            max={TUITION_MAX}
            step={1000}
            value={[Math.min(Math.max(tuitionDraft, TUITION_MIN), TUITION_MAX)]}
            onValueChange={([v]) => setTuitionDraft(v)}
            onValueCommit={([v]) => update({ cost_max: v >= TUITION_MAX ? undefined : v })}
          />
          <span className="w-16 shrink-0 text-right font-medium tabular-nums">
            {tuitionDraft >= TUITION_MAX ? t("uni.list.any") : currency(tuitionDraft, "USD", true)}
          </span>
      </div>
      <Toggle
        variant="outline"
        pressed={f.scholarships === "yes"}
        onPressedChange={(v) => update({ scholarships: v ? "yes" : "" })}
        className={inSheet ? "w-full justify-start" : ""}
      >
        {f.scholarships === "yes" && <Check />}
        {t("uni.list.scholarships")}
      </Toggle>
      <Button
        type="button"
        variant="ghost"
        aria-expanded={more}
        onClick={() => setMore((v) => !v)}
        className={inSheet ? "w-full justify-start" : ""}
      >
        <SlidersHorizontal />
        {t("uni.list.more")}
      </Button>
      {more && (
        <div className={"grid gap-2 " + (inSheet ? "w-full" : "w-full grid-cols-2 pt-1 md:grid-cols-4")}>
          <NativeSelect
            aria-label={t("uni.list.type")}
            value={f.type}
            onChange={(e) => update({ type: e.target.value })}
            className="w-full"
          >
            <NativeSelectOption value="">{t("uni.list.type.any")}</NativeSelectOption>
            <NativeSelectOption value="Public">{t("uni.list.type.public")}</NativeSelectOption>
            <NativeSelectOption value="Private">{t("uni.list.type.private")}</NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            aria-label={t("uni.list.language")}
            value={f.language}
            onChange={(e) => update({ language: e.target.value })}
            className="w-full"
          >
            <NativeSelectOption value="">{t("uni.list.language.any")}</NativeSelectOption>
            {["English", "German", "French"].map((l) => (
              <NativeSelectOption key={l} value={l}>{l}</NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label={t("uni.list.ielts")}
            value={f.ielts_max ?? ""}
            onChange={(e) =>
              update({ ielts_max: e.target.value ? Number(e.target.value) : undefined })
            }
            className="w-full"
          >
            <NativeSelectOption value="">{t("uni.list.ielts")}</NativeSelectOption>
            {[5.5, 6, 6.5, 7].map((n) => (
              <NativeSelectOption key={n} value={n}>{n.toFixed(1)}</NativeSelectOption>
            ))}
          </NativeSelect>
          <Input
            aria-label={t("uni.list.city")}
            placeholder={t("uni.list.city")}
            defaultValue={f.city}
            key={f.city}
            onBlur={(e) => update({ city: e.target.value.trim() })}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] pb-24 pt-6 md:pt-10">
      <h1 className={`${HEADING} text-[clamp(32px,4vw,48px)] font-semibold leading-[1.08] tracking-[-0.035em]`}>
        {t("uni.list.title")}
      </h1>
      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = parseResearchQuery(search);
          setUnparsed(parsed.unparsed);
          update(parsed.recognized ? parsed.filters : { q: parsed.filters.q });
        }}
      >
        <InputGroup className="h-12 rounded-full bg-card px-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={t("uni.list.search.label")}
            placeholder={t("uni.list.search.placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-base"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="submit"
              variant="default"
              size="icon-sm"
              className="rounded-full"
              aria-label={t("uni.list.search.apply")}
            >
              <ArrowRight />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <Button
          type="button"
          variant="outline"
          className="h-12 shrink-0 rounded-full px-4 md:hidden"
          onClick={() => setSheet(true)}
        >
          <SlidersHorizontal />
          <span className="sr-only">{t("uni.list.filters")}</span>
          {filterCount > 0 && <Badge className="rounded-full px-1.5">{filterCount}</Badge>}
        </Button>
      </form>
      <div className="mt-4 hidden md:block">{fields(false)}</div>
      {unparsed && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {t("uni.list.unparsed", { text: unparsed })}
        </p>
      )}
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map(([key, value]) => (
            <Button
              key={key}
              size="sm"
              variant="secondary"
              className="rounded-full"
              onClick={() => update({ [key]: defaultFilters[key] })}
            >
              {filterLabel(key, value)}
              <X />
            </Button>
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <p className="text-sm font-medium" aria-live="polite">
          {busy
            ? t("uni.list.updating")
            : total === 1
              ? t("uni.list.count_one")
              : t("uni.list.count", { n: total.toLocaleString("en") })}
        </p>
        <div className="flex items-center gap-2">
          {s.user && (
            <Button
              variant="ghost"
              size="sm"
              onClick={saveSearch}
              disabled={pendingSearch === accountKey}
            >
              <Bookmark />
              {t("uni.list.save_search")}
            </Button>
          )}
          <NativeSelect
            size="sm"
            aria-label={t("uni.list.sort.qs")}
            value={sortValue}
            onChange={(e) => update({ sort: e.target.value as Filters["sort"] })}
          >
            {SORTS.map(([value, key]) => (
              <NativeSelectOption key={value} value={value}>{t(key)}</NativeSelectOption>
            ))}
          </NativeSelect>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={view}
            onValueChange={(v) => v && setViewParam(v as DirectoryView)}
            className="hidden sm:flex"
          >
            <ToggleGroupItem value="list" aria-label={t("uni.list.view.list")}>
              <List />
            </ToggleGroupItem>
            <ToggleGroupItem value="grid" aria-label={t("uni.list.view.grid")}>
              <Grid2X2 />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      {(f.degree || f.field || f.cost_max != null) && (
        <p className="mt-2 text-xs text-muted-foreground">{t("uni.list.note")}</p>
      )}
      {!!result?.suggestions?.length && !busy && (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {t("uni.list.didyoumean")}{" "}
          {result.suggestions.map((u, i) => (
            <span key={u.slug}>
              {i > 0 && ", "}
              <button className="text-primary underline-offset-4 hover:underline" onClick={() => update({ q: u.name })}>
                {u.name}
              </button>
            </span>
          ))}
          ?
        </p>
      )}

      <div className="mt-5" aria-busy={busy}>
        {error ? (
          <Empty className="rounded-2xl border border-border">
            <EmptyHeader>
              <EmptyTitle>
                {error === DIRECTORY_TIMEOUT_MESSAGE
                  ? t("uni.list.err.timeout")
                  : t("uni.list.err.failed")}
              </EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setRetry((n) => n + 1)}>{t("uni.list.retry")}</Button>
            </EmptyContent>
          </Empty>
        ) : busy && !result ? (
          <div className="grid gap-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-[88px] rounded-2xl" />
            ))}
          </div>
        ) : result?.universities.length ? (
          <div
            className={
              (view === "grid" ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" : "grid grid-cols-1 gap-3") +
              (busy ? " opacity-60 transition-opacity" : "")
            }
          >
            {result.universities.map((u) => (
              <UniversityRow key={u.id} university={u} layout={view} sort={f.sort} />
            ))}
            {!busy && pages.rows.map((u) => (
              <UniversityRow key={u.id} university={u} layout={view} sort={f.sort} />
            ))}
          </div>
        ) : (
          <Empty className="rounded-2xl border border-border">
            <EmptyHeader>
              <EmptyTitle>{t("uni.list.empty")}</EmptyTitle>
              <EmptyDescription>{t("uni.list.empty_hint")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={reset}>{t("uni.list.clear")}</Button>
            </EmptyContent>
          </Empty>
        )}
      </div>
      {!error && !busy && result?.universities.length ? (
        <MoreResults more={pages} href={workspaceHref(nextPageHref(filterKey, pages.next, "/universities"), pathname)} />
      ) : null}
      {s.compare.length > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6">
          <Button asChild size="lg" className="rounded-full shadow-lg">
            <Link href={"/compare?ids=" + s.compare.slice(0, MAX_COMPARE).join(",")}>
              {t("uni.list.compare_go", { n: Math.min(s.compare.length, MAX_COMPARE) })}
              <ArrowRight />
            </Link>
          </Button>
        </div>
      )}
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{t("uni.list.filters")}</SheetTitle>
            <SheetDescription>{t("uni.list.sheet_desc")}</SheetDescription>
          </SheetHeader>
          <div className="px-4">{fields(true)}</div>
          <SheetFooter className="sticky bottom-0 flex-row gap-2 border-t border-border bg-background">
            <Button variant="outline" onClick={reset}>
              {t("uni.list.reset")}
            </Button>
            <Button className="flex-1" onClick={() => setSheet(false)}>
              {t("uni.list.show", { n: total.toLocaleString("en") })}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({
  label,
  show,
  children,
}: {
  label: string;
  show: boolean;
  children: React.ReactNode;
}) {
  return show && label ? (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  ) : (
    <>{children}</>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[72px]">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function UniversityRow({
  university: u,
  layout,
  sort,
}: {
  university: University;
  layout: DirectoryView;
  sort: Filters["sort"];
}) {
  const t = useT();
  const s = useCollege();
  const rank = bestRank(u, sort);
  const tuition = valueOf(u, "tuition");
  const admit = valueOf(u, "admission").value;
  const saved = s.saved.includes(u.id);
  const selected = s.compare.includes(u.id);
  const full = !selected && s.compare.length >= MAX_COMPARE;
  const place = [u.city, countryName(u.country_code)].filter(Boolean).join(", ");
  return (
    <article
      className={
        "flex min-w-0 gap-4 rounded-2xl border border-border bg-card p-4 transition duration-200 hover:-translate-y-px hover:border-foreground/25 " +
        (layout === "grid" ? "flex-col" : "flex-col md:flex-row md:items-center")
      }
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <UniversityLogo university={u} size="lg" />
        <div className="min-w-0">
          <Link
            href={"/university/" + u.slug}
            className="block font-semibold leading-snug hover:underline"
          >
            {u.name} <VerifiedMark university={u} />
          </Link>
          {place && <p className="mt-0.5 truncate text-sm text-muted-foreground">{place}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <AdmissionChip university={u} />
        {rank && (
          <a
            href={rank.url}
            target="_blank"
            rel="noreferrer"
            title={t("uni.list.rank_title", {
              publisher: rankingPublishers[rank.provider].name,
              year: rank.year,
            })}
          >
            <Badge variant="outline" className="h-7 rounded-full px-3 text-xs">
              {rankingPublishers[rank.provider].name} {rankLabel(rank)}
            </Badge>
          </a>
        )}
        {!rank && u.qs_asia && (
          <a href={u.qs_asia.url} target="_blank" rel="noreferrer" title={"QS Asia " + u.qs_asia.year}>
            <Badge variant="outline" className="h-7 rounded-full px-3 text-xs">
              QS Asia #{u.qs_asia.rank_label.replace(/^#/, "")}
            </Badge>
          </a>
        )}
        {tuition.value != null && tuition.currency && (
          <Fact label={t("uni.list.label.tuition")} value={currency(tuition.value, tuition.currency)} />
        )}
        {admit != null && (
          <Fact
            label={t("uni.list.label.admit")}
            value={admit.toLocaleString("en", { maximumFractionDigits: 1 }) + "%"}
          />
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-pressed={saved}
          aria-label={t(saved ? "uni.list.unsave" : "uni.list.save", { name: u.name })}
          onClick={() => void s.toggleSaved(u.id)}
          disabled={s.busy}
        >
          {saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
        </Button>
        <Button
          variant={selected ? "secondary" : "outline"}
          size="sm"
          aria-pressed={selected}
          disabled={full}
          title={full ? t("uni.list.compare_full") : undefined}
          aria-label={t(selected ? "uni.list.compare_remove" : "uni.list.compare", { name: u.name })}
          onClick={() => s.toggleCompare(u.id)}
        >
          {selected ? <Check /> : <Plus />}
          {selected ? t("uni.list.compare_added") : t("uni.list.compare_btn")}
        </Button>
      </div>
    </article>
  );
}
