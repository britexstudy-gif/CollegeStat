"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShiningText } from "@/components/ui/shining-text";
import { getSupabase } from "@/lib/supabase/client";
import { saveProfile } from "@/services/profile-account";
import { snapshotFrom, hasProfile } from "@/lib/student-profile";
import { personalizeRequest, readPersonalization, TIERS, type SavedPersonalization } from "@/lib/personalize-ai";
import type { MessageKey } from "@/lib/i18n/messages";
import { useCollege } from "./provider";
import { useI18n } from "./i18n";
import { regionName } from "@/lib/region-name";

async function requestPersonalization(body: unknown, fallback: string): Promise<SavedPersonalization> {
  const session = await getSupabase()?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error(fallback);
  const res = await fetch("/api/student-ai/personalize", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (SavedPersonalization & { error?: unknown }) | null;
  if (!res.ok || !data || data.version !== 1) throw new Error(res.status === 429 && typeof data?.error === "string" ? data.error : fallback);
  return data;
}

/** The saved AI summary and a way to refresh it (kept in preferences.ai_personalize). */
export function usePersonalize(preview?: SavedPersonalization) {
  const s = useCollege();
  const { t, lang } = useI18n();
  const saved = useMemo(() => preview ?? readPersonalization(s.profile?.preferences), [preview, s.profile]);
  const snapshot = useMemo(() => snapshotFrom(s.profile?.preferences), [s.profile]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<SavedPersonalization | null>(null);
  const report = fresh ?? saved;

  const run = async () => {
    if (busy || !s.user) return;
    setBusy(true);
    setError("");
    const owner = s.accountScope.capture();
    try {
      const result = await requestPersonalization(personalizeRequest(snapshot, lang), t("pf.pz.error"));
      if (!s.accountScope.isCurrent(owner)) return;
      setFresh(result);
      try {
        await saveProfile(
          s.accountScope,
          { display_name: s.profile?.display_name ?? null, preferences: { ...(s.profile?.preferences || {}), ai_personalize: result } },
          owner,
        );
        await s.refreshAccount();
      } catch {
        // The report still shows; it just isn't kept for next time.
      }
    } catch (e) {
      if (s.accountScope.isCurrent(owner)) setError(e instanceof Error ? e.message : t("pf.pz.error"));
    } finally {
      if (s.accountScope.isCurrent(owner)) setBusy(false);
    }
  };

  return { report, busy, error, run, snapshot };
}

/** "Personalise with AI": a calm report card built from the saved profile.
 * The result is kept in the profile (preferences.ai_personalize). `preview`
 * shows a fixed result without an account (screenshot harness). */
export function PersonalizeCard({ preview, className = "" }: { preview?: SavedPersonalization; className?: string }) {
  const s = useCollege();
  const { t, lang } = useI18n();
  const { report, busy, error, run, snapshot } = usePersonalize(preview);

  if (!preview && (!s.user || !hasProfile(snapshot))) return null;
  const date = (d: string) => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));

  return (
    <section className={"rounded-2xl border border-border bg-card p-5 sm:p-6 " + className} aria-labelledby="pz-title" aria-busy={busy}>
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="pz-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Sparkles className="size-4 text-primary" aria-hidden="true" /> {t("pf.pz.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{report ? t("pf.pz.updated", { date: date(report.created_at.slice(0, 10)) }) : t("pf.pz.text")}</p>
        </div>
        <Button variant={report ? "outline" : "default"} size="sm" onClick={() => void run()} disabled={busy || !!preview}>
          {report ? <RefreshCw aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {busy ? t("pf.pz.busy") : report ? t("pf.pz.refresh") : t("pf.pz.run")}
        </Button>
      </header>

      {error && !busy && (
        <p role="alert" className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          {error}
        </p>
      )}

      {busy && (
        <div className="mt-6 grid gap-3" aria-live="polite">
          <ShiningText text={t("pf.pz.wait")} className="text-sm" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-9/12" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      )}

      {report && !busy && <Report report={report} lang={lang} t={t} date={date} />}
    </section>
  );
}

function Report({
  report,
  lang,
  t,
  date,
}: {
  report: SavedPersonalization;
  lang: string;
  t: ReturnType<typeof useI18n>["t"];
  date: (d: string) => string;
}) {
  const mix = report.country_mix.filter((c) => c.share > 0);
  const total = mix.reduce((n, c) => n + c.share, 0) || 1;
  return (
    <div className="mt-5 grid gap-6">
      <p className="text-[15px] leading-relaxed">{report.summary}</p>

      {mix.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">{t("pf.pz.mix")}</h3>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {mix.map((c, i) => (
              <span key={c.country} className="h-full" style={{ width: `${(c.share / total) * 100}%`, background: `color-mix(in srgb, var(--primary) ${100 - i * 22}%, var(--muted))` }} />
            ))}
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {mix.map((c, i) => (
              <li key={c.country} className="flex gap-2.5 text-sm">
                <i className="mt-1.5 size-2 flex-none rounded-full" style={{ background: `color-mix(in srgb, var(--primary) ${100 - i * 22}%, var(--muted))` }} aria-hidden="true" />
                <span className="min-w-0">
                  <b className="font-medium">
                    {regionName(c.country, lang)} · {c.share}%
                  </b>
                  {c.reason && <span className="block text-muted-foreground">{c.reason}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.universities.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => {
            const list = report.universities.filter((u) => u.tier === tier);
            return list.length ? (
              <div key={tier} className="min-w-0">
                <h3 className="text-sm font-medium">
                  {t(("pf.pz.tier." + tier) as MessageKey)}
                  <small className="ml-1.5 font-normal text-muted-foreground">{t(("pf.pz.tier." + tier + ".hint") as MessageKey)}</small>
                </h3>
                <ul className="mt-2 grid gap-2">
                  {list.map((u) => (
                    <li key={u.slug} className="rounded-xl border border-border px-3.5 py-3">
                      <Link href={"/university/" + u.slug} className="font-medium leading-snug hover:underline">
                        {u.name}
                      </Link>
                      <small className="block text-muted-foreground">{regionName(u.country_code, lang)}</small>
                      {u.reason && <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{u.reason}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null;
          })}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {report.gaps.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">{t("pf.pz.gaps")}</h3>
            <ul className="mt-2 grid gap-2">
              {report.gaps.map((g) => (
                <li key={g} className="flex gap-2.5 text-sm leading-snug">
                  <i className="mt-1.5 size-1.5 flex-none rounded-full bg-primary" aria-hidden="true" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        )}
        {report.actions.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">{t("pf.pz.actions")}</h3>
            <ol className="mt-2 grid gap-2.5">
              {report.actions.map((a) => (
                <li key={a.title + a.due} className="grid grid-cols-[104px_1fr] gap-3 text-sm">
                  <time dateTime={a.due} className="tabular-nums text-muted-foreground">
                    {date(a.due)}
                  </time>
                  <span className="min-w-0">
                    <b className="font-medium">{a.title}</b>
                    {a.detail && <span className="block text-muted-foreground">{a.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("pf.pz.note")}</p>
    </div>
  );
}
