"use client";
/* Hisobot / Report (Nov 19): the whole report is one AI-written document about the student,
 * laid out like a quiet Notion page. It is written only from the student's own data (profile,
 * saved list, catalogue facts), kept in this browser with a timestamp, and can be downloaded
 * as a PDF (print stylesheet) or as Markdown. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown, FileText, RefreshCw, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCollege } from "./provider";
import { useI18n } from "./i18n";
import { Mascot } from "./mascot";
import { groupOf, useHomeData, useWorkspaceSummary, type HomeData } from "./workspace-oneprep-overview";
import { getSupabase } from "@/lib/supabase/client";
import { snapshotFrom, chanceProfile, hasProfile } from "@/lib/student-profile";
import { chanceFor } from "@/lib/admission-chance";
import { personalizeRequest } from "@/lib/personalize-ai";
import { absoluteDate } from "@/lib/date-label";
import { validPlanDate } from "@/lib/workspace-planner";
import { readReportDoc, reportMarkdown, REPORT_SECTIONS, type ReportDoc, type ReportInput } from "@/lib/report-ai";
import type { ChecklistItem } from "@/services/workspace";
import "./report-v2.css";

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const TIER = { reach: "reach", target: "target", likely: "safety" } as const;

type Stored = { doc: ReportDoc; sig: string };
const storeKey = (id: string) => "cs-report-ai:v1:" + id;
const readStored = (id: string): Stored | null => {
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(id)) || "null") as Partial<Stored> | null;
    const doc = readReportDoc(v?.doc);
    return doc && typeof v?.sig === "string" ? { doc, sig: v.sig } : null;
  } catch {
    return null;
  }
};

async function requestReport(body: ReportInput | unknown, fallback: string): Promise<ReportDoc> {
  const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new Error(fallback);
  const res = await fetch("/api/student-ai/report", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (Partial<ReportDoc> & { error?: unknown }) | null;
  const doc = readReportDoc(data);
  if (!res.ok || !doc) throw new Error(res.status === 429 && typeof data?.error === "string" ? data.error : fallback);
  return doc;
}

export type ReportPreview = { home: HomeData; tasks: ChecklistItem[]; today: string; doc?: ReportDoc | null; busy?: boolean };

export function ReportV2({ preview }: { preview?: ReportPreview }) {
  const summary = useWorkspaceSummary();
  const today = preview?.today ?? summary?.today ?? localToday();
  const live = useHomeData(summary?.tracker, today);
  const home = preview?.home ?? live;
  const summaryTasks = summary?.tasks;
  const tasks = useMemo(() => preview?.tasks ?? summaryTasks ?? [], [preview, summaryTasks]);
  const s = useCollege();
  const { t, lang } = useI18n();
  const snap = useMemo(() => snapshotFrom(s.profile?.preferences), [s.profile]);
  const name = (s.profile?.display_name || "").trim().split(" ")[0];
  const { colleges } = home;
  const owner = s.user?.id || (preview ? "preview" : "");

  const sig = useMemo(() => colleges.map((c) => c.id).sort().join(","), [colleges]);
  const [stored, setStored] = useState<Stored | null>(preview?.doc ? { doc: preview.doc, sig } : null);
  const [busy, setBusy] = useState(!!preview?.busy);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!preview && owner) setStored(readStored(owner));
  }, [owner, preview]);

  const generate = useCallback(async () => {
    if (busy || !s.user || preview) return;
    setBusy(true);
    setError("");
    const scope = s.accountScope.capture();
    try {
      const cp = chanceProfile(snap);
      const req = personalizeRequest(snap, lang);
      const body: ReportInput = {
        language: lang as ReportInput["language"],
        today,
        profile: req.profile as ReportInput["profile"],
        universities: colleges.slice(0, 30).map((c) => {
          const u = c.university as (typeof c.university & { requirements?: unknown; deadlines?: unknown }) | undefined;
          const full = !!u && Array.isArray(u.requirements) && Array.isArray(u.deadlines);
          const ch = full ? chanceFor(cp, u as never) : null;
          const ranks = (u?.rankings || []).filter((r) => ["qs", "the", "arwu"].includes(r.provider) && Number.isFinite(r.rank) && r.rank > 0).map((r) => r.rank);
          const g = groupOf(c);
          return {
            slug: u?.slug || c.id,
            name: c.name,
            country: u?.country_code || "",
            ...(c.status ? { status: c.status } : {}),
            ...(c.deadline ? { deadline: c.deadline } : {}),
            readiness: `${c.ready.done}/${c.ready.total}`,
            ...(ranks.length ? { world_rank: Math.min(...ranks) } : {}),
            ...(ch?.rate != null ? { admit_rate_pct: Math.round(ch.rate) } : {}),
            ...(ch?.tuition != null ? { tuition_usd_year: Math.round(ch.tuition) } : {}),
            ...(ch?.sat ? { sat_middle_50: `${ch.sat.low}–${ch.sat.high}` } : {}),
            ...(ch?.english ? { english_min: `${ch.english.test} ${ch.english.minimum}` } : {}),
            our_estimate: g ? TIER[g] : ("unknown" as const),
            ...(ch?.overBudget ? { over_budget: true } : {}),
          };
        }),
        tasks: tasks
          .filter((x) => !x.done)
          .slice(0, 12)
          .map((x) => ({ title: x.title.slice(0, 120), ...(x.due_at && validPlanDate(x.due_at) ? { due: x.due_at } : {}) })),
      };
      const doc = await requestReport(body, t("r3.error"));
      if (!s.accountScope.isCurrent(scope)) return;
      const next = { doc, sig };
      setStored(next);
      try {
        localStorage.setItem(storeKey(owner), JSON.stringify(next));
      } catch {
        // Still shown; just not kept for next time.
      }
    } catch (e) {
      if (s.accountScope.isCurrent(scope)) setError(e instanceof Error ? e.message : t("r3.error"));
    } finally {
      setBusy(false);
    }
  }, [busy, s.user, s.accountScope, preview, snap, lang, today, colleges, tasks, sig, owner, t]);

  const doc = stored?.doc ?? null;
  const title = name ? t("r3.title_for", { name }) : t("r3.title");
  const meta = doc ? t("r3.meta", { date: absoluteDate(doc.created_at.slice(0, 10), lang), n: doc.based_on }) : "";
  const stale = !!doc && !!stored && stored.sig !== sig && !busy;
  const ready = colleges.length > 0 && (preview ? true : hasProfile(snap));
  const fileName = `${t("r3.file")}-${(doc?.created_at || today).slice(0, 10)}`;

  const downloadMd = () => {
    if (!doc) return;
    const blob = new Blob([reportMarkdown(doc, title, meta)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName + ".md" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const toolbar = (
    <div className="r3-tools" role="toolbar">
      {doc && !busy && (
        <>
          <button type="button" onClick={() => window.print()}>
            <FileDown aria-hidden="true" /> {t("r3.pdf")}
          </button>
          <button type="button" onClick={downloadMd}>
            <FileText aria-hidden="true" /> {t("r3.md")}
          </button>
        </>
      )}
      {doc && (
        <button type="button" onClick={() => void generate()} disabled={busy || !!preview}>
          <RefreshCw aria-hidden="true" className={busy ? "is-spin" : undefined} /> {t("r3.regenerate")}
        </button>
      )}
    </div>
  );

  return (
    <div className="r3" aria-busy={busy}>
      {doc && !busy && (
        <nav className="r3-toc" aria-label={t("r3.toc")}>
          <p>{t("r3.toc")}</p>
          <ol>
            {doc.sections.map((x) => (
              <li key={x.id}>
                <a href={"#r3-" + x.id}>{x.heading}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <article className="r3-page">
        <header className="r3-head">
          <h1>{title}</h1>
          {doc && !busy && <p className="r3-meta">{meta}</p>}
          {toolbar}
        </header>

        {error && !busy && (
          <p role="alert" className="r3-error">
            {error}
          </p>
        )}
        {stale && <p className="r3-note">{t("r3.stale")}</p>}

        {busy ? (
          <div className="r3-wait" aria-live="polite">
            <div className="r3-wait-head">
              <Mascot size={64} busy />
              <p>
                <strong>{t("r3.busy")}</strong>
                <span>{t("r3.busy.hint")}</span>
              </p>
            </div>
            {REPORT_SECTIONS.slice(0, 5).map((id, i) => (
              <section key={id} className="r3-skel" aria-hidden="true">
                <Skeleton className="r3-sk-h" />
                <Skeleton className="r3-sk-l" style={{ width: "96%" }} />
                <Skeleton className="r3-sk-l" style={{ width: i % 2 ? "78%" : "88%" }} />
                {i % 2 === 0 && <Skeleton className="r3-sk-box" />}
              </section>
            ))}
          </div>
        ) : doc ? (
          <>
            {doc.sections.map((x) => (
              <section key={x.id} id={"r3-" + x.id} aria-labelledby={"r3-h-" + x.id} className="r3-sec">
                <h2 id={"r3-h-" + x.id}>{x.heading}</h2>
                {x.callout && (
                  <aside className="r3-callout">
                    <Sparkles aria-hidden="true" />
                    <p>{x.callout}</p>
                  </aside>
                )}
                {x.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
                {x.bullets.length > 0 && (
                  <ul>
                    {x.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
                {x.table && (
                  <div className="r3-table" tabIndex={0} role="region" aria-label={x.heading}>
                    <table>
                      <thead>
                        <tr>
                          {x.table.head.map((h, i) => (
                            <th key={i} scope="col">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {x.table.rows.map((r, i) => (
                          <tr key={i}>
                            {r.map((c, j) => (
                              <td key={j}>{c}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
            <p className="r3-foot">{t("r3.foot")}</p>
          </>
        ) : (
          <div className="r3-empty">
            <p>{ready ? t("r3.empty") : t("r3.need")}</p>
            {ready && (
              <button type="button" className="r3-go" onClick={() => void generate()} disabled={!s.user && !preview}>
                <Sparkles aria-hidden="true" /> {t("r3.generate")}
              </button>
            )}
          </div>
        )}
      </article>
    </div>
  );
}

