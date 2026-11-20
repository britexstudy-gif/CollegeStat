"use client";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Minus, X } from "lucide-react";
import { useI18n, useT, type Translate } from "./i18n";
import { countryName } from "@/lib/domain";
import { JsonLd } from "@/components/seo/json-ld";
import { buildFaqJsonLd } from "@/lib/seo/json-ld";
import {
  CENTRAL_ASIA,
  COVER_KEYS,
  centralAsiaCodes,
  DEADLINE_ROW,
  deadlineInfo,
  type Scholarship,
} from "@/lib/scholarships-data";
import { formatDate, localeOf, relativeDays, dateState } from "@/lib/dates";
import { centralAsiaLabel, deadlineView, flagOf, levelLabel } from "./scholarship-format";
import { CoverCredit, ScholarshipCover } from "./scholarship-cover";
import { ContentVideo } from "./content-video";
import "./scholarships-directory.css";

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Our own answers, built only from the facts on the page; curated ones come first. */
function buildFaq(s: Scholarship, t: Translate, locale: string) {
  const ca = centralAsiaCodes(s);
  const out = [...s.faq];
  const has = (re: RegExp) => s.faq.some((f) => re.test(f.q));
  if (!has(/central asia|uzbek|kazakh|kyrgyz|tajik|my country|eligible/i)) {
    const a =
      ca.length === CENTRAL_ASIA.length
        ? t("sch.faq.ca.all")
        : ca.length
          ? t("sch.faq.ca.some", { list: ca.map(countryName).join(", ") })
          : s.eligibleText
            ? t("sch.ca.unconfirmed")
            : null;
    if (a) out.push({ q: t("sch.faq.ca.q"), a: [a, s.caNote].filter(Boolean).join(" ") });
  }
  if (!has(/bachelor|undergrad|level/i)) {
    const a = s.exchange
      ? t("sch.faq.level.exchange")
      : s.undergrad
        ? t("sch.faq.level.yes")
        : t("sch.faq.level.no", { level: levelLabel(s.level, t) });
    out.push({ q: t("sch.faq.level.q"), a });
  }
  if (!has(/cover|stipend|allowance|how much/i) && (s.covers || s.amountHeadline)) {
    out.push({ q: t("sch.faq.covers.q"), a: (s.covers ?? s.amountHeadline)! });
  }
  if (!has(/deadline|when|round/i) && (s.deadline || s.deadlineNote)) {
    const a = [s.deadline ? t("sch.faq.deadline.date", { date: formatDate(s.deadline, locale, "long") }) : null, s.deadlineNote].filter(Boolean).join(" ");
    out.push({ q: t("sch.faq.deadline.q"), a });
  }
  return out;
}

/** One scholarship: photo or pattern, the money, who can apply, how to get it, the dates, the universities. */
export function ScholarshipDetail({
  s,
  related,
  today,
  jsonLd,
}: {
  s: Scholarship;
  related: Scholarship[];
  today: string;
  jsonLd?: React.ReactNode;
}) {
  const t = useT();
  const { lang } = useI18n();
  const locale = localeOf(lang);
  const ca = centralAsiaCodes(s);
  const info = deadlineInfo(s, today);
  const dl = deadlineView(s, today, t, locale, true);
  const longDate = (iso: string) => formatDate(iso, locale, "long");
  const country = s.country && s.country.length === 2 ? countryName(s.country) : null;
  // Undated rows only repeat the note above them, so they are left out when a note exists.
  const timeline = (s.deadlineNote ? s.timeline.filter((r) => r.date) : s.timeline).map((r) => ({ ...r, label: r.label === DEADLINE_ROW ? t("sch.deadline.label") : r.label }));
  const faq = buildFaq(s, t, locale);
  const hasCoverage = COVER_KEYS.some((k) => s.coverage[k] !== null);
  const caStatus = (code: string) => (ca.includes(code as never) ? "yes" : s.eligibleCodes.length ? "no" : "check");
  const confirmed = ca.length > 0 || s.eligibleCodes.length > 0;
  const who: [string, string | null][] = [
    [t("sch.who.nationality"), s.eligibleText && !/^all$/i.test(s.eligibleText) ? s.eligibleText : null],
    [t("sch.who.level"), s.exchange ? t("sch.exchange") : s.level !== "Any" ? levelLabel(s.level, t) : null],
    [t("sch.who.grades"), s.grades],
    [t("sch.who.english"), s.english],
    [t("sch.who.age"), s.age],
  ];
  const sources = [
    ...(s.applicationUrl ? [{ title: t("sch.src.official"), url: s.applicationUrl }] : []),
    ...s.sources,
    ...(s.sourceUrl && s.sourceUrl !== s.applicationUrl && !s.sources.some((x) => x.url === s.sourceUrl) ? [{ title: t("sch.src.source"), url: s.sourceUrl }] : []),
  ].filter((x, i, all) => all.findIndex((y) => y.url === x.url) === i);

  return (
    <article className="sp">
      {jsonLd}
      {faq.length > 0 && <JsonLd data={buildFaqJsonLd(faq.map((f) => ({ question: f.q, answer: f.a })))} />}
      <Link href="/scholarships" className="sp-back">
        <ArrowLeft size={15} aria-hidden="true" /> {t("sch.back")}
      </Link>

      <header className="sp-hero">
        <figure className="sp-hero-media">
          <ScholarshipCover slug={s.slug} image={s.image} label={country ?? s.provider} className="sp-cover" eager />
          {s.image && <figcaption><CoverCredit image={s.image} label={t("sch.photo")} /></figcaption>}
        </figure>
        <div className="sp-hero-text">
          <p className="sd-eyebrow">
            {country && <span aria-hidden="true">{flagOf(s.country)} </span>}
            {[country, s.exchange ? t("sch.exchange") : s.level !== "Any" ? levelLabel(s.level, t) : null].filter(Boolean).join(" · ")}
          </p>
          <h1>{s.name}</h1>
          {s.provider && <p className="sp-host">{t("sch.funder", { name: s.provider })}</p>}
          <div className="sp-tags">
            <span className={"sd-pill" + (s.funding === "full" ? " is-full" : "")}>{t(s.funding === "full" ? "sch.funding.full" : "sch.funding.partial")}</span>
            {ca.length > 0 && <span className="sd-pill is-ca">{centralAsiaLabel(ca, t)}</span>}
            {!s.undergrad && <span className="sd-pill is-warn">{t("sch.notUndergrad")}</span>}
          </div>
          {s.applicationUrl && (
            <a className="sp-cta sp-hero-cta" href={s.applicationUrl} target="_blank" rel="noopener noreferrer">
              {t("sch.apply")} <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          )}
        </div>
      </header>

      <dl className="sp-strip">
        <div>
          <dt>{t("sch.facts.covers")}</dt>
          <dd>{s.amountHeadline ?? t(s.funding === "full" ? "sch.funding.full" : "sch.funding.partial")}</dd>
        </div>
        <div className={"sp-deadline is-" + dl.tone}>
          <dt>{t("sch.facts.deadline")}</dt>
          <dd>
            {dl.date ? <time dateTime={info.date ?? undefined}>{dl.date}</time> : dl.status}
            {dl.date && (
              <small>
                <b>{dl.status}</b> · {dl.relative}
              </small>
            )}
            {dl.next && <small>{dl.next}</small>}
            {dl.expected && !dl.next && <small>{t("sch.card.expected", { date: dl.expected })}</small>}
          </dd>
        </div>
        <div>
          <dt>{t("sch.facts.level")}</dt>
          <dd>{s.exchange ? t("sch.exchange") : s.undergrad ? t("sch.level.bachelor") : levelLabel(s.level, t)}</dd>
        </div>
        <div>
          <dt>{t("sch.ca.title")}</dt>
          <dd>{ca.length ? centralAsiaLabel(ca, t) : confirmed ? t("sch.ca.no") : t("sch.ca.check")}</dd>
        </div>
      </dl>

      <div className="sp-layout">
        <div className="sp-main">
          {(s.covers || s.description || hasCoverage) && (
            <section aria-labelledby="sp-covers">
              <h2 id="sp-covers">{t("sch.s.covers")}</h2>
              {hasCoverage && (
                <ul className="sp-cover-grid">
                  {COVER_KEYS.map((k) => {
                    const v = s.coverage[k];
                    const Icon = v === true ? Check : v === false ? X : Minus;
                    return (
                      <li key={k} className={v === true ? "is-yes" : v === false ? "is-no" : "is-unknown"}>
                        <Icon size={16} aria-hidden="true" />
                        <span>
                          <strong>{t(("sch.cover." + k) as "sch.cover.tuition")}</strong>
                          <small>{s.coverageNotes[k] ?? t(v === true ? "sch.cover.yes" : v === false ? "sch.cover.no" : "sch.cover.unknown")}</small>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {s.covers && <p className="sp-lead">{s.covers}</p>}
              {s.description && s.description !== s.covers && <p>{s.description}</p>}
            </section>
          )}

          <section aria-labelledby="sp-who">
            <h2 id="sp-who">{t("sch.s.who")}</h2>
            <div className="sp-ca">
              <p>{t("sch.ca.title")}</p>
              <ul>
                {CENTRAL_ASIA.map((c) => {
                  const st = caStatus(c);
                  return (
                    <li key={c} className={"is-" + st}>
                      {st === "yes" ? <Check size={14} aria-hidden="true" /> : st === "no" ? <X size={14} aria-hidden="true" /> : <Minus size={14} aria-hidden="true" />}
                      <span>{countryName(c)}</span>
                      <small>{t(st === "yes" ? "sch.ca.yes" : st === "no" ? "sch.ca.no" : "sch.ca.check")}</small>
                    </li>
                  );
                })}
              </ul>
              {s.caNote ? <p className="sp-note">{s.caNote}</p> : !confirmed && <p className="sp-note">{t("sch.ca.unconfirmed")}</p>}
            </div>
            {who.some(([, v]) => v) && (
              <dl className="sp-who">
                {who.map(([k, v]) =>
                  v ? (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ) : null,
                )}
              </dl>
            )}
            {s.eligibility.length > 0 && (
              <ul className="sp-bullets">
                {s.eligibility.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </section>

          {s.steps.length > 0 && (
            <section aria-labelledby="sp-steps">
              <h2 id="sp-steps">{t("sch.s.how")}</h2>
              <ol className="sp-steps">
                {s.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          )}

          {(timeline.length > 0 || s.deadlineNote) && (
            <section aria-labelledby="sp-when">
              <h2 id="sp-when">{t("sch.s.when")}</h2>
              {s.deadlineNote && <p className="sp-callout">{s.deadlineNote}</p>}
              {timeline.length > 0 && (
                <ol className="sp-timeline">
                  {timeline.map((row) => {
                    const st = row.date ? dateState(row.date, today) : null;
                    return (
                      <li key={row.label + row.date} className={st === "past" ? "is-past" : undefined}>
                        <time className="sp-when" dateTime={row.date ?? undefined}>{row.date ? formatDate(row.date, locale) : "·"}</time>
                        <span>
                          <strong>{row.label}</strong>
                          {row.note && <small>{row.note}</small>}
                        </span>
                        {row.date && <em>{st === "past" ? t("sch.state.closed") + " · " : ""}{relativeDays(row.date, today, locale)}</em>}
                      </li>
                    );
                  })}
                </ol>
              )}
              {info.state === "closed" && <p className="sp-note">{t("sch.closedHint")}</p>}
              {info.state === "next" && <p className="sp-note">{dl.next ?? t("sch.cycle.past")}</p>}
            </section>
          )}

          {s.documents.length > 0 && (
            <section aria-labelledby="sp-docs">
              <h2 id="sp-docs">{t("sch.s.docs")}</h2>
              <ul className="sp-docs">
                {s.documents.map((d) => (
                  <li key={d}>
                    <Check size={15} aria-hidden="true" />
                    {d}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(s.universities.length > 0 || s.browseCountry) && (
            <section aria-labelledby="sp-unis">
              <h2 id="sp-unis">{t("sch.s.unis")}</h2>
              {s.universities.length > 0 && (
                <ul className="sp-unis">
                  {s.universities.map((u) => (
                    <li key={u.slug ?? u.name}>
                      {u.slug ? (
                        <Link href={"/university/" + u.slug}>
                          <span>{u.name}</span>
                          <ArrowRight size={15} aria-hidden="true" />
                        </Link>
                      ) : (
                        <span>{u.name}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {s.browseCountry && (
                <Link className="sp-more" href={"/universities?country=" + s.browseCountry}>
                  {t("sch.s.unisBrowse", { country: countryName(s.browseCountry) })} <ArrowRight size={15} aria-hidden="true" />
                </Link>
              )}
            </section>
          )}

          {s.video && (
            <section aria-labelledby="sp-video">
              <h2 id="sp-video">{t("sch.s.video")}</h2>
              <ContentVideo id={s.video.id} title={s.video.title} channel={s.video.channel} />
            </section>
          )}

          {faq.length > 0 && (
            <section aria-labelledby="sp-faq">
              <h2 id="sp-faq">{t("sch.s.faq")}</h2>
              <div className="sp-faq">
                {faq.map((f, i) => (
                  <details key={f.q} open={i === 0}>
                    <summary>{f.q}</summary>
                    <p>{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          {sources.length > 0 && (
            <section aria-labelledby="sp-src">
              <h2 id="sp-src">{t("sch.s.sources")}</h2>
              <ul className="sp-links">
                {sources.map((x) => (
                  <li key={x.url}>
                    <a href={x.url} target="_blank" rel="noopener noreferrer">
                      {x.title} <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                    <small>{host(x.url)}</small>
                  </li>
                ))}
              </ul>
              <p className="sp-note">
                {s.checkedAt ? t("sch.src.checked", { date: longDate(s.checkedAt) }) + ". " : ""}
                {t("sch.src.confirm")}
              </p>
            </section>
          )}
        </div>

        <aside className="sp-aside">
          <dl className="sp-facts">
            {s.provider && (
              <div>
                <dt>{t("sch.facts.host")}</dt>
                <dd>{s.provider}</dd>
              </div>
            )}
            {country && (
              <div>
                <dt>{t("sch.facts.country")}</dt>
                <dd>{country}</dd>
              </div>
            )}
            <div>
              <dt>{t("sch.facts.funding")}</dt>
              <dd>{t(s.funding === "full" ? "sch.funding.full" : "sch.funding.partial")}</dd>
            </div>
            {dl.date && (
              <div>
                <dt>{t("sch.facts.deadline")}</dt>
                <dd>
                  {dl.date}
                  <small>
                    {dl.status} · {dl.relative}
                  </small>
                </dd>
              </div>
            )}
          </dl>
          {s.applicationUrl && (
            <a className="sp-cta" href={s.applicationUrl} target="_blank" rel="noopener noreferrer">
              {t("sch.apply")} <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          )}
          {s.checkedAt && <p className="sp-checked">{t("sch.src.checked", { date: longDate(s.checkedAt) })}</p>}
        </aside>
      </div>

      {related.length > 0 && (
        <section className="sp-related" aria-labelledby="sp-related">
          <h2 id="sp-related">{t("sch.s.related")}</h2>
          <ul className="sd-grid">
            {related.map((r) => {
              const where = r.country && r.country.length === 2 ? countryName(r.country) : null;
              return (
                <li key={r.slug}>
                  <article className="sd-card">
                    <div className="sd-media">
                      <ScholarshipCover slug={r.slug} image={r.image} label={where ?? r.provider} className="sd-cover" />
                      {where && (
                        <span className="sd-flag">
                          <span aria-hidden="true">{flagOf(r.country)}</span> {where}
                        </span>
                      )}
                    </div>
                    <div className="sd-body">
                      {r.provider && <span className="sd-host">{r.provider}</span>}
                      <h3 className="sd-name">
                        <Link href={"/scholarships/" + r.slug} className="sd-link">
                          {r.name}
                        </Link>
                      </h3>
                      {(r.amountHeadline || r.covers) && <p className="sd-covers sd-rel-covers">{r.amountHeadline ?? r.covers}</p>}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </article>
  );
}
