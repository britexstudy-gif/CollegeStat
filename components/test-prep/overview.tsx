"use client";
import { useMemo, useState } from "react";
import { ArrowRight, Clock, Plus } from "lucide-react";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { Button } from "@/components/ui/button";
import { readPlan } from "@/lib/personal-plan";
import { daysUntil, isoToday, planFallback, usePrepData, type Plan } from "@/lib/prep-plan";
import { EXAM_INFO, type ExamInfo } from "@/lib/test-prep/exam-info";
import { attemptLabel } from "@/lib/test-prep/scoring";
import { PrepDialog } from "@/components/college/certificate-forms";
import { useCollege } from "@/components/college/provider";
import { useI18n, useT } from "@/components/college/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { CountryPicker, localFacts, useCountry } from "./country";
import { useShortlistRequirements } from "./requirements";
import "@/components/college/certificates-library.css";
import "./test-prep.css";

/** Tests outside the main list that still have a page and a practice bank. */
const MORE = [
  { slug: "pte", name: "PTE Academic" },
  { slug: "cambridge-c1", name: "Cambridge C1 Advanced" },
  { slug: "gre", name: "GRE" },
  { slug: "gmat", name: "GMAT" },
];
const ALL = [...EXAM_INFO.map((e) => ({ slug: e.slug, name: e.name })), ...MORE];

/** Test prep home: the student's own tests, then each exam as a card with what
 * it is, its format and score scale, the fee and test cities in their country,
 * and what their saved universities ask for. */
export function CertificatesHome() {
  const t = useT();
  const { lang } = useI18n();
  const college = useCollege();
  const prefs = college?.profile?.preferences;
  const fallback = useMemo(() => planFallback(readPlan(prefs)?.tests), [prefs]);
  const { plans, attempts } = usePrepData();
  const [country, setCountry] = useCountry();
  const [adding, setAdding] = useState(false);

  const mine = useMemo(() => {
    const today = isoToday();
    return ALL.flatMap((e) => {
      const plan: Plan = { ...fallback[e.slug], ...plans[e.slug] };
      const att = (attempts[e.slug] || []).filter((a) => a.total > 0);
      if (plan.target == null && !plan.date && plan.score == null && !att.length) return [];
      return [{ ...e, plan, last: att.at(-1), days: daysUntil(plan.date, today) }];
    }).sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
  }, [fallback, plans, attempts]);
  const date = (iso: string) => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(new Date(iso + "T00:00:00Z"));

  const main = EXAM_INFO.filter((e) => e.practice);
  const info = EXAM_INFO.filter((e) => !e.practice);

  return (
    <div className="ct tp-home">
      <header className="ct-title tp-home-head">
        <div>
          <h1>{t("ct.title")}</h1>
          <p>{t("pr.home.sub")}</p>
        </div>
        <CountryPicker value={country} onChange={setCountry} />
      </header>

      {mine.length > 0 && (
        <section aria-labelledby="tp-mine" className="ct-section">
          <header className="ct-section-head">
            <h2 id="tp-mine">{t("ct.mine")}</h2>
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" /> {t("ct.add")}
            </Button>
          </header>
          <ul className="tp-mine">
            {mine.map((m) => (
              <li key={m.slug}>
                <Link href={"/dashboard/certificates/" + m.slug}>
                  <strong>{m.name}</strong>
                  <span className="tp-mine-facts">
                    {m.plan.target != null && <span>{t("pr.home.target", { n: m.plan.target })}</span>}
                    {m.plan.date && m.days !== null && m.days >= 0 && <span>{t("pr.home.on", { date: date(m.plan.date), n: m.days })}</span>}
                    {m.last && <span>{t("pr.home.last", { v: attemptLabel(m.last) })}</span>}
                  </span>
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="tp-main" className="ct-section">
        <header className="ct-section-head">
          <h2 id="tp-main">{t("pr.home.main")}</h2>
          {mine.length === 0 && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" /> {t("ct.mine.cta")}
            </Button>
          )}
        </header>
        <ul className="tp-cards">
          {main.map((e) => (
            <ExamCard key={e.slug} info={e} country={country} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="tp-info" className="ct-section">
        <h2 id="tp-info">{t("pr.home.more")}</h2>
        <ul className="tp-cards is-small">
          {info.map((e) => (
            <ExamCard key={e.slug} info={e} country={country} small />
          ))}
        </ul>
        <p className="tp-more">
          {t("pr.home.also")}{" "}
          {MORE.map((m, i) => (
            <span key={m.slug}>
              <Link href={"/dashboard/certificates/" + m.slug}>{m.name}</Link>
              {i < MORE.length - 1 ? " · " : ""}
            </span>
          ))}
        </p>
      </section>
      <p className="ct-note">{t("pr.home.note")}</p>
      <PrepDialog open={adding} onOpenChange={setAdding} mode="plan" choices={ALL.filter((e) => !mine.some((m) => m.slug === e.slug))} />
    </div>
  );
}

function ExamCard({ info, country, small }: { info: ExamInfo; country: ReturnType<typeof useCountry>[0]; small?: boolean }) {
  const t = useT();
  const schools = useShortlistRequirements(info.slug);
  const { fee, cities, note } = localFacts(info, country);
  const where = note === "online" ? t("pr.where.online") : note === "school" ? t("pr.where.school") : cities.length ? cities.slice(0, 2).join(", ") + (cities.length > 2 ? " +" + (cities.length - 2) : "") : "";
  const lo = schools.length ? Math.min(...schools.map((s) => s.minimum)) : null;
  const hi = schools.length ? Math.max(...schools.map((s) => s.minimum)) : null;
  return (
    <li>
      <Link href={"/dashboard/certificates/" + info.slug} className={"tp-card-link" + (small ? " is-small" : "")}>
        <span className="tp-card-top">
          <span>
            <strong>{info.name}</strong>
            <small>{info.provider}</small>
          </span>
          <ArrowRight size={16} aria-hidden="true" />
        </span>
        <span className="tp-what">{t(("pr.what." + info.slug) as MessageKey)}</span>
        <dl className="tp-card-facts">
          <div>
            <dt>
              <Clock size={12} aria-hidden="true" /> {t("pr.time")}
            </dt>
            <dd>{info.total}</dd>
          </div>
          <div>
            <dt>{t("pr.scale")}</dt>
            <dd>{info.scale}</dd>
          </div>
          {fee && (
            <div>
              <dt>{t("pr.fee")}</dt>
              <dd>{fee}</dd>
            </div>
          )}
          {where && !small && (
            <div>
              <dt>{t("pr.where")}</dt>
              <dd>{where}</dd>
            </div>
          )}
        </dl>
        {lo !== null && (
          <span className="tp-need">
            {t("pr.home.need", { n: schools.length, range: lo === hi ? String(lo) : `${lo}–${hi}` })}
          </span>
        )}
        {!small && <span className="tp-practise">{t("pr.home.practise." + info.slug as MessageKey)}</span>}
      </Link>
    </li>
  );
}
