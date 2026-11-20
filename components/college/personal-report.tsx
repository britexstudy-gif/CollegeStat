"use client";
import { ArrowRight, FileText, Printer } from "lucide-react";
import { Btn, DateText, EmptyState, List, ListRow, Page, PageHeader, Section, StatusPill, UniLogo, type Tone } from "./dash-ui";
import { useI18n, type Translate } from "./i18n";
import { countryName } from "@/lib/domain";
import type { LegacyPlan } from "@/lib/personal-plan";
import type { PersonalPlan, PlanEvent, PlanTest, Tier } from "./onboarding-plan";
import { ReportV2 } from "./report-v2";
import "./personal-report.css";

const TIERS: Tier[] = ["reach", "match", "safety"];
const TIER_TONE: Record<Tier, Tone> = { reach: "warning", match: "accent", safety: "success" };

const date = (iso: string, lang: string) =>
  new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));

function testLine(x: PlanTest, lang: string, t: Translate): string {
  const name = (x.test || (x.kind === "english" ? "English" : "SAT")).toUpperCase();
  return [
    name,
    x.score != null ? t("db.rp.score", { n: x.score }) : null,
    x.target != null ? t("db.target", { n: x.target }) : null,
    x.date ? date(x.date, lang) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const eventTitle = (e: PlanEvent) => e.title || e.university || e.kind;

/** The onboarding plan as a clean page that prints well. */
export function PersonalReport() {
  return <ReportV2 />;
}

export function ReportView({ plan, legacy = null, name }: { plan: PersonalPlan | null; legacy?: LegacyPlan | null; name: string }) {
  const { t, lang } = useI18n();
  const title = name ? t("db.rp.title_for", { name }) : t("db.report");
  const print = (
    <Btn onClick={() => window.print()} className="pr-print">
      <Printer aria-hidden="true" /> {t("db.rp.print")}
    </Btn>
  );

  if (!plan && legacy)
    return (
      <Page narrow className="pr">
        <PageHeader title={title} description={legacy.summary} actions={print} />
        <List>
          {legacy.steps.map((x) => (
            <ListRow key={x.title} title={x.title} meta={x.detail} />
          ))}
        </List>
      </Page>
    );
  if (!plan)
    return (
      <Page narrow className="pr">
        <PageHeader title={t("db.report")} />
        <div className="dk-panel">
          <EmptyState icon={<FileText />} text={t("db.report.empty")} action={t("db.report.cta")} href="/dashboard/welcome" />
        </div>
      </Page>
    );

  return (
    <Page narrow className="pr">
      <PageHeader title={title} description={t("db.rp.made", { date: date(plan.created_at.slice(0, 10), lang) })} actions={print} />

      {plan.universities.length > 0 && (
        <Section id="pr-unis" title={t("db.rp.unis")} count={plan.universities.length}>
          <List>
            {TIERS.flatMap((tier) =>
              plan.universities
                .filter((u) => u.tier === tier)
                .map((u) => (
                  <ListRow
                    key={u.id}
                    href={"/dashboard/university/" + u.slug}
                    leading={<UniLogo university={{ id: u.id, name: u.name, slug: u.slug, country_code: u.country_code, website: null, logo_url: null } as never} />}
                    title={u.name}
                    meta={[u.city, countryName(u.country_code), u.rank ? `${u.rank.provider.toUpperCase()} #${u.rank.rank}` : null, u.acceptance != null ? t("db.rp.accept", { n: Math.round(u.acceptance) }) : null, u.tuition_usd != null ? `$${Math.round(u.tuition_usd).toLocaleString(lang)}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                    trailing={
                      <StatusPill tone={TIER_TONE[tier]} dot>
                        {t(("db.rp.tier." + tier) as "db.rp.tier.reach")}
                      </StatusPill>
                    }
                  />
                )),
            )}
          </List>
        </Section>
      )}

      {plan.tests.length > 0 && (
        <Section id="pr-tests" title={t("db.tests")}>
          <List>
            {plan.tests.map((x, i) => (
              <ListRow key={i} title={testLine(x, lang, t)} />
            ))}
          </List>
        </Section>
      )}

      {plan.timeline.length > 0 && (
        <Section id="pr-time" title={t("db.rp.timeline")}>
          <List>
            {plan.timeline.map((e, i) => (
              <ListRow key={i} href={e.href} title={eventTitle(e)} trailing={<DateText date={e.date} />} />
            ))}
          </List>
        </Section>
      )}

      {plan.scholarships.length > 0 && (
        <Section id="pr-sch" title={t("db.scholarships")}>
          <List>
            {plan.scholarships.map((s) => (
              <ListRow
                key={s.slug}
                href={"/dashboard/library/scholarship/" + s.slug}
                title={s.name}
                meta={[s.funding === "full" ? t("db.funding.full") : t("db.funding.partial"), s.country].filter(Boolean).join(" · ")}
                trailing={s.deadline ? <DateText date={s.deadline} /> : undefined}
              />
            ))}
          </List>
        </Section>
      )}

      <div className="pr-foot">
        <Btn variant="ghost" href="/dashboard/assistant">
          {t("db.rp.ask")} <ArrowRight aria-hidden="true" />
        </Btn>
      </div>
    </Page>
  );
}
