"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, ChevronLeft, Globe, Search } from "lucide-react";
import { useT } from "./i18n";
import { useCollege } from "./provider";
import { UniversityLogo } from "./primitives";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { workspaceHref } from "@/lib/workspace-navigation";
import { regions } from "@/lib/regions";
import type { University } from "@/lib/domain";
import {
  CENTRAL_ASIA,
  CENTRAL_ASIA_REGION,
  NATIONAL_SOURCES,
  RANKING_PAGE_SIZE,
  RANKING_SOURCES,
  type RankingData,
  type RankingRow,
} from "@/lib/ranking-sources";
import type { MessageKey } from "@/lib/i18n/messages";

const REGION_KEYS: Record<string, MessageKey> = {
  Africa: "rank.reg.africa",
  Asia: "rank.reg.asia",
  Europe: "rank.reg.europe",
  "North America": "rank.reg.na",
  "South America": "rank.reg.sa",
  Oceania: "rank.reg.oceania",
};
const DISPLAY = "[font-family:Poppins,Montserrat,Inter,system-ui,sans-serif]";

const PLATE = "relative inline-flex h-9 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border";

/** Every publisher mark sits on the same 80x36 plate, centred and contained.
 * White marks use a dark plate, wordmark-only logos a letter. */
function Logo({ src, name, mark, letter }: { src?: string; name: string; mark: "full" | "crop" | "dark" | "letter"; letter?: string }) {
  if (mark === "letter")
    return (
      <span className={cn(PLATE, "bg-white text-base font-semibold text-neutral-900", DISPLAY)} aria-hidden="true">
        {letter ?? name.slice(0, 1)}
      </span>
    );
  return (
    <span className={cn(PLATE, mark === "dark" ? "bg-neutral-900" : "bg-white")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={72}
        height={28}
        loading="eager"
        decoding="async"
        className={mark === "crop" ? "h-7 w-[26px] max-w-none object-cover object-[0%_50%]" : "max-h-7 max-w-[72px] object-contain"}
      />
      <span className="sr-only">{name}</span>
    </span>
  );
}

function Row({ row, href }: { row: RankingRow; href: (path: string) => string }) {
  const t = useT();
  const s = useCollege();
  const router = useRouter();
  const on = !!row.uni && s.compare.includes(row.uni.id);
  const profile = row.uni ? href("/university/" + row.uni.slug) : null;
  const place = [row.city, row.country].filter(Boolean).join(", ");
  const identity = (
    <>
      <UniversityLogo
        // No website or wide wordmark: the square site icon fits the avatar and stays readable.
        university={{ ...(row.uni ?? { id: row.key, name: row.name, country_code: row.cc }), website: null, logo_url: null } as unknown as University}
        size="md"
      />
      <span className="min-w-0">
        <strong className="block truncate font-medium text-foreground">{row.name}</strong>
        <small className="block truncate text-xs font-normal text-muted-foreground">
          <span className="hidden sm:inline">{place}</span>
          <span className="sm:hidden">{row.country}</span>
        </small>
      </span>
    </>
  );
  const linkClass = "flex min-w-0 items-center gap-3 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
  return (
    <TableRow
      data-state={on ? "selected" : undefined}
      className={profile ? "cursor-pointer" : undefined}
      onClick={profile ? (e) => { if (!(e.target as HTMLElement).closest("a,button,[role=checkbox]")) router.push(profile); } : undefined}
    >
      <TableCell className="w-16 pl-3 font-medium tabular-nums sm:w-24 sm:pl-4">{row.rank}</TableCell>
      <TableCell className="max-w-0 whitespace-normal">
        {profile ? (
          <Link
            href={profile}
            prefetch={false}
            className={linkClass}
            // Rows are too many to prefetch on sight; a hover or touch is a strong hint.
            onMouseEnter={() => router.prefetch(profile)}
            onTouchStart={() => router.prefetch(profile)}
          >
            {identity}
          </Link>
        ) : (
          <a href={row.url} target="_blank" rel="noreferrer" className={linkClass}>
            {identity}
            <ArrowUpRight size={14} aria-hidden="true" className="shrink-0 text-muted-foreground" />
          </a>
        )}
      </TableCell>
      <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">{row.world ? t("rank.col.world") + " " + row.world : ""}</TableCell>
      <TableCell className="hidden text-right tabular-nums sm:table-cell">{row.score ?? ""}</TableCell>
      <TableCell className="w-12 pr-3 text-right sm:pr-4 [&:has([role=checkbox])]:pr-3 sm:[&:has([role=checkbox])]:pr-4">
        {row.uni && (
          <Checkbox
            checked={on}
            aria-label={t("rank.compare", { name: row.name })}
            onCheckedChange={() => s.toggleCompare(row.uni!.id)}
          />
        )}
      </TableCell>
    </TableRow>
  );
}

export function RankingsView({ data }: { data: RankingData }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname() || "/rankings";
  const base = /^\/dashboard(\/|$)/.test(pathname) ? "/dashboard/rankings" : "/rankings";
  const [pending, startTransition] = useTransition();
  const searchId = useId();
  const national = data.view === "national";
  const source = RANKING_SOURCES.find((x) => x.key === data.view);
  const ownHref = (path: string) => workspaceHref(path, pathname);

  /** Address of this page with `patch` applied to the current filters. */
  const url = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const current: Record<string, string> = {
      provider: data.view === "qs" ? "" : data.view,
      q: data.q,
      country: data.country,
      region: data.region,
      by: national && data.by !== data.nationalBy[0] ? data.by : "",
    };
    for (const [k, v] of Object.entries(current)) if (v) next.set(k, v);
    for (const [k, v] of Object.entries(patch)) if (v) next.set(k, v); else next.delete(k);
    const qs = next.toString();
    return base + (qs ? "?" + qs : "");
  };
  const go = (patch: Record<string, string | null>) =>
    startTransition(() => router.replace(url({ page: null, ...patch }), { scroll: false }));
  const visit = (e: React.MouseEvent, to: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    startTransition(() => router.push(to, { scroll: false }));
  };
  const publisherUrl = (key: string) => base + (key === "qs" ? "" : "?provider=" + key);

  // Typing updates a local draft; the server table follows once typing pauses.
  const [draft, setDraft] = useState(data.q);
  const sent = useRef(data.q);
  useEffect(() => {
    if (data.q !== sent.current) {
      sent.current = data.q;
      setDraft(data.q);
    }
  }, [data.q]);
  useEffect(() => {
    if (draft === sent.current) return;
    const timer = setTimeout(() => {
      sent.current = draft;
      go({ q: draft.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
    // `go` changes every render; only the draft restarts the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const from = (data.page - 1) * RANKING_PAGE_SIZE + 1;
  const countryName = data.countries.find((c) => c.code === data.country)?.name ?? data.country;
  const pickCountry = national && !data.country;
  const showWorld = national && data.rows.some((r) => r.world);
  const partial = data.view === "webometrics" || data.view === "unirank";
  const sourceLink = source?.url ?? (national ? NATIONAL_SOURCES[data.by as keyof typeof NATIONAL_SOURCES]?.url : undefined);
  const filtered = Boolean(data.q || data.country || data.region);
  const centralAsia = data.countries.filter((c) => (CENTRAL_ASIA as readonly string[]).includes(c.code));

  return (
    <div className="mx-auto mb-20 w-full max-w-[1200px] pt-6 text-foreground sm:pt-8 [&_*]:border-border">
      <header className="flex items-start gap-3 sm:gap-4">
        <div>
          <h1 className={cn("m-0 text-[clamp(30px,4.4vw,46px)] leading-[1.08] font-semibold tracking-tight", DISPLAY)}>{t("rank.title")}</h1>
          <p className="mt-3! max-w-[64ch] text-base leading-relaxed text-muted-foreground">{t("rank.lead")}</p>
        </div>
      </header>

      <nav className="-mx-4 mt-8 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-8" aria-label={t("rank.pubs")}>
        {RANKING_SOURCES.map((p) => {
          const active = data.view === p.key;
          const inner = (
            <>
              <Logo src={p.logo} name={p.name} mark={p.mark} />
              <span className="flex min-w-0 items-baseline gap-1.5 truncate">
                {p.name}
                {p.edition && <small className="text-xs font-normal text-muted-foreground">{p.edition}</small>}
                {!p.imported && <ArrowUpRight size={12} aria-hidden="true" className="self-center text-muted-foreground" />}
              </span>
            </>
          );
          const cls = cn(buttonVariants({ variant: active ? "secondary" : "outline", size: "lg" }), "h-auto shrink-0 snap-start flex-row items-center justify-start gap-2 rounded-xl px-3 py-2.5 sm:flex-col sm:items-start sm:justify-end sm:gap-2.5", active && "border-foreground/30");
          return p.imported ? (
            <Link key={p.key} href={ownHref(publisherUrl(p.key))} prefetch={false} aria-current={active ? "page" : undefined} className={cls}
              onClick={(e) => { setDraft(""); sent.current = ""; visit(e, publisherUrl(p.key)); }}>
              {inner}
            </Link>
          ) : (
            <a key={p.key} href={p.url} target="_blank" rel="noreferrer" title={t("rank.external")} className={cls}>{inner}</a>
          );
        })}
        <Link
          href={ownHref(base + "?provider=national")}
          prefetch={false}
          aria-current={national ? "page" : undefined}
          className={cn(buttonVariants({ variant: national ? "secondary" : "outline", size: "lg" }), "h-auto shrink-0 snap-start justify-start gap-2 rounded-xl px-3 py-2.5 sm:flex-col sm:items-start sm:justify-end sm:gap-2.5", national && "border-foreground/30")}
          onClick={(e) => visit(e, base + "?provider=national")}
        >
          <span className={cn(PLATE, "bg-white text-neutral-900")} aria-hidden="true"><Globe size={20} /></span>
          {t("rank.national")}
        </Link>
      </nav>

      {pickCountry ? (
        <section className="mt-10" aria-label={t("rank.nat.pick")}>
          <h2 className={cn("m-0 text-2xl font-semibold tracking-tight", DISPLAY)}>{t("rank.nat.pick")}</h2>
          <p className="mt-2! text-sm text-muted-foreground">{t("rank.nat.lead")}</p>
          {[centralAsia, data.countries].map((list, i) =>
            list.length ? (
              <div key={i} className="mt-8">
                <h3 className="m-0 mb-3! text-sm font-medium text-muted-foreground">{t(i === 0 ? "rank.centralAsia" : "rank.allCountries")}</h3>
                <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-4">
                  {list.map((c) => (
                    <li key={c.code}>
                      <Link
                        href={ownHref(base + "?provider=national&country=" + c.code)}
                        prefetch={false}
                        className="flex items-baseline justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm transition-colors hover:border-foreground/40 hover:bg-muted/50"
                      >
                        <span className="truncate font-medium">{c.name}</span>
                        <small className="shrink-0 text-xs text-muted-foreground">{t("rank.nat.count", { n: c.count ?? 0 })}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </section>
      ) : (
        <section className="mt-8" aria-busy={pending}>
          {national && (
            <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link href={ownHref(base + "?provider=national")} prefetch={false} onClick={(e) => visit(e, base + "?provider=national")}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2.5")}>
                <ChevronLeft aria-hidden="true" /> {t("rank.nat.back")}
              </Link>
              <h2 className={cn("m-0 text-2xl font-semibold tracking-tight", DISPLAY)}>{countryName}</h2>
              {data.nationalBy.length > 1 && (
                <ToggleGroup type="single" variant="outline" size="sm" value={data.by} aria-label={t("rank.nat.by")}
                  onValueChange={(v) => v && go({ by: v === data.nationalBy[0] ? null : v })}>
                  {data.nationalBy.map((b) => (
                    <ToggleGroupItem key={b} value={b}>{NATIONAL_SOURCES[b].name}</ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="h-10 w-full sm:max-w-xs">
              <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
              <InputGroupInput
                id={searchId}
                type="search"
                value={draft}
                maxLength={200}
                autoComplete="off"
                placeholder={t("rank.search")}
                aria-label={t("rank.search")}
                onChange={(e) => setDraft(e.target.value)}
              />
            </InputGroup>
            {!national && (
              <>
                <NativeSelect className="h-10" aria-label={t("rank.country")} value={data.country} onChange={(e) => go({ country: e.target.value || null })}>
                  <option value="">{t("rank.allCountries")}</option>
                  {data.countries.map((c) => (<option key={c.code} value={c.code}>{c.name}</option>))}
                </NativeSelect>
                <NativeSelect className="h-10" aria-label={t("rank.region")} value={data.region} onChange={(e) => go({ region: e.target.value || null, country: null })}>
                  <option value="">{t("rank.allRegions")}</option>
                  <option value={CENTRAL_ASIA_REGION}>{t("rank.centralAsia")}</option>
                  {regions.map((r) => (<option key={r} value={r}>{t(REGION_KEYS[r])}</option>))}
                </NativeSelect>
                <Button
                  type="button"
                  variant={data.region === CENTRAL_ASIA_REGION ? "secondary" : "outline"}
                  className="h-10 rounded-full"
                  aria-pressed={data.region === CENTRAL_ASIA_REGION}
                  onClick={() => go({ region: data.region === CENTRAL_ASIA_REGION ? null : CENTRAL_ASIA_REGION, country: null })}
                >
                  {t("rank.centralAsia")}
                </Button>
              </>
            )}
          </div>

          <p className="mt-4! mb-3! flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{t("rank.count", { n: data.total.toLocaleString("en-US") })}</span>
            {partial && <span>{t(data.view === "webometrics" ? "rank.partial.webometrics" : "rank.partial.unirank")}</span>}
            {national && data.by === "herd" && <span>{t("rank.nat.herd")}</span>}
            {national && data.by === "nirf" && <span>{t("rank.nat.nirf")}</span>}
            {sourceLink && (
              <a href={sourceLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                {t("rank.source")} <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            )}
          </p>

          {data.rows.length ? (
            <div className={cn("overflow-hidden rounded-2xl border border-border bg-card transition-opacity", pending && "opacity-50")}>
              <Table aria-label={t("rank.table")}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-3 text-xs font-medium text-muted-foreground sm:pl-4">{t("rank.col.rank")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("rank.col.university")}</TableHead>
                    <TableHead className="hidden md:table-cell">{showWorld && <span className="sr-only">{t("rank.col.world")}</span>}</TableHead>
                    <TableHead className="hidden text-right text-xs font-medium text-muted-foreground sm:table-cell">
                      {data.hasScore ? t(data.scoreLabel === "rd" ? "rank.col.rd" : "rank.col.score") : ""}
                    </TableHead>
                    <TableHead className="pr-3 sm:pr-4"><span className="sr-only">{t("rank.compare", { name: "" })}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (<Row key={r.key} row={r} href={ownHref} />))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
              <p className="m-0">{t(national && !data.nationalBy.length ? "rank.nat.none" : "rank.none")}</p>
              {filtered && !national && (
                <Button type="button" variant="outline" className="mt-4 rounded-full" onClick={() => { setDraft(""); sent.current = ""; go({ q: null, country: null, region: null }); }}>
                  {t("rank.clear")}
                </Button>
              )}
            </div>
          )}

          {data.pages > 1 && (
            <Pagination className="mt-5" aria-label={t("rank.pages")}>
              <PaginationContent className="w-full justify-between">
                <PaginationItem>
                  <PaginationPrevious
                    href={ownHref(url({ page: data.page > 2 ? String(data.page - 1) : null }))}
                    aria-disabled={data.page <= 1}
                    className={data.page <= 1 ? "pointer-events-none opacity-40" : undefined}
                    onClick={(e) => data.page > 1 ? visit(e, url({ page: data.page > 2 ? String(data.page - 1) : null })) : e.preventDefault()}
                  />
                </PaginationItem>
                <PaginationItem className="text-sm text-muted-foreground">
                  {t("rank.showing", { from, to: from + data.rows.length - 1, total: data.total.toLocaleString("en-US") })}
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href={ownHref(url({ page: String(data.page + 1) }))}
                    aria-disabled={data.page >= data.pages}
                    className={data.page >= data.pages ? "pointer-events-none opacity-40" : undefined}
                    onClick={(e) => data.page < data.pages ? visit(e, url({ page: String(data.page + 1) })) : e.preventDefault()}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </section>
      )}

      <section className="mt-16" aria-labelledby="rk-how-h">
        <h2 id="rk-how-h" className={cn("m-0 text-xl font-semibold tracking-tight", DISPLAY)}>{t("rank.how")}</h2>
        <Accordion type="multiple" defaultValue={source ? [source.key] : []} className="mt-3 rounded-2xl border border-border bg-card px-4 sm:px-5">
          {RANKING_SOURCES.map((p) => (
            <AccordionItem key={p.key} value={p.key}>
              <AccordionTrigger className="items-center">
                <span className="flex items-center gap-3"><Logo src={p.logo} name="" mark={p.mark} />{p.name}</span>
              </AccordionTrigger>
              <AccordionContent className="max-w-[68ch] text-muted-foreground">
                <p className="m-0 leading-relaxed">{t(("rank.how." + p.key) as MessageKey)}</p>
                <a href={p.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                  {t("rank.how.source", { name: p.name })} <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
