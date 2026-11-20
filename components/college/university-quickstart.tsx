"use client";
import { ArrowRight, ArrowUpRight, CalendarDays, Play, Sparkles } from "lucide-react";
import { WorkspaceLink as Link } from "./workspace-link";
import { currency, countryName, type University } from "@/lib/domain";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatDay, relativeDays, type ChanceView, type ReportNote, type UniversityView, type WhereView } from "@/lib/university-view";
import { suggestedFit } from "@/lib/my-colleges";
import { FitPicker, RequirementChecklist, ScoreBars, fitLabel, useMyColleges } from "./my-colleges";
import { useCollege } from "./provider";
import { useI18n } from "./i18n";

/** The first screen under the header: the answers a student needs before
 * anything else. Each card renders only what the view-model holds. */
export function UniversityQuickStart({ university: u, view, signedIn }: { university: University; view: UniversityView; signedIn: boolean }) {
  const { t } = useI18n();
  const name = u.short_name || u.name;
  return (
    <section className="uq" aria-label={t("u2.qs.label")}>
      <ChancesCard university={u} view={view.chances} name={name} />
      <NeedCard university={u} view={view} signedIn={signedIn} />
      <WhereCard university={u} where={view.where} />
      {view.report && <ReportStrip note={view.report} />}
    </section>
  );
}

const DOT: Record<string, string> = { reach: "is-reach", target: "is-target", likely: "is-likely", unknown: "" };

function ChancesCard({ university: u, view, name }: { university: University; view: ChanceView; name: string }) {
  const { t, lang } = useI18n();
  const s = useCollege();
  const { entries, setFit } = useMyColleges();
  const pct = (n: number) => n.toLocaleString(lang, { maximumFractionDigits: 1 });
  if (view.state === "signed-out")
    return (
      <article className="uq-card uq-invite">
        <span className="uq-kicker">{t("u2.ch.title")}</span>
        <h2>{t("u2.ch.signin.title", { name })}</h2>
        <p>{t("u2.ch.signin.text")}</p>
        {view.rate != null && <p className="uq-rate"><strong>{pct(view.rate)}%</strong> {t("u2.ch.rate")}</p>}
        <Link className="up-btn is-primary" href={"/auth/sign-in?next=" + encodeURIComponent("/university/" + u.slug)}>
          {t("u2.ch.signin.cta")} <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </article>
    );
  const entry = entries[u.id];
  return (
    <article className="uq-card">
      <span className="uq-kicker">{t("u2.ch.title")}</span>
      {view.state === "ok" ? (
        <>
          {view.chance.category === "unknown" ? (
            // No admit rate or test range: judge on what the university does publish.
            <>
              <h2 className={"uq-verdict " + (view.chance.english?.meets === false ? "is-reach" : view.chance.english?.meets ? "is-likely" : "")}>
                <i aria-hidden="true" />
                {t(view.chance.english?.meets === false ? "u2.ch.eng.short" : view.chance.english?.meets ? "u2.ch.eng.ok" : "u2.ch.eng.check")}
              </h2>
              <p>{t("u2.ch.norate", { name })}</p>
            </>
          ) : (
            <>
              <h2 className={"uq-verdict " + DOT[view.chance.category]}>
                <i aria-hidden="true" />
                {t(("pf.ch." + view.chance.category) as MessageKey)}
              </h2>
              <p>{t(("pf.ch." + view.chance.category + ".hint") as MessageKey)}</p>
            </>
          )}
          <ul className="uq-lines">
            {view.chance.rate != null && <li>{t("pf.ch.rate", { rate: pct(view.chance.rate) })}</li>}
            {view.chance.english && (
              <li className={view.chance.english.meets === false ? "is-short" : view.chance.english.meets ? "is-ok" : ""}>
                {t(view.chance.english.meets === false ? "pf.ch.english.below" : view.chance.english.meets ? "pf.ch.english.meets" : "pf.ch.english.min", {
                  test: view.chance.english.test,
                  min: view.chance.english.minimum,
                })}
              </li>
            )}
            {view.chance.overBudget && view.chance.tuition != null && (
              <li className="is-short">{t("pf.ch.budget.over", { tuition: currency(view.chance.tuition, "USD") })}</li>
            )}
          </ul>
          {view.bands.some((b) => b.you != null) && <ScoreBars bands={view.bands.filter((b) => b.you != null)} />}
        </>
      ) : view.state === "no-scores" ? (
        <>
          <h2>{t("u2.ch.noscores.title")}</h2>
          <p>{t("u2.ch.noscores.text")}</p>
          {view.rate != null && <p className="uq-rate"><strong>{pct(view.rate)}%</strong> {t("u2.ch.rate")}</p>}
          <Link className="up-btn is-primary" href="/dashboard/welcome?step=tests">
            {t("u2.ch.noscores.cta")} <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </>
      ) : (
        <>
          <h2>{t("pf.ch.unknown")}</h2>
          <p>{t("u2.ch.nodata", { name })}</p>
        </>
      )}
      {s.user && (
        <div className="uq-list">
          <span>{t("u2.ch.list")}</span>
          <FitPicker id={u.id} size="sm" value={entry?.fit} suggested={suggestedFit(u)} onChange={(fit) => void setFit(u.id, fit)} />
        </div>
      )}
    </article>
  );
}

function NeedCard({ university: u, view, signedIn }: { university: University; view: UniversityView; signedIn: boolean }) {
  const { t } = useI18n();
  const { entries } = useMyColleges();
  const rows = view.checklist;
  const done = rows.filter((r) => entries[u.id]?.done?.includes(r.id)).length;
  const left = rows.length - done;
  return (
    <article className="uq-card">
      <span className="uq-kicker">{t("u2.need.title")}</span>
      <h2>{signedIn ? (left ? t("u2.need.left", { n: left }) : t("u2.need.done")) : t("u2.need.count", { n: rows.length })}</h2>
      <RequirementChecklist university={u} rows={rows} interactive />
    </article>
  );
}

const REASON: Record<WhereView["reason"], MessageKey> = {
  verified: "u2.where.r.verified",
  member: "u2.where.r.member",
  institution: "u2.where.r.institution",
  region: "u2.where.r.region",
  country: "u2.where.r.country",
  fallback: "u2.where.r.fallback",
};
const OPEN: Record<NonNullable<WhereView["official"]>["kind"], MessageKey> = {
  apply: "u2.where.open.apply",
  admissions: "u2.where.open.admissions",
  website: "u2.where.open.website",
};

function WhereCard({ university: u, where: w }: { university: University; where: WhereView }) {
  const { t, lang } = useI18n();
  const direct = w.platform.id === "direct";
  return (
    <article className="uq-card">
      <span className="uq-kicker">{t("u2.where.title")}</span>
      <h2 className="uq-platform">
        {direct ? w.portal || t("u2.where.direct") : w.platform.url ? (
          <a href={w.platform.url} target="_blank" rel="noreferrer">{w.platform.name}</a>
        ) : w.platform.name}
        {!direct && w.portal && <small>{t("u2.where.then", { portal: w.portal })}</small>}
      </h2>
      <p className="uq-reason">
        {t(REASON[w.reason], { country: countryName(u.country_code) })}
        {w.reasonSource && (
          <> · <a className="up-src" href={w.reasonSource} target="_blank" rel="noreferrer">{t("up.source")}</a></>
        )}
      </p>
      {w.deadline ? (
        <div className="uq-deadline">
          <CalendarDays size={18} aria-hidden="true" />
          <div>
            <strong>{formatDay(w.deadline.date, lang)}</strong>
            <span>{w.deadline.title}</span>
          </div>
          <em className={w.deadline.days <= 30 ? "is-soon" : undefined}>{relativeDays(w.deadline.days, lang)}</em>
        </div>
      ) : w.lastCycle ? (
        <div className="uq-deadline is-past">
          <CalendarDays size={18} aria-hidden="true" />
          <div>
            <strong>{formatDay(w.lastCycle.date, lang)}</strong>
            <span>{w.lastCycle.title}</span>
          </div>
          <em>{t("u2.where.last")}</em>
        </div>
      ) : (
        <p className="uq-quiet">{w.deadlineText || t("u2.where.nodate")}</p>
      )}
      {w.lastCycle && <p className="uq-quiet">{t("u2.where.lasthint")}</p>}
      {(w.fee || w.alternatives.length > 0) && (
        <p className="uq-quiet">
          {[w.fee ? t("u2.where.fee", { fee: currency(w.fee.amount, w.fee.currency) }) : null, w.alternatives.length ? t("u2.where.also", { names: w.alternatives.map((a) => a.name).join(", ") }) : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <div className="uq-actions">
        {w.official && (
          <a className="up-btn is-primary" href={w.official.url} target="_blank" rel="noreferrer">
            {t(OPEN[w.official.kind])} <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        )}
        <Link className="up-btn" href={"/dashboard/application-practice?u=" + encodeURIComponent(u.slug)}>
          <Play size={14} aria-hidden="true" /> {t("u2.where.practise")}
        </Link>
      </div>
    </article>
  );
}

function ReportStrip({ note }: { note: NonNullable<ReportNote> }) {
  const { t } = useI18n();
  const tier = note.tier === "reach" || note.tier === "target" || note.tier === "safety" ? fitLabel(t, note.tier) : note.tier;
  return (
    <aside className="uq-report">
      <Sparkles size={16} aria-hidden="true" />
      <p>
        <b>{t("u2.report.title")}</b> <span className="uq-tag">{tier}</span> {note.reason}
      </p>
      <Link href="/dashboard/report">{t("u2.report.open")} <ArrowRight size={14} aria-hidden="true" /></Link>
    </aside>
  );
}
