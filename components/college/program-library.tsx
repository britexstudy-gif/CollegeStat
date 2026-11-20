"use client";
import { useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import type { University } from "@/lib/domain";
import { universityEnrichment } from "@/lib/university-enrichment";
import { discoverPrograms, programListings, type ProgramListing } from "@/lib/program-discovery";
import type { ExtraProgramme } from "@/server/profile-extras";
import { useT } from "./i18n";

const PAGE = 12;

/** Programmes: the official listings, the reviewed extras and the reported
 * qualifications in one searchable list, filtered by degree level. */
export function ProgramLibrary({ university: u, extras }: { university: University; extras: ExtraProgramme[] }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const all = useMemo(() => {
    const listings = programListings(u, universityEnrichment(u)?.programmes);
    const known = new Set(listings.map((p) => p.name.toLowerCase()));
    const added: ProgramListing[] = extras
      .filter((p) => !known.has(p.name.toLowerCase()))
      .map((p, i) => ({
        id: "extra:" + i + p.name, name: p.name, level: p.level, qualification: p.level, origin: "official",
        url: p.url, checked: p.checked_at ?? undefined, duration: p.years ? t("up.prog.years", { n: p.years }) : undefined, language: p.language,
      }));
    const merged = [...listings, ...added];
    // A generic level ("Undergraduate major") next to a named one for the same programme is a duplicate.
    const named = new Set(merged.filter((p) => /^(Bachelor|Master|Doctoral|Associate|Certificate)/.test(p.level)).map((p) => p.name.toLowerCase()));
    return merged.filter((p) => /^(Bachelor|Master|Doctoral|Associate|Certificate)/.test(p.level) || !named.has(p.name.toLowerCase()));
  }, [u, extras, t]);
  const levels = useMemo(() => [...new Set(all.map((p) => p.level))].sort(), [all]);
  const rows = useMemo(() => {
    const found = discoverPrograms(all, { query, degree: level, origin: "", letter: "" });
    // Current listings first, then reported awards by size.
    return [...found.filter((p) => p.origin === "official"), ...found.filter((p) => p.origin === "reported").sort((a, b) => (b.completions ?? 0) - (a.completions ?? 0))];
  }, [all, query, level]);
  if (!all.length) return null;
  return (
    <div className="up-programmes">
      <div className="up-prog-tools">
        <label className="up-search">
          <Search size={15} aria-hidden="true" />
          <input type="search" value={query} placeholder={t("up.prog.search")} aria-label={t("up.prog.search")} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} />
        </label>
        {levels.length > 1 && (
          <div className="up-chips" role="group" aria-label={t("up.prog.level")}>
            {["", ...levels].map((l) => (
              <button key={l || "all"} type="button" aria-pressed={level === l} onClick={() => { setLevel(l); setLimit(PAGE); }}>
                {l || t("up.prog.all")}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="up-count" role="status">{t("up.prog.count", { n: rows.length.toLocaleString("en-US") })}</p>
      {rows.length ? (
        <ul className="up-prog-list">
          {rows.slice(0, limit).map((p) => (
            <li key={p.id}>
              <div>
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer">{p.name}<ArrowUpRight size={13} aria-hidden="true" /></a>
                ) : (
                  <strong>{p.name}</strong>
                )}
                <span>
                  {[
                    p.level,
                    p.origin === "reported" && p.completions ? t("up.prog.graduates", { n: p.completions.toLocaleString("en-US"), year: p.year ?? "" }) : null,
                    p.durationMonths ? (p.durationMonths % 12 === 0 ? t("up.prog.years", { n: p.durationMonths / 12 }) : null) : p.duration,
                    p.language,
                    p.intakes?.length ? p.intakes.join(", ") : null,
                  ].filter(Boolean).join(" · ")}
                </span>
              </div>
              {p.url && p.origin === "official" && (
                <a className="up-src" href={p.sourceURL || p.url} target="_blank" rel="noreferrer">{t("up.source")}</a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="up-empty">{t("up.prog.none")}</p>
      )}
      {rows.length > limit && (
        <button type="button" className="up-more" onClick={() => setLimit((n) => n + PAGE * 2)}>
          {t("up.prog.more")}
        </button>
      )}
    </div>
  );
}
