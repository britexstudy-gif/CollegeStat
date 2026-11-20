"use client";
/* Imkoniyatlar (Nov 19 v2): a real application simulation. Pick one university,
 * fill its application in the style of the portal it really uses (Common App,
 * UCAS, uni-assist, Studielink or the university's own form; lib/application-platforms),
 * submit, then open a practice decision letter built from chanceFor. */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RotateCcw, Search } from "lucide-react";
import { countryName, type University } from "@/lib/domain";
import { searchCatalogue, universitiesByIds, universityBySlug } from "@/lib/supabase/catalogue";
import { detectPlatform, type PlatformData } from "@/lib/application-platforms";
import { chanceFor, type Chance } from "@/lib/admission-chance";
import { chanceProfile, snapshotFrom } from "@/lib/student-profile";
import type { MessageKey } from "@/lib/i18n/messages";
import rawData from "./application-practice/platform-data.json";
import { Simulator } from "./application-practice/simulator";
import { practiceProfile } from "./application-practice/application-practice";
import { sectionsFor, seedChoices, type FormContext, type Values } from "./application-practice/forms";
import { prefillValues } from "./application-practice/prefill";
import { UniversityLogo } from "./primitives";
import { Mascot } from "./mascot";
import { useCollege } from "./provider";
import { useI18n } from "./i18n";
import { localeOf } from "@/lib/dates";
import "./apply-sim.css";

const data = rawData as unknown as PlatformData;
const SUBMITTED = "review.submitted";
const KEY = "cs-apply-sim:";
type Outcome = "admitted" | "waitlisted" | "denied";

const load = (id: string): Values => {
  try {
    return JSON.parse(localStorage.getItem(KEY + id) || "{}") as Values;
  } catch {
    return {};
  }
};

export function ApplySim() {
  const { t } = useI18n();
  const college = useCollege();
  const [uni, setUni] = useState<University | null>(null);
  const [values, setValuesState] = useState<Values>({});
  const [section, setSection] = useState("");
  const [letter, setLetter] = useState<Outcome | null>(null);
  const [chance, setChance] = useState<Chance | null>(null);

  const match = useMemo(() => (uni ? detectPlatform(uni, data) : null), [uni]);
  const ctx = useMemo<FormContext | null>(
    () =>
      uni && match
        ? {
            kind: match.platform.kind,
            platform: match.platform.id,
            universities: [{ id: uni.id, name: uni.name, country_code: uni.country_code }],
            commonApp: data.common_app,
            vpd: !!match.vpd,
          }
        : null,
    [uni, match],
  );
  const profile = useMemo(
    () => (college.profile ? practiceProfile(college.profile.preferences, college.profile.display_name, college.user?.email) : null),
    [college.profile, college.user?.email],
  );

  const open = (u: University) => {
    const m = detectPlatform(u, data);
    let v = load(u.id);
    const c: FormContext = { kind: m.platform.kind, platform: m.platform.id, universities: [{ id: u.id, name: u.name, country_code: u.country_code }], commonApp: data.common_app, vpd: !!m.vpd };
    if (m.platform.id === "ucas") v = seedChoices(v, c.universities);
    if (profile) v = { ...prefillValues(sectionsFor(c), profile, v), ...v };
    setValuesState(v);
    setSection("");
    setLetter(null);
    setUni(u);
    window.scrollTo({ top: 0 });
  };
  const setValues = (update: (v: Values) => Values) =>
    setValuesState((prev) => {
      const next = update(prev);
      try {
        if (uni) localStorage.setItem(KEY + uni.id, JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  const submitted = values[SUBMITTED] === true;

  const decide = async () => {
    if (!uni) return;
    // The full record carries admissions, requirements and costs.
    const full = (uni.slug && (await universityBySlug(uni.slug).catch(() => undefined))) || uni;
    const c = chanceFor(chanceProfile(snapshotFrom(college.profile?.preferences)), full);
    const base = c.category === "likely" ? 0.82 : c.category === "target" ? 0.5 : c.category === "reach" ? 0.16 : 0.45;
    const p = c.rate != null ? Math.min(0.95, (base + c.rate / 100) / 2) : base;
    const roll = Math.random();
    setChance(c);
    setLetter(roll < p ? "admitted" : roll < p + (1 - p) * 0.25 ? "waitlisted" : "denied");
    setUni(full);
    window.scrollTo({ top: 0 });
  };

  if (!uni || !ctx || !match) return <Pick onPick={open} />;

  if (letter) return <Letter uni={uni} outcome={letter} chance={chance} name={profile?.name || ""} onAgain={() => setUni(null)} onBack={() => setLetter(null)} />;

  const platform = match.platform.id === "direct" ? t("app.sim.platform.direct") : match.platform.name;
  return (
    <div className={"as-portal is-" + match.platform.id}>
      <header className="as-bar">
        <button type="button" className="as-back" onClick={() => setUni(null)} aria-label={t("as.back")}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <strong className="as-brand">{platform}</strong>
        <span className="as-tag">{t("as.practice")}</span>
        <span className="as-who">
          <UniversityLogo university={uni} size="sm" />
          <span>{uni.name}</span>
        </span>
      </header>
      <div className="as-body" id="sim-top">
        <Simulator ctx={ctx} values={values} setValues={setValues} section={section} setSection={setSection} title={uni.name} />
        {submitted && (
          <div className="as-decide">
            <p>{t("as.decide.text")}</p>
            <button type="button" onClick={() => void decide()}>
              {t("as.decide.go")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Pick({ onPick }: { onPick: (u: University) => void }) {
  const { t } = useI18n();
  const college = useCollege();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<University[]>([]);
  const [saved, setSaved] = useState<University[]>([]);
  const savedKey = college.saved.slice(0, 8).join(",");
  useEffect(() => {
    if (!savedKey) return;
    const ctl = new AbortController();
    universitiesByIds(savedKey.split(","), ctl.signal)
      .then(setSaved)
      .catch(() => {});
    return () => ctl.abort();
  }, [savedKey]);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      searchCatalogue(query, ctl.signal)
        .then((r) => setRows((r || []).slice(0, 8)))
        .catch(() => {});
    }, 220);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q]);
  const list = q.trim().length >= 2 ? rows : saved;
  return (
    <div className="as-pick">
      <div className="as-coach">
        <Mascot size={64} />
        <div className="as-bubble">
          <h1>{t("as.pick.title")}</h1>
          <p>{t("as.pick.hint")}</p>
        </div>
      </div>
      <label className="as-search">
        <Search aria-hidden="true" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("as.pick.ph")} aria-label={t("as.pick.ph")} />
      </label>
      {!q.trim() && saved.length > 0 && <h2 className="as-label">{t("as.pick.saved")}</h2>}
      <ul className="as-results">
        {list.map((u) => {
          const m = detectPlatform(u, data);
          return (
            <li key={u.id}>
              <button type="button" onClick={() => onPick(u)}>
                <UniversityLogo university={u} size="sm" />
                <span className="as-r-main">
                  <strong>{u.name}</strong>
                  <small>{[u.city, countryName(u.country_code)].filter(Boolean).join(", ")}</small>
                </span>
                <span className="as-r-plat">{m.platform.id === "direct" ? t("app.sim.platform.direct") : m.platform.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Letter({ uni, outcome, chance, name, onAgain, onBack }: { uni: University; outcome: Outcome; chance: Chance | null; name: string; onAgain: () => void; onBack: () => void }) {
  const { t, lang } = useI18n();
  const today = new Date().toLocaleDateString(localeOf(lang), { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="as-letter-wrap">
      <article className={"as-letter is-" + outcome}>
        <header>
          <UniversityLogo university={uni} size="lg" />
          <div>
            <strong>{uni.name}</strong>
            <small>{t("as.l.office")}</small>
          </div>
        </header>
        <p className="as-l-date">{today}</p>
        <p>{t("as.l.dear", { name: name || t("as.l.applicant") })}</p>
        <h1>{t(("as.l." + outcome + ".title") as MessageKey)}</h1>
        <p>{t(("as.l." + outcome + ".text") as MessageKey, { uni: uni.name })}</p>
        <p className="as-l-sign">{t("as.l.sign")}</p>
      </article>
      {chance && (
        <section className="as-why">
          <h2>{t("as.why.title")}</h2>
          <ul>
            <li>{t(("as.why.band." + chance.category) as MessageKey)}</li>
            {chance.rate != null && <li>{t("as.why.rate", { n: Math.round(chance.rate) })}</li>}
            {chance.sat && <li>{t(("as.why.sat." + chance.sat.band) as MessageKey, { low: chance.sat.low, high: chance.sat.high })}</li>}
            {chance.english && chance.english.meets != null && (
              <li>{t(chance.english.meets ? "as.why.eng.ok" : "as.why.eng.low", { test: chance.english.test, n: chance.english.minimum })}</li>
            )}
            {chance.overBudget && <li>{t("as.why.budget", { n: Math.round((chance.tuition || 0) / 1000) })}</li>}
          </ul>
        </section>
      )}
      <p className="as-note">{t("as.l.note")}</p>
      <div className="as-actions">
        <button type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" /> {t("as.l.review")}
        </button>
        <button type="button" className="is-primary" onClick={onAgain}>
          <RotateCcw aria-hidden="true" /> {t("as.l.again")}
        </button>
      </div>
    </div>
  );
}
