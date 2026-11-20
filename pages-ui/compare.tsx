"use client";
import { workspaceHref } from "@/lib/workspace-navigation";
import { Fragment, useEffect, useState } from "react";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight, Link2, Plus, X } from "lucide-react";
import { useCollege } from "@/components/college/provider";
import { useT } from "@/components/college/i18n";
import { UniversityLogo } from "@/components/college/primitives";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type University, type Sourced, countryName, currency, dateLabel } from "@/lib/domain";
import { valueOf, type MetricKey } from "@/lib/research";
import { publicRequest, searchCatalogue } from "@/lib/supabase/catalogue";
import { establishedYear, institutionType } from "@/lib/institution-facts";
import { getSupabase } from "@/lib/supabase/client";
import { rankLabel, rankingPublishers, universityRanks, type Publisher } from "@/lib/ranking-highlights";
import { canonicalComparisonIDs } from "@/lib/comparison";
import type { MessageKey } from "@/lib/i18n/messages";

const MAX = 4;
const HEADING = "font-[family-name:Poppins,Montserrat,Inter,system-ui,sans-serif]";
const PAIRS: { key: MessageKey; names: string[]; ids: string[] }[] = [
  {
    key: "cmp.pair.korea",
    names: ["Seoul National", "Yonsei", "Korea University"],
    ids: [
      "6a9e2556-fc5f-56a2-bca0-9364f099818c",
      "b5f25065-0a86-517e-91f0-ff6bbe8c81d3",
      "6d72f6ce-a30c-54a4-8b99-97ae04a68a88",
    ],
  },
  {
    key: "cmp.pair.turkey",
    names: ["METU", "Bilkent", "Koç"],
    ids: [
      "be141d50-5df3-5bd2-8b44-744166b2402b",
      "6ba258c1-adba-5e46-9b8c-411b91c4b958",
      "1848c4c4-1bfb-5ae4-8322-6fda3dca4e50",
    ],
  },
  {
    key: "cmp.pair.europe",
    names: ["TU Munich", "Charles University", "Warsaw"],
    ids: [
      "44444444-4444-4444-8444-444444444444",
      "44fc5710-6980-5188-9d31-73c583212993",
      "29507709-c065-51f2-a63d-22ecc1ac26e4",
    ],
  },
  {
    key: "cmp.pair.home",
    names: ["Nazarbayev", "WIUT", "AUCA"],
    ids: [
      "69434102-e5f5-5311-9294-2f101f81906f",
      "66666666-6666-4666-8666-666666666666",
      "48bb7649-d12f-5854-b7d9-f586e7b81d72",
    ],
  },
];

type Item = { text: string; sub?: string; url?: string };
type Cell = { items: Item[]; num?: number | null; unit?: string; best?: boolean };
type Row = {
  id: string;
  label: string;
  better?: "low" | "high";
  cells: (Cell | null)[];
};
type Group = { key: string; label: string; rows: Row[] };

const sourceOf = (r?: Sourced | null) => r?.source_url || r?.data_sources?.url || undefined;
const single = (text: string, extra: Partial<Item> = {}, num?: number | null, unit?: string): Cell => ({
  items: [{ text, ...extra }],
  num,
  unit,
});
const year = (r?: Sourced | null) => (r?.year ? String(r.year) : undefined);
const pct = (v: number) => v.toLocaleString("en", { maximumFractionDigits: 1 }) + "%";

function metricCell(u: University, key: MetricKey, fmt: (n: number, currency?: string) => string): Cell | null {
  const v = valueOf(u, key);
  if (v.value == null) return null;
  return single(fmt(v.value, v.currency), { sub: year(v.record), url: sourceOf(v.record) }, v.value, v.currency);
}

const undergraduate = (text: string) =>
  /undergrad|first-year|bachelor/i.test(text) || !/master|mba|phd|doctor|postgrad|graduate|foundation/i.test(text);

function languageCell(u: University, kind: "IELTS" | "TOEFL"): Cell | null {
  const req = u.requirements.find(
    (r) =>
      r.kind.toUpperCase() === kind &&
      !r.program_id &&
      r.minimum != null &&
      undergraduate(r.label + " " + r.student_category),
  );
  if (req)
    return single(
      kind === "IELTS" ? req.minimum!.toFixed(1) : String(req.minimum),
      { sub: kind === "TOEFL" ? req.label.replace(/^TOEFL\s*/i, "") : undefined, url: sourceOf(req) },
      kind === "IELTS" ? req.minimum : null,
    );
  const a = u.admissions.find((a) => (kind === "IELTS" ? a.ielts_min : a.toefl_min) != null);
  const min = a && (kind === "IELTS" ? a.ielts_min : a.toefl_min);
  return a && min != null
    ? single(kind === "IELTS" ? min.toFixed(1) : String(min), { sub: year(a), url: sourceOf(a) }, kind === "IELTS" ? min : null)
    : null;
}

function costFor(u: University, category: string) {
  const all = u.costs.filter((c) => c.category === category && !c.program_id && c.amount != null);
  const preferred = all.filter((c) => /international/i.test(c.student_category));
  return [...(preferred.length ? preferred : all)].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];
}
function livingCell(u: University): Cell | null {
  const total = costFor(u, "total"),
    tuition = costFor(u, "tuition"),
    fees = costFor(u, "fees") ?? costFor(u, "mandatory_fees");
  const housing = costFor(u, "housing") ?? costFor(u, "room_board"),
    food = costFor(u, "food");
  let amount: number | null = null,
    record = total ?? housing;
  if (total && tuition && total.currency === tuition.currency) {
    const rest = total.amount - tuition.amount - (fees && fees.currency === total.currency ? fees.amount : 0);
    if (rest > 0) amount = rest;
  }
  if (amount == null && housing) {
    amount = housing.amount + (food && food.currency === housing.currency ? food.amount : 0);
    record = housing;
  }
  return amount != null && record
    ? single(currency(amount, record.currency), { sub: year(record), url: sourceOf(record) }, amount, record.currency)
    : null;
}
function feeCell(u: University): Cell | null {
  const fees = u.costs.filter((c) => c.category === "application_fee" && !c.program_id && c.amount != null);
  const fee = fees.find((c) => /international|first-year|undergrad/i.test(c.student_category)) ?? fees[0];
  return fee
    ? single(currency(fee.amount, fee.currency), { sub: year(fee), url: sourceOf(fee) }, fee.amount, fee.currency)
    : null;
}
function deadlineCell(u: University): Cell | null {
  const today = new Date().toISOString().slice(0, 10);
  const list = u.deadlines
    .filter((d) => undergraduate(d.title + " " + d.student_category) && d.due_at)
    .sort((a, b) => a.due_at.localeCompare(b.due_at));
  const upcoming = list.filter((d) => d.due_at.slice(0, 10) >= today);
  const shown = (upcoming.length ? upcoming : list.slice(-1)).slice(0, 2);
  return shown.length
    ? {
        items: shown.map((d) => ({
          text: dateLabel(d.due_at.slice(0, 10) + "T12:00:00"),
          sub: d.title.replace(/^Undergraduate application:\s*/i, ""),
          url: sourceOf(d),
        })),
      }
    : null;
}
function rankCell(u: University, provider: Publisher): Cell | null {
  const r = universityRanks(u).find((r) => r.provider === provider);
  return r ? single(rankLabel(r), { sub: String(r.year), url: r.url }, r.rank) : null;
}
const text = (value: string | number | null | undefined): Cell | null =>
  value == null || value === "" ? null : single(String(value));

function buildGroups(rows: University[], t: ReturnType<typeof useT>): Group[] {
  const groups: Group[] = [
    {
      key: "rankings",
      label: t("cmp.g.rankings"),
      rows: (["qs", "the", "arwu"] as const).map((p) => ({
        id: p,
        label: t("cmp.r.rank", { publisher: rankingPublishers[p].name }),
        better: "low" as const,
        cells: rows.map((u) => rankCell(u, p)),
      })),
    },
    {
      key: "costs",
      label: t("cmp.g.costs"),
      rows: [
        { id: "tuition", label: t("cmp.r.tuition"), better: "low", cells: rows.map((u) => metricCell(u, "tuition", (n, c) => (c ? currency(n, c) : n.toLocaleString()))) },
        { id: "living", label: t("cmp.r.living"), better: "low", cells: rows.map(livingCell) },
        { id: "fee", label: t("cmp.r.fee"), better: "low", cells: rows.map(feeCell) },
      ],
    },
    {
      key: "admissions",
      label: t("cmp.g.admissions"),
      rows: [
        { id: "admit", label: t("cmp.r.admit"), cells: rows.map((u) => metricCell(u, "admission", pct)) },
        { id: "ielts", label: t("cmp.r.ielts"), better: "low", cells: rows.map((u) => languageCell(u, "IELTS")) },
        { id: "toefl", label: t("cmp.r.toefl"), cells: rows.map((u) => languageCell(u, "TOEFL")) },
        { id: "deadlines", label: t("cmp.r.deadlines"), cells: rows.map(deadlineCell) },
      ],
    },
    {
      key: "outcomes",
      label: t("cmp.g.outcomes"),
      rows: [
        { id: "grad", label: t("cmp.r.graduation"), better: "high", cells: rows.map((u) => metricCell(u, "graduation_rate", pct)) },
        { id: "employ", label: t("cmp.r.employment"), better: "high", cells: rows.map((u) => metricCell(u, "employment_rate", pct)) },
      ],
    },
    {
      key: "size",
      label: t("cmp.g.size"),
      rows: [
        {
          id: "students",
          label: t("cmp.r.students"),
          cells: rows.map(
            (u) =>
              metricCell(u, "enrollment", (n) => n.toLocaleString("en")) ??
              (u.publisher_students?.students
                ? single(u.publisher_students.students.toLocaleString("en"), { url: u.publisher_students.source_url })
                : null),
          ),
        },
        { id: "intl", label: t("cmp.r.intl"), cells: rows.map((u) => metricCell(u, "international_students", pct)) },
        {
          id: "ratio",
          label: t("cmp.r.ratio"),
          better: "low",
          cells: rows.map(
            (u) =>
              metricCell(u, "student_faculty_ratio", (n) => n.toLocaleString("en", { maximumFractionDigits: 1 })) ??
              (u.publisher_students?.student_staff_ratio != null
                ? single(
                    String(u.publisher_students.student_staff_ratio),
                    { url: u.publisher_students.source_url },
                    u.publisher_students.student_staff_ratio,
                  )
                : null),
          ),
        },
        { id: "type", label: t("cmp.r.type"), cells: rows.map((u) => text(institutionType(u))) },
        { id: "founded", label: t("cmp.r.founded"), cells: rows.map((u) => text(establishedYear(u))) },
      ],
    },
  ];
  return groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => r.cells.some(Boolean)) }))
    .filter((g) => g.rows.length)
    .map((g) => ({
      ...g,
      rows: g.rows.map((r) => {
        const nums = r.cells.map((c) => (c && c.num != null ? c : null));
        const comparable = nums.filter(Boolean) as Cell[];
        const sameUnit = new Set(comparable.map((c) => c.unit ?? "")).size === 1;
        const values = comparable.map((c) => c.num as number);
        if (r.better && comparable.length >= 2 && sameUnit && new Set(values).size > 1) {
          const target = r.better === "low" ? Math.min(...values) : Math.max(...values);
          return { ...r, cells: r.cells.map((c) => (c && c.num === target ? { ...c, best: true } : c)) };
        }
        return r;
      }),
    }));
}

export default function Compare({
  initialUniversities = [],
  initialError = "",
}: {
  initialUniversities?: University[];
  initialError?: string;
}) {
  const t = useT();
  const s = useCollege(),
    params = useSearchParams(),
    pathname = usePathname(),
    router = useRouter();
  const idsParam = params.get("ids"),
    share = params.get("share");
  const selectedIDs = canonicalComparisonIDs(idsParam !== null ? idsParam.split(",") : s.compare).slice(0, MAX);
  const selectionKey = selectedIDs.join(",");
  const [rows, setRows] = useState(initialUniversities),
    [loading, setLoading] = useState(selectedIDs.length > 0 && !initialUniversities.length),
    [error, setError] = useState(initialError),
    [retry, setRetry] = useState(0),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [matches, setMatches] = useState<University[]>([]),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState(false);
  const { setCompare } = s;
  const go = (ids: string[]) => {
    const next = canonicalComparisonIDs(ids).slice(0, MAX);
    setCompare(next);
    const q = new URLSearchParams(params.toString());
    if (next.length) q.set("ids", next.join(","));
    else q.delete("ids");
    q.delete("share");
    router.replace(workspaceHref("/compare" + (q.size ? "?" + q : "") + window.location.hash, pathname), {
      scroll: false,
    });
  };
  useEffect(() => {
    setCompare(canonicalComparisonIDs(selectionKey ? selectionKey.split(",") : []));
  }, [selectionKey, setCompare]);
  useEffect(() => {
    if (!share || idsParam !== null) return;
    let live = true;
    const db = getSupabase();
    if (!db) {
      setError(t("cmp.error"));
      return;
    }
    setLoading(true);
    void db.rpc("read_shared_comparison", { share_id: share }).then(({ data, error }) => {
      if (!live) return;
      setLoading(false);
      if (error || !Array.isArray(data)) setError(t("cmp.error"));
      else
        router.replace(
          workspaceHref("/compare?ids=" + canonicalComparisonIDs(data).slice(0, MAX).join(","), pathname),
          { scroll: false },
        );
    });
    return () => {
      live = false;
    };
  }, [share, idsParam, router, retry, pathname, t]);
  useEffect(() => {
    let live = true;
    if (share && idsParam === null) return;
    const ids = selectionKey ? selectionKey.split(",") : [];
    if (!ids.length) {
      setRows([]);
      setLoading(false);
      setError("");
      return;
    }
    if (retry === 0 && ids.every((id) => initialUniversities.some((u) => u.id === id))) {
      setRows(ids.flatMap((id) => initialUniversities.filter((u) => u.id === id)));
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    setError("");
    setRows((previous) => ids.flatMap((id) => previous.filter((u) => u.id === id)));
    // Through the catalogue API so records carry the merged requirements, fees and dates.
    publicRequest<University[]>("ids=" + encodeURIComponent(ids.join(",")), controller.signal)
      .then((result) => {
        if (live) {
          setRows(ids.flatMap((id) => result.filter((u) => u.id === id)));
          setLoading(false);
        }
      })
      .catch(() => {
        if (live) {
          setLoading(false);
          setError(t("cmp.error"));
        }
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      live = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [selectionKey, retry, share, idsParam, initialUniversities, t]);
  useEffect(() => {
    let live = true;
    setMatches([]);
    setSearchError(false);
    if (query.trim().length < 2) {
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      void searchCatalogue(query.trim(), controller.signal)
        .then((result) => live && (setMatches(result), setSearching(false)))
        .catch(() => live && (setSearchError(true), setSearching(false)));
    }, 220);
    return () => {
      live = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const groups = buildGroups(rows, t);
  const missing = selectedIDs.filter((id) => !rows.some((u) => u.id === id));
  const share_ = async () => {
    const url = location.origin + "/compare?ids=" + rows.map((u) => u.id).join(",");
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("cmp.copied"));
    } catch {
      toast(t("cmp.copy_failed"));
    }
  };
  const results = matches.filter((u) => !selectedIDs.includes(u.id));
  const cols = Math.max(rows.length, 1);
  // The public navbar floats above the page; the dashboard has no sticky bar.
  const stick = pathname.startsWith("/dashboard") ? "md:top-0" : "md:top-[92px]";

  return (
    <div className="mx-auto w-full max-w-[1200px] pb-24 pt-6 md:pt-10">
      <div className="grid gap-4">
        <h1 className={`${HEADING} text-[clamp(32px,4vw,48px)] font-semibold leading-[1.08] tracking-[-0.035em]`}>
          {t("cmp.title")}
        </h1>
        <p className="text-muted-foreground">{t("cmp.lede")}</p>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          className="rounded-full"
          disabled={selectedIDs.length >= MAX}
          onClick={() => setOpen(true)}
          title={selectedIDs.length >= MAX ? t("cmp.add.full") : undefined}
        >
          <Plus />
          {t("cmp.add.label")}
        </Button>
        {rows.length >= 2 && (
          <Button variant="ghost" onClick={share_}>
            <Link2 />
            {t("cmp.share")}
          </Button>
        )}
        {selectedIDs.length > 0 && (
          <Button variant="ghost" onClick={() => go([])}>
            {t("cmp.clear")}
          </Button>
        )}
      </div>
      <CommandDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setQuery("");
        }}
        title={t("cmp.add.label")}
        description={t("cmp.add.placeholder")}
        shouldFilter={false}
      >
        <CommandInput placeholder={t("cmp.add.placeholder")} value={query} onValueChange={setQuery} />
        <CommandList>
          {query.trim().length >= 2 && (
            <CommandEmpty>
              {searching ? t("cmp.add.searching") : searchError ? t("cmp.add.error") : t("cmp.add.none")}
            </CommandEmpty>
          )}
          {results.slice(0, 8).map((u) => (
            <CommandItem
              key={u.id}
              value={u.id}
              onSelect={() => {
                go([...selectedIDs, u.id]);
                setOpen(false);
                setQuery("");
              }}
              className="gap-3"
            >
              <UniversityLogo university={u} size="sm" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{u.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[u.city, countryName(u.country_code)].filter(Boolean).join(", ")}
                </span>
              </span>
            </CommandItem>
          ))}
        </CommandList>
      </CommandDialog>

      {error && (
        <div role="alert" className="mt-6 flex items-center gap-3 rounded-2xl border border-border p-4 text-sm">
          {error}
          <Button size="sm" variant="outline" onClick={() => setRetry((v) => v + 1)}>
            {t("cmp.retry")}
          </Button>
        </div>
      )}
      {!loading && !error && missing.length > 0 && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {t("cmp.unavailable", { n: missing.length })}{" "}
          <button className="text-primary underline-offset-4 hover:underline" onClick={() => go(rows.map((u) => u.id))}>
            {t("cmp.unavailable_remove")}
          </button>
        </p>
      )}

      {loading && rows.length === 0 ? (
        <Skeleton className="mt-8 h-96 rounded-2xl" aria-label={t("cmp.loading")} />
      ) : rows.length > 0 ? (
        <>
          {rows.length === 1 && <p className="mt-6 text-sm text-muted-foreground">{t("cmp.one_more")}</p>}
          <div
            role="region"
            aria-label={t("cmp.region")}
            tabIndex={0}
            className="relative mt-6 max-h-[calc(100dvh-150px)] snap-x snap-mandatory scroll-pl-[104px] overflow-auto rounded-2xl border border-border bg-card md:max-h-none md:overflow-visible"
          >
            <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: `calc(104px + ${cols} * 224px)` }}>
              <TableHeader>
                <TableRow className="border-0 hover:bg-transparent">
                  <TableHead className={`sticky left-0 top-0 z-30 w-[104px] rounded-tl-2xl border-b border-border bg-card ${stick} md:w-[200px]`} />
                  {rows.map((u) => (
                    <TableHead
                      key={u.id}
                      scope="col"
                      className={`sticky top-0 z-20 h-auto snap-start whitespace-normal border-b border-border bg-card p-3 text-left align-top last:rounded-tr-2xl ${stick}`}
                    >
                      <div className="flex items-start gap-3">
                        <UniversityLogo university={u} size="md" />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={"/university/" + u.slug}
                            className="line-clamp-2 font-semibold leading-snug text-foreground hover:underline"
                          >
                            {u.name}
                          </Link>
                          <p className="mt-0.5 truncate text-xs font-normal text-muted-foreground">
                            {[u.city, countryName(u.country_code)].filter(Boolean).join(", ")}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t("cmp.remove", { name: u.name })}
                          onClick={() => go(selectedIDs.filter((id) => id !== u.id))}
                        >
                          <X />
                        </Button>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <Fragment key={g.key}>
                    <TableRow className="border-0 hover:bg-transparent">
                      <TableHead
                        scope="rowgroup"
                        className="sticky left-0 z-10 h-auto bg-muted px-3 py-2 text-left text-xs font-semibold text-muted-foreground"
                      >
                        {g.label}
                      </TableHead>
                      <TableCell colSpan={cols} className="bg-muted p-0" />
                    </TableRow>
                    {g.rows.map((r) => (
                      <TableRow key={r.id} className="border-0 hover:bg-transparent">
                        <TableHead
                          scope="row"
                          className="sticky left-0 z-10 h-auto whitespace-normal border-b border-border bg-card px-3 py-3 text-left align-top text-xs font-medium leading-snug text-muted-foreground md:text-sm"
                        >
                          {r.label}
                        </TableHead>
                        {r.cells.map((c, i) => (
                          <TableCell
                            key={rows[i].id}
                            className="snap-start whitespace-normal border-b border-border p-1.5 align-top"
                          >
                            {c && (
                              <div
                                className={
                                  "rounded-lg px-2 py-1.5 " +
                                  (c.best ? "bg-primary/10 font-semibold text-foreground" : "")
                                }
                              >
                                {c.items.map((it, k) => (
                                  <div key={k} className={k ? "mt-1.5" : ""}>
                                    <span className="tabular-nums">{it.text}</span>
                                    {it.url && (
                                      <a
                                        href={it.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        aria-label={t("cmp.source")}
                                        title={t("cmp.source")}
                                        className="ml-1 inline-flex align-middle text-muted-foreground hover:text-primary"
                                      >
                                        <ArrowUpRight className="size-3.5" />
                                      </a>
                                    )}
                                    {it.sub && (
                                      <span className="block text-xs font-normal text-muted-foreground">{it.sub}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </table>
          </div>
          {groups.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("cmp.nodata")}</p>
          ) : (
            rows.length >= 2 && <p className="mt-3 text-xs text-muted-foreground">{t("cmp.legend")}</p>
          )}
        </>
      ) : (
        !loading &&
        !error && (
          <Empty className="mt-8 items-stretch rounded-2xl border border-border p-6 md:p-10">
            <EmptyHeader className="max-w-none items-start text-left">
              <EmptyTitle className={`${HEADING} text-2xl font-semibold`}>{t("cmp.empty.title")}</EmptyTitle>
              <EmptyDescription>{t("cmp.empty.lede")}</EmptyDescription>
            </EmptyHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              {PAIRS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => go(p.ids)}
                  className="rounded-xl border border-border p-4 text-left transition hover:-translate-y-px hover:border-foreground/30"
                >
                  <span className="block font-semibold">{t(p.key)}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{p.names.join(" · ")}</span>
                </button>
              ))}
            </div>
            <EmptyContent className="max-w-none items-start">
              <Button asChild variant="outline" className="rounded-full">
                <Link href="/universities">{t("cmp.browse")}</Link>
              </Button>
            </EmptyContent>
          </Empty>
        )
      )}
    </div>
  );
}
