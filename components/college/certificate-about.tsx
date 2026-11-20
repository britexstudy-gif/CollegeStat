"use client";
import { ArrowUpRight, Check } from "lucide-react";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { Button } from "@/components/ui/button";
import { satStructure, type Exam } from "@/lib/certificates";
import { EXAM_META, type Plan } from "@/lib/prep-plan";
import { useT } from "./i18n";

export { useShortlistRequirements, type SchoolRequirement } from "@/components/test-prep/requirements";
import type { SchoolRequirement } from "@/components/test-prep/requirements";

const COMPARE = new Set(["ielts", "sat", "act", "duolingo", "pte"]);

export function SchoolsCard({ exam, schools, plan, hasShortlist }: { exam: Exam; schools: SchoolRequirement[]; plan: Plan; hasShortlist: boolean }) {
  const t = useT();
  if (!schools.length && hasShortlist) return null;
  return (
    <section className="ct-card" aria-labelledby="ct-schools">
      <h2 id="ct-schools">{t("ct.schools.title", { test: exam.short })}</h2>
      {schools.length ? (
        <ul className="ct-schools">
          {schools.map((s) => {
            const meets = plan.target != null && COMPARE.has(exam.slug) ? plan.target >= s.minimum : null;
            return (
              <li key={s.id}>
                <Link href={"/dashboard/university/" + s.slug}>
                  <strong>{s.name}</strong>
                  <small>{s.country}</small>
                </Link>
                <span className="ct-min">
                  <b>{s.varies ? t("ct.schools.from", { n: s.minimum }) : s.minimum}</b>
                  {meets !== null && (
                    <small className={meets ? "is-ok" : "is-low"}>
                      {meets ? <Check size={12} aria-hidden="true" /> : null}
                      {meets ? t("ct.schools.meets") : t("ct.schools.below")}
                    </small>
                  )}
                </span>
                {s.source && (
                  <a className="ct-src" href={s.source} target="_blank" rel="noreferrer" aria-label={t("ct.source_for", { name: s.name })}>
                    {t("ct.source")} <ArrowUpRight size={12} aria-hidden="true" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="ct-empty">
          <p>{t("ct.schools.empty")}</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/universities">{t("ct.schools.cta")}</Link>
          </Button>
        </div>
      )}
    </section>
  );
}

export function BookingCard({ exam }: { exam: Exam }) {
  const t = useT();
  const meta = EXAM_META[exam.slug];
  if (!meta?.book) return null;
  return (
    <section className="ct-card" aria-labelledby="ct-book">
      <h2 id="ct-book">{t("ct.book.title")}</h2>
      <p className="ct-quiet">{meta.online ? t("ct.book.online") : t("ct.book.centres")}</p>
      <Button asChild variant="outline" size="sm" className="ct-fit">
        <a href={meta.book} target="_blank" rel="noreferrer">
          {t("ct.book.cta")} <ArrowUpRight aria-hidden="true" />
        </a>
      </Button>
    </section>
  );
}

export function AboutCard({ exam }: { exam: Exam }) {
  const t = useT();
  const f = exam.format;
  const facts: [string, string][] = f
    ? ([
        [t("ct.about.total"), f.total_minutes ? t("ct.min", { n: f.total_minutes }) : ""],
        [t("ct.about.scores"), f.score_scale || ""],
        [t("ct.about.valid"), f.validity || ""],
        [t("ct.about.delivery"), f.delivery || ""],
      ] as [string, string][]).filter(([, v]) => v)
    : exam.slug === "sat"
      ? Object.entries(satStructure)
          .filter(([k, v]) => typeof v === "string" && !k.includes("source"))
          .map(([k, v]) => [k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), v] as [string, string])
      : [];
  return (
    <section className="ct-card ct-about" aria-labelledby="ct-about">
      <h2 id="ct-about">{t("ct.about.title")}</h2>
      {exam.best_for && <p className="ct-quiet">{exam.best_for}</p>}
      {f && (
        <ul className="ct-sections">
          <li className="ct-sections-head" aria-hidden="true">
            <span>{t("ct.about.section")}</span>
            <span>{t("ct.about.time")}</span>
            <span>{t("ct.about.questions")}</span>
          </li>
          {f.sections.map((s) => (
            <li key={s.name}>
              <span>
                <strong>{s.name}</strong>
                {s.notes && <small>{s.notes}</small>}
              </span>
              <span>{s.minutes ? t("ct.min", { n: s.minutes }) : "—"}</span>
              <span>{s.questions || "—"}</span>
            </li>
          ))}
        </ul>
      )}
      {facts.length > 0 && (
        <dl className="ct-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {exam.facts_source_url && (
        <a className="ct-src" href={exam.facts_source_url} target="_blank" rel="noreferrer">
          {t("ct.source")} <ArrowUpRight size={12} aria-hidden="true" />
        </a>
      )}
    </section>
  );
}

export function ResourcesCard({ exam }: { exam: Exam }) {
  const t = useT();
  if (!exam.free_resources.length) return null;
  return (
    <section className="ct-card" aria-labelledby="ct-res">
      <h2 id="ct-res">{t("ct.res.title")}</h2>
      <ul className="ct-res">
        {exam.free_resources.map((r) => (
          <li key={r.url}>
            <a href={r.url} target="_blank" rel="noreferrer">
              <span>
                <strong>{r.title}</strong>
                <small>{r.provider}</small>
              </span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
