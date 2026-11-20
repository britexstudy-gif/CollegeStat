"use client";
import { useMemo } from "react";
import { ArrowUpRight, Check, MapPin, Play } from "lucide-react";
import { WorkspaceLink as Link } from "./workspace-link";
import { countryName, currency, type University } from "@/lib/domain";
import type { ProfileRankingPosition } from "@/lib/profile-ranking-positions";
import { rankingSystems } from "@/lib/ranking-systems";
import { glanceModel, latestEditionPositions, type ApplyModel, type CostModel, type GlanceTile } from "@/lib/university-profile-data";
import type { ProfileExtras, ProfileGuide, ProfileScholarship } from "@/server/profile-extras";
import type { MessageKey } from "@/lib/i18n/messages";
import { PublisherMark } from "./publisher-mark";
import { DeadlineTimeline } from "./my-colleges";
import { deadlineTimeline, scoreBands } from "@/lib/my-colleges";
import { useI18n, useT } from "./i18n";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { faqFacts, lastChecked, profileSources, type FaqId } from "@/lib/university-faq";
import { displayName } from "@/lib/university-display-name";

/** The one card every profile section uses. */
export function ProfileCard({ id, title, children, aside }: { id: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section id={"up-" + id} className="up-card" aria-labelledby={"up-" + id + "-title"}>
      <header className="up-card-head">
        <h2 id={"up-" + id + "-title"}>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

function SourceLink({ url }: { url?: string | null }) {
  const t = useT();
  return url ? (
    <a className="up-src" href={url} target="_blank" rel="noreferrer">{t("up.source")}</a>
  ) : null;
}

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));

/* ── Overview ──────────────────────────────────────────────────────────── */
function overviewText(u: University): string | null {
  const text = u.history?.history || u.description?.trim() || null;
  if (!text) return null;
  // Generated catalogue sentences only repeat the header.
  if (/Explore its admissions, published research and official application resources\.$/.test(text) || /^Explore .+ official resources\.?$/.test(text)) return null;
  return text;
}

const glanceLabels: Record<GlanceTile["id"], MessageKey> = {
  students: "up.stat.students",
  intl: "up.stat.intl",
  staff: "ud.stat.staff",
  ratio: "up.stat.ratio",
  founded: "ud.stat.founded",
  type: "ud.stat.type",
  campus: "up.stat.campus",
  endowment: "ud.stat.endowment",
  motto: "ud.stat.motto",
};

export function OverviewBody({ university: u, extras }: { university: University; extras: ProfileExtras }) {
  const t = useT();
  const text = overviewText(u);
  const { tiles, location } = glanceModel(u, extras);
  const place = [u.city, countryName(u.country_code)].filter(Boolean).join(", ");
  const sourceUrl = u.history?.sources?.[0]?.url;
  return (
    <div className="up-overview">
      <div className="up-overview-text">
        {(text || (!tiles.length && !location)) && (
          <p className="up-lead">{text ?? t("up.about.fallback", { name: u.name, place: place || u.country_code })}</p>
        )}
        {!!u.history?.known_for?.length && (
          <ul className="up-tags">{u.history.known_for.slice(0, 6).map((k) => <li key={k}>{k}</li>)}</ul>
        )}
        {text && sourceUrl && <p className="up-links-row"><SourceLink url={sourceUrl} /></p>}
      </div>
      {tiles.length > 0 && (
        <section aria-labelledby="up-glance-title">
          <h3 id="up-glance-title">{t("ud.glance.title")}</h3>
          <dl className="up-stats">
            {tiles.map((x) => (
              <div key={x.id} className={x.id === "motto" ? "is-wide" : undefined}>
                <dt>{t(glanceLabels[x.id])}</dt>
                <dd>
                  {x.valueKey ? t(x.valueKey) : x.value}
                  {x.note && <small>{x.note}</small>}
                </dd>
                <SourceLink url={x.url} />
              </div>
            ))}
          </dl>
        </section>
      )}
      {location && (
        <div className="up-location">
          <MapPin size={16} aria-hidden="true" />
          <div>
            <strong>{location.place || t("ud.location.title")}</strong>
            <span>{location.lat.toFixed(3)}, {location.lon.toFixed(3)}</span>
          </div>
          <a className="up-src" href={`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lon}#map=14/${location.lat}/${location.lon}`} target="_blank" rel="noreferrer">
            {t("up.map")}
          </a>
          <SourceLink url={location.source_url} />
        </div>
      )}
    </div>
  );
}

/* ── Rankings ──────────────────────────────────────────────────────────── */
export function RankingsBody({ positions }: { positions: ProfileRankingPosition[] }) {
  const t = useT();
  const latest = latestEditionPositions(positions);
  const byProvider = new Map<string, ProfileRankingPosition[]>();
  for (const p of latest) byProvider.set(p.provider, [...(byProvider.get(p.provider) || []), p]);
  return (
    <>
      <ul className="up-ranks">
        {[...byProvider.entries()].map(([provider, rows]) => {
          const main = rows.find((r) => r.scope === "World" && r.subject === "Overall") || rows[0];
          const rest = rows.filter((r) => r !== main);
          const name = rankingSystems.find((s) => s.slug === provider)?.shortName || provider.toUpperCase();
          return (
            <li key={provider}>
              <span className="up-rank-pub"><PublisherMark provider={main.provider} /><span>{name}</span></span>
              <strong>{main.label}</strong>
              <span className="up-rank-scope">
                {main.scope}{main.subject !== "Overall" ? " · " + main.subject : ""} · {main.year}
              </span>
              {rest.slice(0, 3).map((r) => (
                <span key={r.scope + r.subject} className="up-rank-sub">
                  {r.scope}{r.subject !== "Overall" ? " · " + r.subject : ""} <b>{r.label}</b>
                </span>
              ))}
              <SourceLink url={main.url} />
            </li>
          );
        })}
      </ul>
      <Link className="up-more-link" href="/rankings">
        {t("up.rank.all")} <ArrowUpRight size={14} aria-hidden="true" />
      </Link>
    </>
  );
}

/* ── Admissions & how to apply ─────────────────────────────────────────── */
export function ApplyBody({ university: u, model: m }: { university: University; model: ApplyModel }) {
  const t = useT();
  const timeline = useMemo(() => deadlineTimeline(u), [u]);
  const exams = [
    ...m.english.map((e) => ({ key: e.test + e.minimum, test: e.test, scope: e.scope, value: t("oc.exams.min", { n: e.minimum }), source_url: e.source_url })),
    ...scoreBands(u, {})
      .filter((b) => b.test === "SAT" || b.test === "ACT")
      .map((b) => ({
        key: b.test,
        test: b.test,
        scope: null,
        value: b.kind === "range" ? `${b.low}–${b.high}` : t("oc.exams.avg", { n: b.low }),
        source_url: b.source_url ?? null,
      })),
  ];
  const satMin = u.requirements?.find((r) => r.kind === "SAT" && r.minimum != null && !r.program_id);
  if (satMin) exams.push({ key: "SAT-min", test: "SAT", scope: null, value: t("oc.exams.min", { n: satMin.minimum! }), source_url: satMin.source_url ?? null });
  // No published SAT range: show the SAT policy when the university states one.
  const satPolicy = u.requirements?.find((r) => r.kind === "SAT" && r.minimum == null && !r.program_id && /·/.test(r.label || ""));
  if (satPolicy && !exams.some((e) => e.test === "SAT")) {
    const p = /optional/.test(satPolicy.label) ? "up.sat.optional" : /not considered/.test(satPolicy.label) ? "up.sat.no" : "up.sat.required";
    exams.push({ key: "SAT-policy", test: "SAT", scope: null, value: t(p), source_url: satPolicy.source_url ?? null });
  }
  const notes: { label: string; text: string; url: string | null }[] = [
    m.waivers && { label: t("up.apply.waiver"), text: m.waivers.text, url: m.waivers.source_url },
    m.foundationYear && { label: t("up.apply.foundation"), text: m.foundationYear.text, url: m.foundationYear.source_url },
    // Certificate rules (e.g. Uzbekistan: SAT 1200+ → state grant), each from its official source.
    ...(u.requirements || [])
      .filter((r) => r.kind === "other" && r.minimum == null && !r.program_id && r.verification_status === "verified" && /→/.test(r.label || ""))
      .map((r) => ({ label: t("up.apply.cert"), text: r.label, url: r.source_url ?? null })),
  ].filter((n): n is { label: string; text: string; url: string | null } => !!n && !!n.text);
  return (
    <div className="up-apply">
      {m.route && (
        <p className="up-route">
          <span>{t("up.apply.route")}</span>
          <strong>{m.route.text}</strong>
          <SourceLink url={m.route.source_url} />
        </p>
      )}
      {(timeline.length > 0 || m.deadlineText) && (
        <section>
          <h3>{t("up.apply.deadlines")}</h3>
          {timeline.length > 0 && <DeadlineTimeline rows={timeline} />}
          {m.deadlineText && (
            <p className="up-note">{m.deadlineText.text} <SourceLink url={m.deadlineText.source_url} /></p>
          )}
        </section>
      )}
      {(exams.length > 0 || m.fees.length > 0) && (
        <div className="up-apply-facts">
          {exams.length > 0 && (
            <section>
              <h3>{t("oc.exams.title")}</h3>
              <ul className="up-exams">
                {exams.map((e) => (
                  <li key={e.key}>
                    <span>{e.test}{e.scope ? <small>{e.scope}</small> : null}</span>
                    <b>{e.value}</b>
                    <SourceLink url={e.source_url} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {m.fees.length > 0 && (
            <section>
              <h3>{t("up.apply.fee")}</h3>
              <ul className="up-rows">
                {m.fees.map((f) => (
                  <li key={f.amount + f.currency}>
                    <span>{f.scope || t("up.apply.fee.label")}</span>
                    <b>{currency(f.amount, f.currency)}</b>
                    <SourceLink url={f.source_url} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {notes.length > 0 && (
        <ul className="up-notes">
          {notes.map((n) => (
            <li key={n.label}>
              <Check size={15} aria-hidden="true" />
              <p><b>{n.label}</b> {n.text} <SourceLink url={n.url} /></p>
            </li>
          ))}
        </ul>
      )}
      <div className="up-cta">
        <Link className="up-btn is-primary is-lg" href={"/dashboard/application-practice?u=" + encodeURIComponent(u.slug)}>
          <Play size={15} aria-hidden="true" /> {t("up.apply.simulator")}
        </Link>
        {m.applyUrl && (
          <a className="up-btn is-lg" href={m.applyUrl} target="_blank" rel="noreferrer">{t("up.apply.open")} <ArrowUpRight size={14} aria-hidden="true" /></a>
        )}
        {m.admissionsUrl && m.admissionsUrl !== m.applyUrl && (
          <a className="up-btn is-lg" href={m.admissionsUrl} target="_blank" rel="noreferrer">{t("uni.next.admissions")} <ArrowUpRight size={14} aria-hidden="true" /></a>
        )}
      </div>
    </div>
  );
}

/* ── Costs & aid ───────────────────────────────────────────────────────── */
const livingKeys: Record<string, MessageKey> = {
  housing: "up.cost.housing", food: "up.cost.food", books: "up.cost.books", personal: "up.cost.personal", room_board: "up.cost.room_board", living: "up.cost.living",
};
export function CostsBody({ university: u, model: m, extras }: { university: University; model: CostModel; extras: ProfileExtras }) {
  const t = useT();
  const livingEx = extras.costs?.living;
  const feesUrl = u.official_web?.links.fees?.url || u.official_web?.links.funding?.url || u.financial_aid_url || null;
  const peak = Math.max(...(m.netPrice?.byIncome.map(([, v]) => v) || [1]), 1);
  const aid = extras.apply?.aid;
  const money = (n: number, c: string) => currency(n, c);
  // No published total: add tuition, fees and living rows when they share one currency.
  const parts = [m.tuition, m.fees, ...m.living].filter((x): x is NonNullable<typeof x> => !!x);
  const estimate =
    m.tuition && m.living.length && parts.every((p) => p.currency === m.tuition!.currency)
      ? { amount: parts.reduce((sum, p) => sum + p.amount, 0), currency: m.tuition.currency }
      : null;
  return (
    <div className="up-costs">
      <div className="up-cost-main">
        {m.tuition && (
          <div className="up-big">
            <span>{t("up.cost.tuition")}</span>
            <strong>{money(m.tuition.amount, m.tuition.currency)}</strong>
            <small>
              {[t("uni.note.per_year"), m.tuition.withFees ? t("u2.cost.withfees") : null, m.tuition.note, m.tuition.varies ? t("uni.note.varies") : null].filter(Boolean).join(" · ")}
              {m.tuition.basis && !/^per (academic )?year$/i.test(m.tuition.basis) ? <em>{m.tuition.basis}</em> : null}
            </small>
            <SourceLink url={m.tuition.source_url} />
          </div>
        )}
        {(m.fees || m.living.length > 0 || m.total || livingEx || estimate) && (
          <ul className="up-rows">
            {m.fees && (
              <li><span>{t("up.cost.fees")}</span><b>{money(m.fees.amount, m.fees.currency)}</b><SourceLink url={m.fees.source_url} /></li>
            )}
            {m.living.map((l) => (
              <li key={l.key}><span>{t(livingKeys[l.key])}{l.note ? <small>{l.note}</small> : null}</span><b>{money(l.amount, l.currency)}</b><SourceLink url={l.source_url} /></li>
            ))}
            {!m.living.length && livingEx && (
              <li>
                <span>{t("up.cost.living")}{livingEx.amount && livingEx.basis ? <small>{livingEx.basis}</small> : null}</span>
                <b>{livingEx.amount ? money(livingEx.amount, livingEx.currency) : livingEx.basis}</b>
                <SourceLink url={livingEx.source_url} />
              </li>
            )}
            {!m.total && estimate && (
              <li className="is-total"><span>{t("oc.mc.cost.estimate")}<small>{t("oc.mc.cost.estimate.note")}</small></span><b>{money(estimate.amount, estimate.currency)}</b></li>
            )}
            {m.total && (
              <li className="is-total"><span>{t("up.cost.total")}{m.total.note ? <small>{m.total.note}</small> : null}</span><b>{money(m.total.amount, m.total.currency)}</b><SourceLink url={m.total.source_url} /></li>
            )}
          </ul>
        )}
      </div>
      {m.netPrice && (
        <section className="up-net">
          <h3>{t("up.cost.net")}{m.netPrice.average ? <b>{money(m.netPrice.average, "USD")}</b> : null}</h3>
          <p className="up-note">{t("up.cost.net.note")}</p>
          {m.netPrice.byIncome.length > 0 && (
            <ul className="up-bars" aria-label={t("up.cost.net")}>
              {m.netPrice.byIncome.map(([label, v]) => (
                <li key={label}>
                  <span>{label}</span>
                  <i aria-hidden="true"><u style={{ width: Math.max((v / peak) * 100, 2) + "%" }} /></i>
                  <b>{money(v, "USD")}</b>
                </li>
              ))}
            </ul>
          )}
          <SourceLink url={m.netPrice.url || "https://collegescorecard.ed.gov/"} />
        </section>
      )}
      {(aid || m.aidLinks.length > 0 || feesUrl) && (
        <div className="up-aid">
          {aid && (
            <p>
              <b>{t("up.apply.aid")}</b>{" "}
              {[aid.value.international === true ? t("up.apply.aid.yes") : aid.value.international === false ? t("up.apply.aid.no") : null, aid.value.type].filter(Boolean).join(" · ")}
              {aid.value.note ? " — " + aid.value.note : ""} <SourceLink url={aid.source_url} />
            </p>
          )}
          <div className="up-links">
            {m.aidLinks.map((a) => (
              <a key={a.url} href={a.url} target="_blank" rel="noreferrer">{a.name} <ArrowUpRight size={13} aria-hidden="true" /></a>
            ))}
            {feesUrl && <a href={feesUrl} target="_blank" rel="noreferrer">{t("up.cost.official")} <ArrowUpRight size={13} aria-hidden="true" /></a>}
            <Link href="/scholarships">{t("up.cost.scholarships")} <ArrowUpRight size={13} aria-hidden="true" /></Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Scholarships and guides ───────────────────────────────────────────── */
export function ScholarshipsBody({ items }: { items: ProfileScholarship[] }) {
  const t = useT();
  return (
    <>
      <ul className="up-linklist">
        {items.map((s) => (
          <li key={s.slug}>
            <Link href={"/scholarships/" + s.slug}>
              <strong>{s.name}</strong>
              <span>
                {[s.funding === "full" ? t("ud.sch.full") : t("ud.sch.partial"), s.covers, s.deadline ? t("ud.sch.deadline", { date: fmtDate(s.deadline) }) : null].filter(Boolean).join(" · ")}
              </span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <Link className="up-more-link" href="/scholarships">{t("up.cost.scholarships")} <ArrowUpRight size={14} aria-hidden="true" /></Link>
    </>
  );
}

export function GuidesBody({ items }: { items: ProfileGuide[] }) {
  const t = useT();
  return (
    <>
      <ul className="up-linklist">
        {items.map((g) => {
          const inner = (
            <>
              <strong>{g.title}</strong>
              <span>{[g.publisher, g.minutes ? t("ud.guides.min", { n: g.minutes }) : null].filter(Boolean).join(" · ")}</span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </>
          );
          return (
            <li key={g.slug}>
              {g.url ? <a href={g.url} target="_blank" rel="noopener noreferrer">{inner}</a> : <Link href={"/articles/" + g.slug}>{inner}</Link>}
            </li>
          );
        })}
      </ul>
      <Link className="up-more-link" href="/articles">{t("ud.guides.all")} <ArrowUpRight size={14} aria-hidden="true" /></Link>
    </>
  );
}

/* ── Outcomes ──────────────────────────────────────────────────────────── */
export function outcomesData(u: University) {
  const s = u.scorecard;
  const cds = u.cds;
  const range = (r?: (number | null)[] | null) => (r && r[0] && r[2] ? `${r[0]}–${r[2]}` : null);
  const pct = (n?: number | null) => (n ? Math.round(n * 10) / 10 + "%" : null);
  // The latest federal year (us_current) wins over the older Scorecard snapshot, field by field.
  const c = u.us_current;
  const admit = c?.acceptance_rate ?? s?.admission_rate_pct ?? null;
  const curSat = c?.sat_reading_25 && c.sat_math_25 && c.sat_reading_75 && c.sat_math_75 ? `${c.sat_reading_25 + c.sat_math_25}–${c.sat_reading_75 + c.sat_math_75}` : null;
  const tiles: [MessageKey, string][] = (
    [
      admit ? ["up.out.admit", Math.round(admit * 10) / 10 + "%"] : null,
      range(cds?.sat_composite) ? ["up.out.sat", range(cds?.sat_composite)!] : curSat ? ["up.out.sat", curSat] : s?.sat_avg ? ["up.out.sat.avg", String(Math.round(s.sat_avg))] : null,
      c?.act_25 && c.act_75 ? ["u2.out.act", `${c.act_25}–${c.act_75}`] : s?.act_mid ? ["up.out.act", String(Math.round(s.act_mid))] : null,
      c?.international_share ? ["up.stat.intl", pct(c.international_share * 100)!] : null,
      cds?.avg_gpa ? ["up.out.gpa", String(cds.avg_gpa)] : null,
      s?.completion_4yr_pct ? ["ud.out.grad4", pct(s.completion_4yr_pct)!] : null,
      c?.grad_rate ? ["up.out.grad", pct(c.grad_rate * 100)!] : s?.completion_6yr_pct ? ["up.out.grad", pct(s.completion_6yr_pct)!] : null,
      s?.retention_pct ? ["up.out.retention", pct(s.retention_pct)!] : null,
      s?.pell_pct ? ["ud.out.pell", pct(s.pell_pct)!] : null,
      s?.federal_loan_pct ? ["ud.out.loan", pct(s.federal_loan_pct)!] : null,
      s?.median_debt ? ["up.out.debt", currency(s.median_debt, "USD")] : null,
    ] as ([MessageKey, string] | null)[]
  ).filter((x): x is [MessageKey, string] => !!x);
  const earnings: [MessageKey, number][] = (
    [["up.out.e1", s?.earnings_1yr], ["up.out.e6", s?.earnings_6yr], ["up.out.e10", c?.median_earnings_10y ?? s?.earnings_10yr]] as [MessageKey, number | undefined | null][]
  ).filter((x): x is [MessageKey, number] => !!x[1]);
  const year = c?.academic_year ?? null;
  // First-year admissions in the university's own Common Data Set, else its published summary.
  const adm = u.admission_summary;
  const applicants = cds?.applicants?.total ?? adm?.applicants ?? null;
  const admitted = cds?.admitted?.total ?? adm?.admitted ?? null;
  const enrolled = cds?.enrolled_first_year ?? adm?.enrolled ?? null;
  const snapshot: [MessageKey, string][] = (
    [
      applicants ? ["ud.snap.applicants", applicants.toLocaleString("en-US")] : null,
      admitted ? ["ud.snap.admitted", admitted.toLocaleString("en-US")] : null,
      enrolled ? ["ud.snap.enrolled", enrolled.toLocaleString("en-US")] : null,
      range(cds?.act_composite) ? ["ud.snap.act", range(cds?.act_composite)!] : null,
      cds?.class_rank?.top10_pct ? ["ud.snap.rank10", cds.class_rank.top10_pct + "%"] : null,
      cds?.test_policy ? ["ud.snap.policy", cds.test_policy] : null,
    ] as ([MessageKey, string] | null)[]
  ).filter((x): x is [MessageKey, string] => !!x);
  const snapshotUrl = cds?.cds_url || adm?.source_url || null;
  const body = u.us_stats?.enrollment?.undergraduate ?? u.us_stats?.enrollment?.all;
  const split = body && body.men != null && body.women != null && body.men + body.women > 0
    ? { women: Math.round((body.women / (body.men + body.women)) * 100), men: Math.round((body.men / (body.men + body.women)) * 100) }
    : null;
  return { tiles, earnings, snapshot, snapshotUrl, split, year };
}
export function OutcomesBody({ university: u }: { university: University }) {
  const t = useT();
  const { tiles, earnings, snapshot, snapshotUrl, split, year } = outcomesData(u);
  const peak = Math.max(...earnings.map(([, v]) => v), 1);
  return (
    <div className="up-outcomes">
      {tiles.length > 0 && (
        <dl className="up-stats">
          {tiles.map(([k, v]) => (
            <div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      )}
      {earnings.length > 0 && (
        <section>
          <h3>{t("up.out.earnings")}</h3>
          <ul className="up-bars">
            {earnings.map(([k, v]) => (
              <li key={k}><span>{t(k)}</span><i aria-hidden="true"><u style={{ width: (v / peak) * 100 + "%" }} /></i><b>{currency(v, "USD")}</b></li>
            ))}
          </ul>
        </section>
      )}
      {snapshot.length > 0 && (
        <section>
          <h3>{t("ud.snap.title")} <SourceLink url={snapshotUrl} /></h3>
          <dl className="up-stats">
            {snapshot.map(([k, v]) => (
              <div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </section>
      )}
      {split && (
        <section>
          <h3>{t("ud.body.title")}</h3>
          <ul className="up-bars">
            <li><span>{t("ud.body.women")}</span><i aria-hidden="true"><u style={{ width: split.women + "%" }} /></i><b>{split.women}%</b></li>
            <li><span>{t("ud.body.men")}</span><i aria-hidden="true"><u style={{ width: split.men + "%" }} /></i><b>{split.men}%</b></li>
          </ul>
        </section>
      )}
      {(tiles.length > 0 || earnings.length > 0) && (
        <p className="up-note">
          {t("up.out.note")}{year ? " " + t("u2.out.year", { year }) : ""} <SourceLink url="https://collegescorecard.ed.gov/" />
        </p>
      )}
    </div>
  );
}

/* ── FAQ and sources ───────────────────────────────────────────────────── */
const FAQ_KEYS: Record<FaqId, [MessageKey, MessageKey]> = {
  admission: ["oc.faq.admission.q", "oc.faq.admission.a"],
  sat: ["oc.faq.sat.q", "oc.faq.sat.a"],
  english: ["oc.faq.english.q", "oc.faq.english.a"],
  tuition: ["oc.faq.tuition.q", "oc.faq.tuition.a"],
  deadline: ["oc.faq.deadline.q", "oc.faq.deadline.a"],
};
export function FaqBody({ university: u }: { university: University }) {
  const t = useT();
  const name = u.short_name || displayName(u.name);
  const facts = faqFacts(u);
  // Every question is asked; a figure the university does not publish says so plainly.
  const official = u.admissions_url || u.website || null;
  return (
    <Accordion type="multiple" className="up-faq">
      {(Object.keys(FAQ_KEYS) as FaqId[]).map((id) => {
        const [q, a] = FAQ_KEYS[id];
        const f = facts.find((x) => x.id === id);
        const detail = f?.detail.map((p) => (typeof p === "string" ? p : t(("uni.note." + p.t) as MessageKey))).join(", ");
        return (
          <AccordionItem key={id} value={id}>
            <AccordionTrigger>{t(q, { name })}</AccordionTrigger>
            <AccordionContent>
              {f ? (
                <>{t(a, { name, value: f.value, detail: detail || "—" })} <SourceLink url={f.href} /></>
              ) : (
                <span className="up-faq-none">{t("u2.faq.none", { name })} <SourceLink url={official} /></span>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

const SOURCE_KEYS: Record<string, MessageKey> = {
  official: "oc.src.official",
  admissions: "oc.src.admissions",
  requirements: "oc.src.requirements",
  scorecard: "oc.src.scorecard",
  ipeds: "oc.src.ipeds",
};
export function SourcesLine({ university: u }: { university: University }) {
  const { t, lang } = useI18n();
  const { links, updated } = profileSources(u);
  if (!links.length && !updated) return null;
  return (
    <p className="up-sources">
      {links.length > 0 && <span>{t("oc.src.title")}:</span>}
      {links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
          {t(SOURCE_KEYS[l.label])} <ArrowUpRight size={12} aria-hidden="true" />
        </a>
      ))}
      {updated && (
        <small>
          {t("oc.src.updated", {
            date: new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(updated + "T00:00:00Z")),
          })}
        </small>
      )}
    </p>
  );
}

/** "Last checked <date>" under a data block, when its records carry a date. */
export function CheckedLine({ date }: { date: string | null }) {
  const { t, lang } = useI18n();
  if (!date) return null;
  return (
    <p className="up-checked">
      {t("oc.src.updated", { date: new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date + "T00:00:00Z")) })}
    </p>
  );
}
export const applyChecked = (u: University) =>
  lastChecked([...u.deadlines, ...u.requirements, ...u.admissions], [u.application_brief?.checked_at]);
export const costsChecked = (u: University) => lastChecked(u.costs);
