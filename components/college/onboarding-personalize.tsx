"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bookmark, BookmarkCheck, Check } from "lucide-react";
import { Mascot } from "./mascot";
import { useCollege } from "./provider";
import { saveProfile } from "@/services/profile-account";
import type { University } from "@/lib/domain";
import type { IntakePreferences } from "@/lib/student-intake";
import { publicRequest } from "@/lib/supabase/catalogue";
import { UniversityLogo } from "./primitives";
import { PricingTable } from "./pricing";
import { useEarlyAccess } from "./plans-page";
import { useI18n } from "./i18n";
import { programme, programmeKey } from "@/lib/programmes";
import { buildPlan, nextSteps, pickUniversities, type PersonalPlan, type PlanNote, type PlanEvent, type PlanUniversity, type Tier } from "./onboarding-plan";
import { DEFAULT_SCALE, type Answers } from "./onboarding-steps";
import { normalizeGrade } from "@/lib/grades/convert";
import type { MessageKey } from "@/lib/i18n/messages";
import { regionName } from "@/lib/region-name";
import { PersonalizeCard } from "./personalize-report";

export { regionName };

type Loaded = { plan: PersonalPlan; cards: Map<string, University> };

const TIERS: Tier[] = ["reach", "match", "safety"];

/** Real catalogue records: the top of each admission band per country, within budget when one is set. */
async function loadPlan(answers: Answers, onStage?: (n: number) => void, signal?: AbortSignal): Promise<Loaded> {
  const countries = answers.countries.slice(0, 5);
  const budget = answers.funding === "full" || !answers.budget || answers.budget >= 90000 ? undefined : answers.budget;
  const bands = ["", "&admission_min=25&admission_max=60", "&admission_min=61"];
  const fetchBands = (cost: number | undefined) =>
    Promise.all(
      countries.flatMap((c) =>
        bands.map((band) =>
          publicRequest<{ universities: University[] }>(
            `mode=explore&sort=rank&country=${encodeURIComponent(c)}${cost ? "&cost_max=" + cost : ""}${band}`,
            signal,
          )
            .then((r) => r.universities.slice(0, 8))
            .catch(() => [] as University[]),
        ),
      ),
    ).then((groups) => groups.flat());
  let candidates = await fetchBands(budget);
  if (budget && candidates.length < 4) candidates = await fetchBands(undefined);
  onStage?.(2);
  const picks = pickUniversities(candidates, answers);
  const full = picks.length
    ? await publicRequest<University[]>("ids=" + encodeURIComponent(picks.map((p) => p.id).join(",")), signal).catch(() => [] as University[])
    : [];
  onStage?.(3);
  const { allScholarships } = await import("@/lib/scholarships-load");
  const plan = buildPlan(answers, picks, full, allScholarships);
  return { plan, cards: new Map(candidates.map((u) => [u.id, u])) };
}

const money = (n: number, lang: string) => "$" + Math.round(n).toLocaleString(lang);

function Row({ u, card, lang }: { u: PlanUniversity; card?: University; lang: string }) {
  const s = useCollege();
  const { t } = useI18n();
  const saved = s.saved.includes(u.id);
  const facts = [
    u.rank && `${u.rank.provider.toUpperCase()} #${u.rank.rank}`,
    u.tuition_usd != null && t("obp.fact.tuition", { amount: money(u.tuition_usd, lang) }),
    u.acceptance != null && t("obp.fact.admit", { rate: Math.round(u.acceptance) }),
    u.english_min && t("obp.fact.english", { test: u.english_min.test, min: u.english_min.minimum }),
  ].filter(Boolean) as string[];
  return (
    <li className="obp-uni">
      {card && <UniversityLogo university={card} size="sm" />}
      <div>
        <Link href={"/university/" + u.slug} target="_blank">
          {u.name}
        </Link>
        <small>{[u.city?.split(",")[0], regionName(u.country_code, lang)].filter(Boolean).join(", ")}</small>
        <p>
          {facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
          {u.within_budget === false && <span className="is-warn">{t("obp.fact.over")}</span>}
        </p>
      </div>
      <button type="button" aria-pressed={saved} disabled={s.busy || !s.user} onClick={() => void s.toggleSaved(u.id)} aria-label={t("obp.save") + ": " + u.name}>
        {saved ? <BookmarkCheck size={15} aria-hidden="true" /> : <Bookmark size={15} aria-hidden="true" />}
        <span>{saved ? t("ob.saved") : t("obp.save")}</span>
      </button>
    </li>
  );
}

function Timeline({ events, lang }: { events: PlanEvent[]; lang: string }) {
  const { t } = useI18n();
  const day = (d: string) =>
    new Intl.DateTimeFormat(lang, d.length === 7 ? { month: "short", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
      new Date(d.length === 7 ? d + "-01T00:00:00Z" : d + "T00:00:00Z"),
    );
  return (
    <ol className="obp-events">
      {events.map((e) => (
        <li key={e.date + e.kind + (e.title || "") + (e.university || "")}>
          <time dateTime={e.date}>{day(e.date)}</time>
          <div>
            <strong>{e.href ? <Link href={e.href} target="_blank">{e.title || e.university}</Link> : e.title}</strong>
            <small>{[t(("obp.event." + e.kind) as MessageKey), e.kind === "deadline" ? e.university : ""].filter(Boolean).join(" · ")}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

const STAGES = ["obq.load.s1", "obq.load.s2", "obq.load.s3", "obq.load.s4"] as const;
/** Shortest time each step stays on screen, so the ticks are readable even when the data arrives fast. */
const STEP_MS = 520;

/** The wait: Spark works while the real stages of building the plan tick off one by one. */
function Preparing({ done }: { done: number }) {
  const { t } = useI18n();
  const active = Math.min(done, STAGES.length - 1);
  const pct = Math.min(100, Math.round(((done + (done < STAGES.length ? 0.55 : 0)) / STAGES.length) * 100));
  return (
    <div className="ob ob-personalize" role="dialog" aria-modal="true" aria-labelledby="obp-title">
      <main className="obp">
        <div className="obp-wait">
          <div className="obp-orbit" aria-hidden="true">
            <span className="obp-ring is-1" />
            <span className="obp-ring is-2" />
            <span className="obp-arc" />
            <span className="obp-sats">
              <i />
              <i />
              <i />
            </span>
            <Mascot size={88} busy />
          </div>
          <h1 id="obp-title">{t("obq.load.title")}</h1>
          <p>{t("obq.load.sub")}</p>
          <div
            className="obp-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={t("obq.load.step", { n: active + 1, total: STAGES.length, name: t(STAGES[active]) })}
          >
            <i style={{ width: pct + "%" }} />
          </div>
          <ol className="obp-steps" aria-live="polite">
            {STAGES.map((k, i) => (
              <li key={k} className={i < done ? "is-done" : i === done ? "is-active" : undefined} aria-current={i === done ? "step" : undefined}>
                <span className="obp-tick" aria-hidden="true">
                  {i < done ? <Check size={12} strokeWidth={3} /> : null}
                </span>
                {t(k)}
              </li>
            ))}
          </ol>
        </div>
      </main>
    </div>
  );
}

/** A balanced list: roughly 2 reach, 3 match and 2 safety. */
const TIERS_MIX: Record<Tier, number> = { reach: 2, match: 3, safety: 2 };

/** After the welcome questions: a plan built from the answers and real catalogue records. */
export function Personalize({ answers, onDone }: { answers: Answers; onDone: () => void }) {
  const s = useCollege();
  const { t, lang } = useI18n();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [target, setTarget] = useState(0);
  const [shown, setShown] = useState(0);
  const started = useRef(false);
  const ready = useRef<Loaded | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      // Step 1 is the answers already in hand; the others tick when that work really finishes.
      setTarget(1);
      let result: Loaded | null = null;
      try {
        result = await loadPlan(answers, (n) => setTarget((x) => Math.max(x, n)));
      } catch {}
      result ??= { plan: buildPlan(answers, [], [], []), cards: new Map() };
      try {
        const owner = s.accountScope.capture();
        if (s.user && owner.owner === s.user.id) {
          await saveProfile(
            s.accountScope,
            {
              display_name: s.profile?.display_name ?? null,
              preferences: { ...(s.profile?.preferences as IntakePreferences), personal_plan: result.plan } as Record<string, unknown>,
            },
            owner,
          );
          await s.refreshAccount();
        }
      } catch {}
      ready.current = result;
      setTarget(STAGES.length);
    })();
  }, [answers, s]);

  // Pace the ticks: one step at a time, never faster than STEP_MS; the result opens just after the last tick.
  useEffect(() => {
    if (shown < target) {
      const id = setTimeout(() => setShown((n) => n + 1), STEP_MS);
      return () => clearTimeout(id);
    }
    if (shown >= STAGES.length && ready.current) {
      const id = setTimeout(() => setLoaded(ready.current), 380);
      return () => clearTimeout(id);
    }
  }, [shown, target]);

  if (paywall) return <PaywallStep onDone={onDone} />;
  if (!loaded) return <Preparing done={shown} />;

  const { plan, cards } = loaded;
  const name = answers.name.trim().split(" ")[0];
  const subject = (v: string) => {
    const x = programme(v);
    return x ? t(programmeKey(x) as MessageKey) : v;
  };
  const note = (n: PlanNote) =>
    t(("obd.tl." + n.id) as MessageKey, {
      ...(n.vars || {}),
      ...(n.vars?.programme ? { programme: subject(n.vars.programme) } : {}),
      ...(n.vars?.langs ? { langs: n.vars.langs.split(",").map((l) => t(("obd.sl." + l) as MessageKey)).join(", ") } : {}),
    });
  const when = (d: string) =>
    new Intl.DateTimeFormat(lang, d.length === 7 ? { month: "long", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
      new Date(d.length === 7 ? d + "-01T00:00:00Z" : d + "T00:00:00Z"),
    );

  // What we learned: only rows the student actually answered.
  const scale = answers.grade_scale ?? (answers.certificate ? DEFAULT_SCALE[answers.certificate] : undefined);
  const norm = scale && answers.grade.trim() ? normalizeGrade(scale, answers.grade) : null;
  const english = plan.tests.find((x) => x.kind === "english");
  const englishValue =
    english?.kind === "english" && english.status === "taken" && english.score != null
      ? `${english.test ?? ""} ${english.score}`.trim()
      : english?.kind === "english" && english.status === "planned"
        ? t("obq.res.en.planned", { test: english.test || "IELTS" })
        : t("obq.res.en.none");
  const facts: [string, string][] = [
    [t("obq.res.from"), [answers.home_city.trim(), answers.home_country ? regionName(answers.home_country, lang) : ""].filter(Boolean).join(", ")],
    [t("obq.res.study"), answers.subjects.slice(0, 3).map(subject).join(", ")],
    [t("obq.res.where"), answers.countries.slice(0, 5).map((c) => regionName(c, lang)).join(", ")],
    [t("obq.res.start"), answers.start_year ? [t(("obd.term." + (answers.intake_term ?? "fall")) as MessageKey), answers.start_year].join(" ") : ""],
    [t("obq.res.budget"), answers.funding === "full" ? t("obq.res.budget.full") : answers.budget ? t("obq.res.budget.up", { amount: money(answers.budget, lang) }) : ""],
    [t("obq.res.grades"), norm ? `${norm.gpa.toFixed(2)} / 4.0 · ${norm.pct}%` : ""],
    [t("obq.res.english"), englishValue],
  ];
  const steps = nextSteps(answers, plan);
  const stepText = (n: (typeof steps)[number]) => {
    const vars = { ...(n.vars || {}) } as Record<string, string | number>;
    if (typeof vars.date === "string") vars.date = when(vars.date);
    return t(("obq.ns." + n.id) as MessageKey, vars);
  };
  const counts = TIERS.map((tier) => [tier, plan.universities.filter((u) => u.tier === tier).length] as const);

  return (
    <div className="ob ob-personalize" role="dialog" aria-modal="true" aria-labelledby="obp-title">
      <main className="obp obp-done">
        <div className="obp-plan">
          <header className="obp-hero">
            <Mascot size={76} />
            <div>
              <h1 id="obp-title">{name ? t("obq.res.title.named", { name }) : t("obq.res.title")}</h1>
              <p>{t("obq.res.lede")}</p>
            </div>
          </header>

          <section className="obp-sec" aria-labelledby="obp-learned">
            <h2 id="obp-learned">{t("obq.res.learned")}</h2>
            <dl className="obp-facts">
              {facts
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
          </section>

          <section className="obp-sec" aria-labelledby="obp-next">
            <h2 id="obp-next">{t("obq.res.next")}</h2>
            <ol className="obp-todo">
              {steps.map((n, i) => (
                <li key={n.id}>
                  <b aria-hidden="true">{i + 1}</b>
                  {n.href ? (
                    <Link href={n.href} target={n.href.startsWith("/dashboard") ? undefined : "_blank"}>
                      {stepText(n)}
                    </Link>
                  ) : (
                    <span>{stepText(n)}</span>
                  )}
                </li>
              ))}
            </ol>
          </section>

          {plan.universities.length > 0 ? (
            <section className="obp-sec" aria-labelledby="obp-unis">
              <h2 id="obp-unis">{t("obq.res.list.title")}</h2>
              <p className="obp-sub">{t("obq.res.list.text")}</p>
              <ul className="obp-mix" aria-label={t("obp.unis.title")}>
                {counts.map(([tier, n]) => (
                  <li key={tier} className={"is-" + tier}>
                    <span>{t(("obp.tier." + tier) as MessageKey)}</span>
                    <b>
                      {n}
                      <small> / {TIERS_MIX[tier]}</small>
                    </b>
                  </li>
                ))}
              </ul>
              <div className="obp-tiers">
                {TIERS.map((tier) => {
                  const list = plan.universities.filter((u) => u.tier === tier);
                  return list.length ? (
                    <div key={tier} className={"obp-tier is-" + tier}>
                      <h3>
                        {t(("obp.tier." + tier) as MessageKey)} <small>{t(("obp.tier." + tier + ".hint") as MessageKey)}</small>
                      </h3>
                      <ul>
                        {list.map((u) => (
                          <Row key={u.id} u={u} card={cards.get(u.id)} lang={lang} />
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })}
              </div>
            </section>
          ) : (
            <p className="obp-sub">{t("obp.none")}</p>
          )}

          {plan.timeline.length > 0 && (
            <section className="obp-sec" aria-labelledby="obp-time">
              <h2 id="obp-time">{t("obq.res.dates")}</h2>
              <Timeline events={plan.timeline} lang={lang} />
            </section>
          )}

          {plan.scholarships.length > 0 && (
            <section className="obp-sec" aria-labelledby="obp-sch">
              <h2 id="obp-sch">{t("obp.sch.title")}</h2>
              <ul className="obp-sch">
                {plan.scholarships.map((x) => (
                  <li key={x.slug}>
                    <Link href={"/scholarships/" + x.slug} target="_blank">
                      {x.name}
                    </Link>
                    <small>{[x.country && regionName(x.country, lang), x.provider, t(x.funding === "full" ? "obp.sch.full" : "obp.sch.partial")].filter(Boolean).join(" · ")}</small>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!!plan.tailored?.length && (
            <section className="obp-sec obp-tailored" aria-labelledby="obp-tl">
              <h2 id="obp-tl">{t("obd.tl.title")}</h2>
              <ul>
                {plan.tailored.map((n) => (
                  <li key={n.id}>{note(n)}</li>
                ))}
              </ul>
            </section>
          )}

          <PersonalizeCard />

          <footer className="obp-end">
            <small>{t("obp.note")}</small>
            <button type="button" className="ob-next obp-go" onClick={() => setPaywall(true)}>
              {t("ob.continue")} <ArrowRight size={16} aria-hidden="true" />
            </button>
          </footer>
        </div>
      </main>
    </div>
  );
}

/** The last onboarding step: the three plans. Payments are not connected, so a
 * paid choice joins early access (Plus free until launch) and continues. */
export function PaywallStep({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const access = useEarlyAccess();
  return (
    <div className="ob ob-personalize ob-paywall" role="dialog" aria-modal="true" aria-labelledby="obw-title">
      <main className="obw">
        <p className="obw-step">{t("d2.paywall.step")}</p>
        <h1 id="obw-title">{t("d2.paywall.title")}</h1>
        <p>{t("d2.paywall.text")}</p>
        <PricingTable
          compact
          current={access.current}
          earlyAccess={access.earlyAccess}
          busy={access.busy}
          onChoose={(choice) => {
            if (choice === "free") onDone();
            else void access.join(choice).then((joined) => joined && onDone());
          }}
        />
        <button type="button" className="obw-skip" onClick={onDone}>
          {t("d2.paywall.skip")}
        </button>
      </main>
    </div>
  );
}
