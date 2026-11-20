"use client";
/* Home, AI-driven parts (Nov 18): ask the AI from Home, the universities the AI picked for this
 * student, and open scholarships the student can apply to. All read from saved data; nothing
 * here is generated on page load, so Home stays fast. */
import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { cn } from "@/lib/utils";
import { useCollege } from "./provider";
import { useI18n } from "./i18n";
import { UniversityLogo } from "./primitives";
import { AIMark } from "./ai-mark";
import { flagOf } from "./scholarship-format";
import { readPersonalization, type SavedPersonalization } from "@/lib/personalize-ai";
import { snapshotFrom } from "@/lib/student-profile";
import { deadlineInfo, eligibleFor, type Scholarship } from "@/lib/scholarships-data";
import { daysUntil } from "@/lib/date-label";
import { groupLabel } from "./workspace-oneprep-overview";
import type { University } from "@/lib/domain";
import { CONSENT_EVENT, clearRecent, readRecent } from "@/lib/consent";
import "./home-foryou.css";

/** One line to ask the AI anything; opens the assistant with the question filled in. */
export function AskBar() {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const chips = [t("d7.ask.c1"), t("d7.ask.c2"), t("d7.ask.c3")];
  const go = (text: string) => router.push("/dashboard/assistant?ask=" + encodeURIComponent(text.trim()));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) go(q);
  };
  return (
    <section className="fy-ask" aria-label={t("d7.ask.label")}>
      <form onSubmit={submit}>
        <AIMark size={20} className="fy-ask-mark" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("d7.ask.ph")} aria-label={t("d7.ask.label")} maxLength={400} />
        <button type="submit" disabled={!q.trim()} aria-label={t("d7.ask.go")}>
          <ArrowRight aria-hidden="true" />
        </button>
      </form>
      <div className="fy-chips">
        {chips.map((c) => (
          <button key={c} type="button" onClick={() => go(c)}>
            {c}
          </button>
        ))}
      </div>
    </section>
  );
}


/** Recently viewed slugs; always empty unless the student allowed personalization. */
function useRecent(): string[] {
  const raw = useSyncExternalStore(
    (cb) => {
      window.addEventListener(CONSENT_EVENT, cb);
      return () => window.removeEventListener(CONSENT_EVENT, cb);
    },
    () => readRecent().join(","),
    () => "",
  );
  return useMemo(() => (raw ? raw.split(",") : []), [raw]);
}

/** A quiet row of the universities this student opened lately (on this device, with consent). */
export function RecentlyViewed() {
  const { t } = useI18n();
  const slugs = useRecent().slice(0, 6);
  const key = slugs.join(",");
  const [rows, setRows] = useState<University[]>([]);
  useEffect(() => {
    if (!key) {
      setRows([]);
      return;
    }
    let alive = true;
    void import("@/lib/supabase/catalogue")
      .then(({ universitiesBySlugs }) => universitiesBySlugs(key.split(",")))
      .then((r) => alive && setRows(key.split(",").map((sl) => r.find((u) => u.slug === sl)).filter((u): u is University => !!u)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key]);
  if (!rows.length) return null;
  return (
    <section className="fy-recent" aria-labelledby="fy-rv">
      <div className="fy-recent-head">
        <h2 id="fy-rv">{t("rv.title")}</h2>
        <span>{t("rv.hint")}</span>
        <button type="button" onClick={() => clearRecent()}>
          {t("rv.clear")}
        </button>
      </div>
      <ul>
        {rows.map((u) => (
          <li key={u.slug}>
            <Link href={"/dashboard/university/" + u.slug} className="fy-recent-chip">
              <UniversityLogo university={u} size="sm" />
              <span>{u.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The AI's picks for this student (saved with the AI summary), reach to safety. */
export function AIRecs({ saved, preview }: { saved?: string[]; preview?: SavedPersonalization }) {
  const s = useCollege();
  const { t } = useI18n();
  const ai = useMemo(() => preview ?? readPersonalization(s.profile?.preferences), [preview, s.profile]);
  const savedSlugs = new Set(saved || []);
  // With consent, countries the student has been browsing float to the top of the AI's picks.
  const recent = useRecent();
  const [seenCountries, setSeenCountries] = useState<string[]>([]);
  const recentKey = recent.slice(0, 8).join(",");
  useEffect(() => {
    if (!recentKey) {
      setSeenCountries([]);
      return;
    }
    let alive = true;
    void import("@/lib/supabase/catalogue")
      .then(({ universitiesBySlugs }) => universitiesBySlugs(recentKey.split(",")))
      .then((rows) => alive && setSeenCountries(rows.map((u) => u.country_code)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [recentKey]);
  const boost = (u: { country_code: string }) => (seenCountries.includes(u.country_code) ? 0 : 1);
  const picks = (ai?.universities || [])
    .filter((u) => !savedSlugs.has(u.slug) && !savedSlugs.has(u.name.toLowerCase()))
    .map((u, i) => ({ u, i }))
    .sort((a, b) => boost(a.u) - boost(b.u) || a.i - b.i)
    .map(({ u }) => u)
    .slice(0, 6);
  // Full records for the logos; until (or unless) they arrive, the monogram stands in.
  const key = picks.map((u) => u.slug).join(",");
  const [full, setFull] = useState<Record<string, University>>({});
  useEffect(() => {
    if (!key) return;
    let alive = true;
    void import("@/lib/supabase/catalogue")
      .then(({ universitiesBySlugs }) => universitiesBySlugs(key.split(",")))
      .then((rows) => alive && setFull(Object.fromEntries(rows.map((u) => [u.slug, u]))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key]);
  return (
    <section className="h6-card fy-card" aria-labelledby="fy-recs">
      <div className="h6-card-head">
        <h2 id="fy-recs">
          <Sparkles aria-hidden="true" className="fy-spark" /> {t("d7.recs")}
        </h2>
        <Link href="/dashboard/universities" className="h6-link">
          {t("d5.all")} <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
      {picks.length ? (
        <ul className="fy-recs">
          {picks.map((u) => (
            <li key={u.slug}>
              <Link href={"/dashboard/university/" + u.slug} className="fy-rec">
                <UniversityLogo university={full[u.slug] ?? ({ id: "", slug: u.slug, name: u.name, country_code: u.country_code, website: null, logo_url: null } as never)} size="sm" />
                <span className="fy-grow">
                  <strong>{u.name}</strong>
                  <span>{u.reason}</span>
                </span>
                <span className={cn("fy-tier", "is-" + u.tier)}>{groupLabel(t, u.tier === "safety" ? "likely" : u.tier)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="fy-empty">
          <p>{t("d7.recs.empty")}</p>
          <Link href="/dashboard/report" className="fy-btn">
            <Sparkles aria-hidden="true" /> {t("d7.recs.cta")}
          </Link>
        </div>
      )}
    </section>
  );
}

/** Open scholarships the student is eligible for (by home country), soonest deadline first. */
export function ScholarshipsForYou({ today }: { today: string }) {
  const s = useCollege();
  const { t } = useI18n();
  const home = useMemo(() => snapshotFrom(s.profile?.preferences).home || "UZ", [s.profile]);
  const [all, setAll] = useState<Scholarship[] | null>(null);
  useEffect(() => {
    let alive = true;
    void import("@/lib/scholarships-load").then(({ allScholarships }) => alive && setAll(allScholarships));
    return () => {
      alive = false;
    };
  }, []);
  const list = useMemo(
    () =>
      (all || [])
        .filter((x) => eligibleFor(x, home) && x.undergrad)
        .map((x) => ({ x, info: deadlineInfo(x, today) }))
        .filter(({ info }) => info.state === "open" && info.date)
        .sort((a, b) => a.info.date!.localeCompare(b.info.date!))
        .slice(0, 4),
    [all, home, today],
  );
  return (
    <section className="h6-card fy-card" aria-labelledby="fy-sch">
      <div className="h6-card-head">
        <h2 id="fy-sch">{t("d7.sch")}</h2>
        <Link href="/dashboard/library/scholarships" className="h6-link">
          {t("d5.all")} <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
      {all === null ? (
        <div className="fy-skel" aria-busy="true" />
      ) : list.length ? (
        <ul className="fy-sch">
          {list.map(({ x, info }) => {
            const d = daysUntil(info.date!, today);
            return (
              <li key={x.slug}>
                <Link href={"/dashboard/library/scholarship/" + x.slug} className="fy-sch-row">
                  <span className="fy-flag" aria-hidden="true">
                    {flagOf(x.browseCountry || x.country || "")}
                  </span>
                  <span className="fy-grow">
                    <strong>{x.name}</strong>
                    <span>{x.funding === "full" ? t("db.funding.full") : t("db.funding.partial")}</span>
                  </span>
                  <span className={cn("fy-days dk-num", d <= 21 && "is-soon")}>{d <= 0 ? t("db.today") : t("d5.in", { n: d })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="fy-muted">{t("d7.sch.none")}</p>
      )}
    </section>
  );
}
