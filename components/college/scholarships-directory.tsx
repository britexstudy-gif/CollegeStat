"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Check, CircleHelp, Search, Wallet } from "lucide-react";
import { useI18n, useT } from "./i18n";
import { countryName } from "@/lib/domain";
import {
  CENTRAL_ASIA,
  SOON_DAYS,
  centralAsiaCodes,
  filterScholarships,
  sortScholarships,
  type Scholarship,
  type ScholarshipFilters,
} from "@/lib/scholarships-data";
import { localeOf } from "@/lib/dates";
import { levelLabel, deadlineView, centralAsiaLabel, flagOf } from "./scholarship-format";
import { ScholarshipCover } from "./scholarship-cover";
import "./scholarships-directory.css";

export type ScholarshipCard = Pick<
  Scholarship,
  | "slug"
  | "name"
  | "provider"
  | "covers"
  | "funding"
  | "country"
  | "level"
  | "deadline"
  | "timeline"
  | "openToAll"
  | "eligibleCodes"
  | "amountHeadline"
  | "image"
  | "undergrad"
  | "exchange"
  | "applicationUrl"
>;

const LEVELS = ["Bachelor", "Master", "PhD"];
/** The audience applies for bachelor's degrees; "All levels" stays one click away. */
const DEFAULT_LEVEL = "Bachelor";
const PAGE = 24;

const place = (code: string | null) => (code && code.length === 2 ? countryName(code) : null);

/** Calm, filterable directory. Every card opens its own page. */
export function ScholarshipsDirectory({
  items: given,
  today: givenToday,
  initial = {},
}: {
  items?: ScholarshipCard[];
  today?: string;
  initial?: ScholarshipFilters;
}) {
  // Pages pass server-loaded items; the workspace route mounts it bare and loads them here.
  const [loaded, setLoaded] = useState<ScholarshipCard[]>([]);
  useEffect(() => {
    if (given) return;
    void import("@/lib/scholarships-load").then(({ allScholarships }) => setLoaded(sortScholarships(allScholarships, new Date().toISOString().slice(0, 10))));
  }, [given]);
  const items = given ?? loaded;
  const today = givenToday ?? new Date().toISOString().slice(0, 10);
  const t = useT();
  const { lang } = useI18n();
  const locale = localeOf(lang);
  const [f, setF] = useState<ScholarshipFilters>({ ...initial, level: initial.level ?? DEFAULT_LEVEL });
  const [limit, setLimit] = useState(PAGE);
  const set = (patch: Partial<ScholarshipFilters>) => {
    setLimit(PAGE);
    setF((cur) => ({ ...cur, ...patch }));
  };
  const active = Object.entries(f).some(([k, v]) => !!v && !(k === "level" && v === DEFAULT_LEVEL));
  const open = f.nationality ?? (f.ca ? "CA" : "");

  // Keep the filters in the address so a copied link shows the same list.
  useEffect(() => {
    const p = new URLSearchParams();
    if (f.country) p.set("country", f.country);
    if (f.level !== DEFAULT_LEVEL) p.set("level", f.level || "all");
    if (f.funding) p.set("funding", f.funding);
    if (f.nationality) p.set("nationality", f.nationality);
    if (f.ca) p.set("ca", "1");
    if (f.soon) p.set("soon", "1");
    const qs = p.toString();
    try {
      window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? "?" + qs : ""));
    } catch {}
  }, [f.country, f.level, f.funding, f.nationality, f.ca, f.soon]);

  const countries = useMemo(
    () => [...new Set(items.map((s) => s.country).filter((c): c is string => !!c && c.length === 2))].sort((a, b) => countryName(a).localeCompare(countryName(b))),
    [items],
  );
  const shown = useMemo(() => filterScholarships(items as Scholarship[], { ...f, today }) as unknown as ScholarshipCard[], [items, f, today]);

  return (
    <div className="sd">
      <header className="sd-head">
        <h1>{t("sch.title")}</h1>
        <p>{t("sch.intro", { count: items.length })}</p>
      </header>

      <form className="sd-filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="sd-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={f.q ?? ""}
            onChange={(e) => set({ q: e.target.value })}
            placeholder={t("sch.search")}
            aria-label={t("sch.search")}
            maxLength={120}
          />
        </label>
        <div className="sd-selects">
          <label>
            <span>{t("sch.f.country")}</span>
            <select value={f.country ?? ""} onChange={(e) => set({ country: e.target.value })}>
              <option value="">{t("sch.f.country.all")}</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {countryName(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("sch.f.funding")}</span>
            <select value={f.funding ?? ""} onChange={(e) => set({ funding: e.target.value })}>
              <option value="">{t("sch.f.funding.all")}</option>
              <option value="full">{t("sch.funding.full")}</option>
              <option value="partial">{t("sch.funding.partial")}</option>
            </select>
          </label>
          <label>
            <span>{t("sch.f.open")}</span>
            <select
              value={open}
              onChange={(e) => {
                const v = e.target.value;
                set({ ca: v === "CA" || undefined, nationality: v && v !== "CA" ? v : undefined });
              }}
            >
              <option value="">{t("sch.f.open.all")}</option>
              <option value="CA">{t("sch.f.open.ca")}</option>
              {CENTRAL_ASIA.map((c) => (
                <option key={c} value={c}>
                  {countryName(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("sch.f.level")}</span>
            <select value={f.level ?? ""} onChange={(e) => set({ level: e.target.value })}>
              <option value="">{t("sch.f.level.all")}</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {levelLabel(l, t)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="sd-meta">
          <button type="button" className="sd-toggle" aria-pressed={!!f.soon} onClick={() => set({ soon: !f.soon || undefined })}>
            {t("sch.f.soon", { n: SOON_DAYS })}
          </button>
          <p role="status" aria-live="polite">
            {t("sch.count", { n: shown.length, total: items.length })}
          </p>
          {active && (
            <button type="button" className="sd-clear" onClick={() => set({ level: "", q: "", country: "", funding: "", nationality: undefined, ca: undefined, soon: undefined })}>
              {t("sch.clear")}
            </button>
          )}
        </div>
      </form>

      <ul className="sd-grid">
        {shown.slice(0, limit).map((s) => {
          const ca = centralAsiaCodes(s);
          const dl = deadlineView(s, today, t, locale);
          const where = place(s.country);
          return (
            <li key={s.slug}>
              <article className="sd-card">
                <div className="sd-media">
                  <ScholarshipCover slug={s.slug} image={s.image} label={where ?? s.provider} className="sd-cover" />
                  {where && (
                    <span className="sd-flag">
                      <span aria-hidden="true">{flagOf(s.country)}</span> {where}
                    </span>
                  )}
                  <span className={"sd-fund" + (s.funding === "full" ? " is-full" : "")}>{t(s.funding === "full" ? "sch.funding.full" : "sch.funding.partial")}</span>
                  {s.image?.credit && (
                    <span className="sd-credit" title={[s.image.credit, s.image.licence].filter(Boolean).join(", ")}>
                      © {s.image.credit}
                      {s.image.licence ? ", " + s.image.licence : ""}
                    </span>
                  )}
                </div>
                <div className="sd-body">
                  {s.provider && <span className="sd-host">{s.provider}</span>}
                  <h2 className="sd-name">
                    <Link href={"/scholarships/" + s.slug} className="sd-link">
                      {s.name}
                    </Link>
                  </h2>
                  <ul className="sd-facts">
                    {(s.amountHeadline || s.covers) && (
                      <li>
                        <Wallet size={15} aria-hidden="true" />
                        <span className="sd-covers">{s.amountHeadline ?? s.covers}</span>
                      </li>
                    )}
                    <li className={ca.length ? "is-ok" : undefined}>
                      {ca.length ? <Check size={15} aria-hidden="true" /> : <CircleHelp size={15} aria-hidden="true" />}
                      <span>
                        {ca.length ? centralAsiaLabel(ca, t) : t("sch.card.caCheck")}
                        {!s.undergrad && <em className="sd-warn"> · {t("sch.notUndergrad")}</em>}
                        {s.exchange && <em> · {t("sch.exchange")}</em>}
                      </span>
                    </li>
                    <li className={"sd-due is-" + dl.tone}>
                      <CalendarDays size={15} aria-hidden="true" />
                      <span>
                        {dl.date ? (
                          dl.tone === "closed" ? (
                            <>
                              <b>{dl.status}</b> · {t("sch.card.expected", { date: dl.expected ?? "" })}
                            </>
                          ) : (
                            <>
                              <time dateTime={s.deadline ?? undefined}>{dl.date}</time> · <b>{dl.relative}</b>
                            </>
                          )
                        ) : (
                          <>{dl.next ?? dl.status}</>
                        )}
                      </span>
                    </li>
                  </ul>
                  <div className="sd-actions">
                    <span className="sd-details" aria-hidden="true">
                      {t("sch.card.details")}
                    </span>
                    {s.applicationUrl && (
                      <a className="sd-official" href={s.applicationUrl} target="_blank" rel="noopener noreferrer">
                        {t("sch.card.official")} <ArrowUpRight size={14} aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
      {shown.length > limit && (
        <button type="button" className="sd-more" onClick={() => setLimit((n) => n + PAGE)}>
          {t("sch.more", { n: shown.length - limit })}
        </button>
      )}
      {!shown.length && (
        <p className="sd-none">
          {t("sch.none")}{" "}
          <button type="button" onClick={() => set({ level: "", q: "", country: "", funding: "", nationality: undefined, ca: undefined, soon: undefined })}>
            {t("sch.clear")}
          </button>
        </p>
      )}
    </div>
  );
}
