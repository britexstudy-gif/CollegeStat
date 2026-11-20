"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { COUNTRIES, INFO_CHECKED, homeCountry, type Country, type ExamInfo } from "@/lib/test-prep/exam-info";
import { countryName } from "@/lib/domain";
import { useCollege } from "@/components/college/provider";
import { useI18n, useT } from "@/components/college/i18n";

const KEY = "collegestat-prep-country";

/** The country used for fees and test centres: the student's choice on this
 * device, else their onboarding answer, else Uzbekistan. */
export function useCountry() {
  const college = useCollege();
  const fromProfile = homeCountry(college?.profile?.preferences);
  const [picked, setPicked] = useState<Country | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY) as Country | null;
      if (v && COUNTRIES.includes(v)) queueMicrotask(() => setPicked(v));
    } catch {}
  }, []);
  const set = (c: Country) => {
    setPicked(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {}
  };
  return [picked || fromProfile || "UZ", set] as const;
}

export function CountryPicker({ value, onChange }: { value: Country; onChange: (c: Country) => void }) {
  const t = useT();
  const { lang } = useI18n();
  const name = (c: Country) => {
    try {
      return new Intl.DisplayNames([lang], { type: "region" }).of(c) || countryName(c);
    } catch {
      return countryName(c);
    }
  };
  return (
    <div className="tp-countries" role="radiogroup" aria-label={t("pr.country")}>
      {COUNTRIES.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} onClick={() => onChange(c)}>
          {name(c)}
        </button>
      ))}
    </div>
  );
}

/** Fee and test cities for one exam in one country. Missing facts are left out. */
export function localFacts(info: ExamInfo, country: Country) {
  const local = info.local[country];
  return { fee: local?.fee || info.fee, cities: local?.cities || [], note: local?.note };
}

export function CountryCard({ info, country, onCountry }: { info: ExamInfo; country: Country; onCountry: (c: Country) => void }) {
  const t = useT();
  const { lang } = useI18n();
  const { fee, cities, note } = localFacts(info, country);
  const own = info.sources.filter((s) => s.includes("/" + countryName(country).toLowerCase()));
  const srcs = info.sources.length > 1 ? own : info.sources;
  const checked = new Intl.DateTimeFormat(lang, { month: "short", year: "numeric" }).format(new Date(INFO_CHECKED + "T00:00:00Z"));
  return (
    <section className="ct-card tp-country" aria-labelledby="tp-country">
      <header className="ct-card-head">
        <h2 id="tp-country">{t("pr.country.title")}</h2>
      </header>
      <CountryPicker value={country} onChange={onCountry} />
      <dl className="ct-facts">
        {fee && (
          <div>
            <dt>{t("pr.fee")}</dt>
            <dd>
              {fee}
              {info.fee && !info.local[country]?.fee && <small> · {t("pr.fee.global")}</small>}
              {info.slug === "ap" && <small> · {t("pr.fee.ap")}</small>}
            </dd>
          </div>
        )}
        <div>
          <dt>{t("pr.where")}</dt>
          <dd>{note === "online" ? t("pr.where.online") : note === "school" ? t("pr.where.school") : cities.length ? cities.join(", ") : t("pr.where.search")}</dd>
        </div>
        {info.slug === "jlpt" && (
          <div>
            <dt>{t("pr.when")}</dt>
            <dd>{country === "KZ" ? t("pr.jlpt.kz") : t("pr.jlpt.when")}</dd>
          </div>
        )}
      </dl>
      <div className="tp-row">
        <a className="tp-btn-link" href={info.book} target="_blank" rel="noreferrer">
          {t("pr.book")} <ArrowUpRight size={14} aria-hidden="true" />
        </a>
        <span className="tp-src">
          {srcs.map((s) => (
            <a key={s} className="ct-src" href={s} target="_blank" rel="noreferrer">
              {t("ct.source")} <ArrowUpRight size={11} aria-hidden="true" />
            </a>
          ))}
          {srcs.length > 0 && <small>{t("pr.checked", { date: checked })}</small>}
        </span>
      </div>
    </section>
  );
}
