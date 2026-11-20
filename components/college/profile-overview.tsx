"use client";
import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  Minus,
  RefreshCw,
  Sparkles,
  X,
  Crown,
  GraduationCap,
  NotebookPen,
  PenLine,
  Plus,
  Target,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { flagOf } from "./scholarship-format";
import "./profile-v2.css";
import { snapshotFrom, chanceProfile } from "@/lib/student-profile";
import { chanceFor, type Chance as FullChance } from "@/lib/admission-chance";
import { EXAMS, GRADE_SCALES, type NationalExam } from "@/lib/grades/convert";
import { programme, programmeKey } from "@/lib/programmes";
import { answersFrom, certTest, testScore } from "./onboarding-steps";
import { regionName } from "@/lib/region-name";
import { effectivePlan, onEarlyAccess } from "@/lib/plans";
import type { MessageKey } from "@/lib/i18n/messages";
import { useCollege } from "./provider";
import { useI18n } from "./i18n";
import { usePersonalize } from "./personalize-report";
import { UniversityLogo } from "./primitives";
import {
  groupLabel,
  groupOf,
  useHomeData,
  useWorkspaceSummary,
  type CollegeRow,
} from "./workspace-oneprep-overview";
import { Btn, Page, ProgressBar } from "./dash-ui";
import { UserAvatar, avatarOf } from "./user-avatar";

/** One answer on the profile: empty when not given yet; `step` opens that onboarding question. */
type Item = {
  id: string;
  label: string;
  value: ReactNode;
  filled: boolean;
  step: string;
};
type Section = {
  id: string;
  title: string;
  Icon: LucideIcon;
  step: string;
  items: Item[];
};

const monthLabel = (ym: string, lang: string) => {
  if (!/^\d{4}-\d{2}$/.test(ym)) return "";
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : lang, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ym + "-01T00:00:00Z"));
};

function Chips({ items }: { items: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <span key={x} className="dk-pill">
          {x}
        </span>
      ))}
    </span>
  );
}

/** The "Academic profile" section of /dashboard/profile (see profile-settings.tsx): who you are, what you bring and what you want, each part one tap from editing. */
export function AcademicProfile({
  previewColleges,
}: { previewColleges?: CollegeRow[] } = {}) {
  const s = useCollege();
  const { t, lang } = useI18n();
  const prefs = s.profile?.preferences;
  const snap = useMemo(() => snapshotFrom(prefs), [prefs]);
  const a = useMemo(() => answersFrom(prefs || {}, null), [prefs]);

  const ai = usePersonalize();
  const summary = useWorkspaceSummary();
  const live = useHomeData(
    summary?.tracker,
    summary?.today || new Date().toISOString().slice(0, 10),
  );
  const colleges = previewColleges ?? live.colleges;
  // Full requirement checks need a fully loaded university record (as on Home and Report).
  const fits = useMemo(() => {
    const cp = chanceProfile(snap);
    const out = new Map<string, FullChance>();
    for (const c of colleges) {
      const u = c.university as
        { requirements?: unknown; deadlines?: unknown } | undefined;
      if (u && Array.isArray(u.requirements) && Array.isArray(u.deadlines))
        out.set(c.id, chanceFor(cp, c.university as never));
    }
    return out;
  }, [colleges, snap]);
  // Show a requirement column only when the data has it for at least one university.
  const fitCols = {
    en: [...fits.values()].some((f) => f.english?.meets !== undefined),
    sat: [...fits.values()].some((f) => !!f.sat),
    budget: [...fits.values()].some((f) => f.overBudget !== undefined),
  };
  const sections = useMemo<Section[]>(() => {
    const exam = snap.exam ? EXAMS[snap.exam.id as NationalExam] : null;
    const scale = snap.grade ? GRADE_SCALES[snap.grade.scale] : null;
    const school = [
      a.school_name.trim() ||
        (a.school_type && t(("ob.school." + a.school_type) as MessageKey)),
      snap.school_class &&
        (snap.school_class === "done"
          ? t("ob.class.done")
          : t("ob.class.n", { n: snap.school_class })),
    ]
      .filter(Boolean)
      .join(" · ");
    const taken = snap.tests.filter((x) => x.status === "taken");
    const planned = snap.tests.filter((x) => x.status === "planned");
    const testText = (x: (typeof snap.tests)[number]) =>
      [
        certTest(x.id)?.label,
        testScore(x.id, x.score),
        x.date && monthLabel(x.date, lang),
      ]
        .filter(Boolean)
        .join(" · ");
    const majors = snap.majors.map((m) => {
      const p = programme(m);
      return p ? t(programmeKey(p) as MessageKey) : m;
    });
    const where = snap.dreams.map((c) => regionName(c, lang));
    const budget = snap.budget
      ? snap.budget >= 90000
        ? t("pf.budget.any")
        : "$" + snap.budget.toLocaleString("en") + t("pf.peryear")
      : "";
    const item = (
      id: string,
      label: string,
      value: ReactNode,
      filled: boolean,
      step: string,
    ): Item => ({ id, label, value, filled, step });
    return [
      {
        id: "academics",
        title: t("d3.pf.academics"),
        Icon: GraduationCap,
        step: "school",
        items: [
          item(
            "home",
            t("pf.home"),
            [snap.home && regionName(snap.home, lang), a.home_city.trim()]
              .filter(Boolean)
              .join(" · "),
            !!snap.home,
            "home",
          ),
          item("school", t("d3.pf.school"), school, !!a.school_type, "school"),
          item(
            "cert",
            t("d3.pf.cert"),
            a.certificate ? t(("ob.cert." + a.certificate) as MessageKey) : "",
            !!a.certificate,
            "cert",
          ),
          item(
            "grades",
            t("pf.grades"),
            snap.grade
              ? `${snap.grade.value}${scale?.max ? " / " + scale.max : ""} · ${t("pf.gpa", { gpa: snap.grade.gpa.toFixed(2) })}`
              : "",
            !!snap.grade,
            "gpa",
          ),
          ...(exam
            ? [
                item(
                  "exam",
                  exam.label,
                  snap.exam
                    ? `${snap.exam.score}${exam.max ? " / " + exam.max : ""}`
                    : "",
                  !!snap.exam,
                  "tests",
                ),
              ]
            : []),
        ],
      },
      {
        id: "tests",
        title: t("pf.tests"),
        Icon: NotebookPen,
        step: "tests",
        items: [
          item(
            "taken",
            t("d3.pf.taken"),
            taken.length ? <Chips items={taken.map(testText)} /> : "",
            taken.length > 0,
            "tests",
          ),
          item(
            "planned",
            t("d3.pf.planned"),
            planned.length ? <Chips items={planned.map(testText)} /> : "",
            planned.length > 0 || taken.length > 0,
            "tests",
          ),
        ],
      },
      {
        id: "beyond",
        title: t("d3.pf.beyond"),
        Icon: Trophy,
        step: "activities",
        items: [
          item(
            "activities",
            t("d3.pf.activities"),
            snap.activities.length ? (
              <ul className="grid gap-1">
                {snap.activities.slice(0, 4).map((x, i) => (
                  <li key={i} className="text-[14px] leading-snug">
                    {t(("ob.acttype." + x.type) as MessageKey)}
                    {(x.role.trim() || x.org.trim()) && (
                      <span className="text-muted-foreground">
                        {" "}
                        ·{" "}
                        {[x.role.trim(), x.org.trim()]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    )}
                  </li>
                ))}
                {snap.activities.length > 4 && (
                  <li className="text-[12.5px] text-muted-foreground">
                    {t("db.more_n", { n: snap.activities.length - 4 })}
                  </li>
                )}
              </ul>
            ) : (
              ""
            ),
            snap.activities.length > 0,
            "activities",
          ),
          item(
            "honours",
            t("d3.pf.honours"),
            snap.honours.length ? (
              <ul className="grid gap-1">
                {snap.honours.map((h, i) => (
                  <li key={i} className="text-[14px] leading-snug">
                    {h.title}
                    <span className="text-muted-foreground">
                      {" "}
                      · {t(("ob.level." + h.level) as MessageKey)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              ""
            ),
            snap.honours.length > 0,
            "honours",
          ),
        ],
      },
      {
        id: "goals",
        title: t("d3.pf.goals"),
        Icon: Target,
        step: "subjects",
        items: [
          item(
            "majors",
            t("pf.majors"),
            majors.length ? <Chips items={majors} /> : "",
            majors.length > 0,
            "subjects",
          ),
          item(
            "where",
            t("pf.where"),
            where.length ? <Chips items={where} /> : "",
            where.length > 0,
            "countries",
          ),
          item(
            "start",
            t("d3.pf.start"),
            snap.start_year ? String(snap.start_year) : "",
            !!snap.start_year,
            "year",
          ),
        ],
      },
      {
        id: "money",
        title: t("pf.budget"),
        Icon: Wallet,
        step: "budget",
        items: [
          item(
            "budget",
            t("d3.pf.per_year"),
            budget,
            !!snap.budget || snap.funding === "full",
            "budget",
          ),
          item(
            "funding",
            t("d3.pf.funding"),
            snap.funding ? t(("ob.funding." + snap.funding) as MessageKey) : "",
            !!snap.funding,
            "budget",
          ),
        ],
      },
    ];
  }, [snap, a, t, lang]);

  if (!s.profile) return null;

  const all = sections.flatMap((x) => x.items);
  const filled = all.filter((x) => x.filled).length;
  const pct = Math.round((filled / all.length) * 100);
  const missing = all.filter((x) => !x.filled);
  const name = s.profile.display_name?.trim() || a.name.trim() || "";
  const plan = effectivePlan(prefs);
  const early = onEarlyAccess(prefs);
  const majors = snap.majors.map((m) => {
    const p = programme(m);
    return p ? t(programmeKey(p) as MessageKey) : m;
  });
  const meta = [
    [a.home_city.trim(), snap.home && regionName(snap.home, lang)]
      .filter(Boolean)
      .join(", "),
    snap.start_year && t("d2.pf.start", { year: snap.start_year }),
  ].filter(Boolean);
  const scale = snap.grade ? GRADE_SCALES[snap.grade.scale] : null;
  const exam = snap.exam ? EXAMS[snap.exam.id as NationalExam] : null;
  const byId = (id: string) =>
    sections.flatMap((x) => x.items).find((x) => x.id === id);

  /* The numbers a university reads first: grades, each test, the national exam and the budget. */
  const glance: {
    key: string;
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    muted?: boolean;
  }[] = [];
  if (snap.grade)
    glance.push({
      key: "gpa",
      label: t("pf.grades"),
      value: snap.grade.gpa.toFixed(2),
      sub: `${snap.grade.value}${scale?.max ? " / " + scale.max : ""}`,
    });
  for (const x of snap.tests) {
    const label = certTest(x.id)?.label || x.id;
    glance.push({
      key: "t-" + x.id + x.status,
      label,
      value: testScore(x.id, x.score) || "—",
      sub: [
        x.status === "planned" && t("d3.pf.planned"),
        x.date && monthLabel(x.date, lang),
      ]
        .filter(Boolean)
        .join(" · "),
      muted: x.status === "planned",
    });
  }
  if (exam && snap.exam)
    glance.push({
      key: "exam",
      label: exam.label,
      value: snap.exam.score,
      sub: exam.max ? "/ " + exam.max : undefined,
    });
  if (snap.budget || snap.funding)
    glance.push({
      key: "budget",
      label: t("pf.budget"),
      value: snap.budget
        ? snap.budget >= 90000
          ? "∞"
          : "$" + Math.round(snap.budget / 1000) + "k"
        : "—",
    });

  const editLink = (step: string, label: string) => (
    <Link
      href={"/dashboard/welcome?step=" + step}
      className="pf2-edit"
      aria-label={t("d3.pf.edit_section", { section: label })}
    >
      {t("d3.pf.edit")}
    </Link>
  );
  const row = (id: string) => {
    const x = byId(id);
    if (!x) return null;
    return (
      <div key={id} className="pf2-row">
        <dt>{x.label}</dt>
        <dd>
          {x.filled && x.value ? (
            x.value
          ) : (
            <Link
              href={"/dashboard/welcome?step=" + x.step}
              className="pf2-add"
            >
              <Plus aria-hidden="true" /> {t("d2.pf.add")}
            </Link>
          )}
        </dd>
      </div>
    );
  };

  return (
    <Page className="pf2">
      <header className="pf2-head">
        <UserAvatar {...avatarOf(s.profile, s.user)} size={64} />
        <div className="pf2-id">
          <h1>{name || t("pf.title")}</h1>
          <p>
            {meta.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </p>
        </div>
        <div className="pf2-actions">
          <Link href="/dashboard/plans" className="pf2-plan">
            <Crown aria-hidden="true" />{" "}
            {t(`d2.plan.${plan}.name` as MessageKey)}
            {early && <span>· {t("d2.pf.early")}</span>}
          </Link>
          <Btn variant="primary" href="/dashboard/welcome">
            <PenLine aria-hidden="true" /> {t("pf.edit")}
          </Btn>
        </div>
      </header>

      {glance.length > 0 && (
        <dl className="pf2-glance">
          {glance.map((g) => (
            <div key={g.key} className={g.muted ? "is-muted" : undefined}>
              <dt>{g.label}</dt>
              <dd className="dk-num">{g.value}</dd>
              {g.sub && <dd className="pf2-sub">{g.sub}</dd>}
            </div>
          ))}
        </dl>
      )}

      <div className="pf2-body">
        <div className="pf2-main">
          <section className="pf2-sec" aria-labelledby="pf2-acad">
            <div className="pf2-sec-head">
              <h2 id="pf2-acad">{t("d3.pf.academics")}</h2>
              {editLink("school", t("d3.pf.academics"))}
            </div>
            <dl className="pf2-rows">{["school", "cert", "exam"].map(row)}</dl>
          </section>

          <section className="pf2-sec" aria-labelledby="pf2-act">
            <div className="pf2-sec-head">
              <h2 id="pf2-act">{t("d3.pf.activities")}</h2>
              {editLink("activities", t("d3.pf.activities"))}
            </div>
            {snap.activities.length ? (
              <ol className="pf2-acts">
                {snap.activities.map((x, i) => (
                  <li key={i}>
                    <span className="pf2-act-n dk-num">{i + 1}</span>
                    <div className="pf2-grow">
                      <strong>
                        {[x.role.trim(), x.org.trim()]
                          .filter(Boolean)
                          .join(", ") ||
                          t(("ob.acttype." + x.type) as MessageKey)}
                      </strong>
                    </div>
                    {(x.hours || x.weeks) && (
                      <span className="pf2-time dk-num">
                        {[
                          x.hours && t("pf2.hours", { h: x.hours }),
                          x.weeks && t("pf2.weeks", { w: x.weeks }),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <Link
                href="/dashboard/welcome?step=activities"
                className="pf2-add"
              >
                <Plus aria-hidden="true" /> {t("d2.pf.add")}
              </Link>
            )}
          </section>

          <section className="pf2-sec" aria-labelledby="pf2-hon">
            <div className="pf2-sec-head">
              <h2 id="pf2-hon">{t("d3.pf.honours")}</h2>
              {editLink("honours", t("d3.pf.honours"))}
            </div>
            {snap.honours.length ? (
              <ul className="pf2-honours">
                {snap.honours.map((h, i) => (
                  <li key={i}>
                    <span
                      className={"pf2-medal is-" + (h.medal || "none")}
                      aria-hidden="true"
                    />
                    <span className="pf2-grow">{h.title}</span>
                    <span className="pf2-level">
                      {t(("ob.level." + h.level) as MessageKey)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Link href="/dashboard/welcome?step=honours" className="pf2-add">
                <Plus aria-hidden="true" /> {t("d2.pf.add")}
              </Link>
            )}
          </section>

          {colleges.length > 0 && (
            <section className="pf2-sec" aria-labelledby="pf2-fit">
              <div className="pf2-sec-head">
                <h2 id="pf2-fit">{t("pf2.fit")}</h2>
                <Link
                  href="/dashboard?section=Universities"
                  className="pf2-edit"
                >
                  {t("d5.all")}
                </Link>
              </div>
              <table className="pf2-fit">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">{t("d5.colleges")}</span>
                    </th>
                    {fitCols.en && <th scope="col">{t("pf2.fit.english")}</th>}
                    {fitCols.sat && <th scope="col">SAT</th>}
                    {fitCols.budget && <th scope="col">{t("pf.budget")}</th>}
                    <th scope="col">{t("d6.readiness")}</th>
                  </tr>
                </thead>
                <tbody>
                  {colleges.map((c) => {
                    const g = groupOf(c);
                    const f = fits.get(c.id);
                    const en = f?.english;
                    const sat = f?.sat;
                    const mark = (ok: boolean | undefined, title: string) =>
                      ok === undefined ? (
                        <span className="pf2-mark" title={title}>
                          <Minus aria-hidden="true" />
                          <span className="sr-only">{title}</span>
                        </span>
                      ) : (
                        <span
                          className={"pf2-mark " + (ok ? "is-ok" : "is-no")}
                          title={title}
                        >
                          {ok ? (
                            <Check aria-hidden="true" />
                          ) : (
                            <X aria-hidden="true" />
                          )}
                          <span className="sr-only">{title}</span>
                        </span>
                      );
                    return (
                      <tr key={c.id}>
                        <th scope="row">
                          <Link href={c.href} className="pf2-fit-name">
                            {c.university && (
                              <UniversityLogo
                                university={c.university}
                                size="sm"
                              />
                            )}
                            <span>{c.name}</span>
                            {g && (
                              <span className={"pf2-tier is-" + g}>
                                {groupLabel(t, g)}
                              </span>
                            )}
                          </Link>
                        </th>
                        {fitCols.en && (
                          <td>
                            {mark(
                              en?.meets,
                              en ? `${en.test} ${en.minimum}` : "—",
                            )}
                          </td>
                        )}
                        {fitCols.sat && (
                          <td>
                            {sat ? (
                              <span
                                className={"pf2-band is-" + sat.band}
                                title={`${sat.low}–${sat.high}`}
                              >
                                {t(("pf2.band." + sat.band) as MessageKey)}
                              </span>
                            ) : (
                              mark(undefined, "—")
                            )}
                          </td>
                        )}
                        {fitCols.budget && (
                          <td>
                            {mark(
                              f?.overBudget === undefined
                                ? undefined
                                : !f.overBudget,
                              f?.tuition
                                ? "$" + Math.round(f.tuition / 1000) + "k"
                                : "—",
                            )}
                          </td>
                        )}
                        <td className="pf2-ready">
                          <span className="pf2-ready-bar" aria-hidden="true">
                            <i
                              style={{
                                width:
                                  Math.round(
                                    (c.ready.done /
                                      Math.max(1, c.ready.total)) *
                                      100,
                                  ) + "%",
                              }}
                              className={
                                c.ready.done >= c.ready.total
                                  ? "is-full"
                                  : undefined
                              }
                            />
                          </span>
                          <span className="dk-num">
                            {c.ready.done}/{c.ready.total}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <aside className="pf2-side">
          <section className="pf2-card" aria-labelledby="pf2-str">
            <div className="pf2-sec-head">
              <h2 id="pf2-str">{t("d2.pf.strength")}</h2>
              <span className="pf2-pct dk-num">{pct}%</span>
            </div>
            <ProgressBar
              value={pct}
              label={t("d2.pf.strength") + ": " + pct + "%"}
            />
            <ul className="pf2-parts">
              {sections.map((sec) => {
                const done = sec.items.filter((x) => x.filled).length;
                const p = Math.round(
                  (done / Math.max(1, sec.items.length)) * 100,
                );
                return (
                  <li key={sec.id}>
                    <sec.Icon aria-hidden="true" />
                    <span className="pf2-grow">{sec.title}</span>
                    <span
                      className="pf2-dots"
                      aria-label={done + "/" + sec.items.length}
                    >
                      {sec.items.map((x) => (
                        <i
                          key={x.id}
                          className={x.filled ? "is-on" : undefined}
                        />
                      ))}
                    </span>
                    <span className="pf2-part-n dk-num">{p}%</span>
                  </li>
                );
              })}
            </ul>
            {missing.length ? (
              <ul className="pf2-missing">
                {missing.slice(0, 4).map((x) => (
                  <li key={x.id}>
                    <Link href={"/dashboard/welcome?step=" + x.step}>
                      <Plus aria-hidden="true" /> {x.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="pf2-card pf2-ai" aria-labelledby="pf2-ai">
            <div className="pf2-sec-head">
              <h2 id="pf2-ai">
                <Sparkles aria-hidden="true" /> {t("pf2.ai")}
              </h2>
              {ai.report && (
                <button
                  type="button"
                  className="pf2-edit"
                  onClick={() => void ai.run()}
                  disabled={ai.busy}
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={ai.busy ? "is-spin" : undefined}
                  />{" "}
                  {ai.busy ? t("pf.pz.busy") : t("pf.pz.refresh")}
                </button>
              )}
            </div>
            {ai.report ? (
              <>
                <p className="pf2-note">{ai.report.summary}</p>
                {ai.report.gaps.length > 0 && (
                  <ul className="pf2-gaps">
                    {ai.report.gaps.slice(0, 4).map((g) => (
                      <li key={g}>
                        <AlertCircle aria-hidden="true" /> {g}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <p className="pf2-note">{t("pf2.ai.empty")}</p>
                <button
                  type="button"
                  className="pf2-ai-btn"
                  onClick={() => void ai.run()}
                  disabled={ai.busy}
                >
                  <Sparkles aria-hidden="true" />{" "}
                  {ai.busy ? t("pf.pz.busy") : t("pf2.ai.go")}
                </button>
              </>
            )}
            {ai.error && <p className="pf2-err">{ai.error}</p>}
          </section>

          <section className="pf2-card" aria-labelledby="pf2-goals">
            <div className="pf2-sec-head">
              <h2 id="pf2-goals">{t("d3.pf.goals")}</h2>
              {editLink("subjects", t("d3.pf.goals"))}
            </div>
            <dl className="pf2-goals">
              <div>
                <dt>{t("pf.majors")}</dt>
                <dd>{majors.length ? <Chips items={majors} /> : "—"}</dd>
              </div>
              <div>
                <dt>{t("pf.where")}</dt>
                <dd>
                  {snap.dreams.length ? (
                    <span className="pf2-flags">
                      {snap.dreams.map((c) => (
                        <span key={c}>
                          <span aria-hidden="true">{flagOf(c)}</span>{" "}
                          {regionName(c, lang)}
                        </span>
                      ))}
                    </span>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </Page>
  );
}

/** Kept for the older preview harness. */
export const ProfilePage = AcademicProfile;
