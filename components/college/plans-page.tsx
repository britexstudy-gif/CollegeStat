"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useCollege } from "./provider";
import { PricingTable } from "./pricing";
import { effectivePlan, limitsOf, onEarlyAccess, UNLIMITED, type PlanId, type PlanPreference } from "@/lib/plans";
import { Reveal } from "./reveal";
import "./pricing-page.css";
import { saveProfile } from "@/services/profile-account";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n, useT } from "./i18n";

/** Early access. Payments are not connected, so a paid choice records the
 * wish on the student's own profile and grants Plus until launch. */
export function useEarlyAccess() {
  const s = useCollege();
  const t = useT();
  const prefs = s.profile?.preferences as { plan?: PlanPreference } | undefined;
  const [busy, setBusy] = useState(false);
  const join = async (wanted: PlanId) => {
    const owner = s.accountScope.capture();
    if (!s.user || owner.owner !== s.user.id) {
      toast.error(t("d2.plans.error"));
      return false;
    }
    setBusy(true);
    try {
      await saveProfile(
        s.accountScope,
        {
          display_name: s.profile?.display_name ?? null,
          preferences: { ...s.profile?.preferences, plan: { ...prefs?.plan, wanted, waitlist_at: prefs?.plan?.waitlist_at || new Date().toISOString() } },
        },
        owner,
      );
      await s.refreshAccount();
      toast.success(t("d2.plans.joined"));
      return true;
    } catch {
      toast.error(t("d2.plans.error"));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, join, signedIn: !!s.user, earlyAccess: onEarlyAccess(prefs), current: effectivePlan(prefs) };
}

/** One labelled usage bar; hidden for unlimited allowances. */
export function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const { lang } = useI18n();
  if (limit === UNLIMITED) return null;
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {used.toLocaleString(lang)} / {limit.toLocaleString(lang)}
        </span>
      </div>
      <Progress value={pct} aria-label={label} className="h-1.5" />
    </div>
  );
}

/** /pricing and /dashboard/plans: hero, plan cards with the right action for the visitor,
 * what the paid plans unlock, the full comparison, trust strip, FAQ and a closing CTA. */
export function PlansView({ inDashboard = false }: { inDashboard?: boolean }) {
  const t = useT();
  const router = useRouter();
  const s = useCollege();
  const { busy, join, earlyAccess, current, signedIn } = useEarlyAccess();
  const limits = limitsOf(current);
  const choose = (plan: PlanId) => {
    if (!signedIn) return router.push("/auth/sign-in?next=" + encodeURIComponent(plan === "free" ? "/dashboard" : "/dashboard/plans"));
    if (plan === "free") return router.push("/dashboard");
    void join(plan);
  };
  return (
    <div className="pr-page">
      <header className="pr-hero">
        <span className="pr-badge">
          <Sparkles className="size-3.5" aria-hidden="true" /> {t("d2.price.badge")}
        </span>
        <h1 className="pr-h1">{t("d2.price.title")}</h1>
        <p className="pr-sub">{t("d2.price.sub")}</p>
      </header>
      {inDashboard && signedIn && (
        <section aria-labelledby="d2-usage" className="pr-usage">
          <div className="grid gap-1">
            <h2 id="d2-usage" className="text-[15px] font-semibold">
              {t("d2.plans.you_on", { plan: t(`d2.plan.${current}.name` as MessageKey) })}
            </h2>
            <p className="text-[13px] text-muted-foreground">{t(earlyAccess ? "d2.plans.early_on" : "d2.plans.early_off")}</p>
          </div>
          <div className="grid gap-3">
            <UsageBar label={t("d2.usage.list")} used={s.saved.length} limit={limits.listSize} />
            <p className="text-[12.5px] text-muted-foreground">
              {t("d2.usage.ai", { n: limits.aiPerDay })} · {t("d2.usage.essays", { n: limits.essayReviewsPerMonth === UNLIMITED ? "∞" : limits.essayReviewsPerMonth })}
            </p>
          </div>
        </section>
      )}
      <div className="pr-plans">
        <PricingTable current={signedIn ? current : undefined} earlyAccess={earlyAccess} busy={busy} onChoose={choose} />
      </div>
      <Unlocks />
      <TrustStrip />
      <PlanFAQ />
      {!inDashboard && <FinalCta />}
    </div>
  );
}

const UNLOCKS = [
  { id: "writing", img: "writing", dark: true },
  { id: "plan", img: "plan", dark: true },
  { id: "forms", img: "apply", dark: true },
  { id: "chances", img: "simulator", dark: true },
] as const;

function Unlocks() {
  const t = useT();
  return (
    <section className="pr-section" aria-labelledby="pr-unlock">
      <Reveal className="pr-head">
        <span className="pr-eyebrow">{t("pr.unlock.label")}</span>
        <h2 id="pr-unlock" className="pr-h2">{t("pr.unlock.title")}</h2>
      </Reveal>
      <div className="pr-bento">
        {UNLOCKS.map((u, i) => (
          <Reveal as="article" key={u.id} delay={i * 80} className="pr-tile">
            <div className="pr-tile-text">
              <h3>{t(`pr.u.${u.id}.t` as MessageKey)}</h3>
              <p>{t(`pr.u.${u.id}.d` as MessageKey)}</p>
            </div>
            <div className="pr-shot">
              {(u.dark ? (["light", "dark"] as const) : (["light"] as const)).map((theme) => (
                // eslint-disable-next-line @next/next/no-img-element -- local capture with 1x/2x srcset
                <img
                  key={theme}
                  className={u.dark ? "is-" + theme : "is-any"}
                  src={`/images/landing/${u.img}-${theme}-1x.webp`}
                  srcSet={`/images/landing/${u.img}-${theme}-1x.webp 1x, /images/landing/${u.img}-${theme}-2x.webp 2x`}
                  alt={theme === "light" ? t(`pr.u.${u.id}.t` as MessageKey) : ""}
                  aria-hidden={theme === "dark" ? true : undefined}
                  loading="lazy"
                  decoding="async"
                />
              ))}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/** Well-known universities on the target list that have a verified local logo. */
const TRUST: [string, string][] = [
  ["22222222-2222-4222-8222-222222222222", "svg"],
  ["11111111-1111-4111-8111-111111111111", "png"],
  ["33333333-3333-4333-8333-333333333333", "svg"],
  ["5ad45ea9-e51c-59e4-9ef7-6d3768be673c", "png"],
  ["44444444-4444-4444-8444-444444444444", "png"],
  ["6a9e2556-fc5f-56a2-bca0-9364f099818c", "png"],
  ["11087dc1-5405-5bd2-a5e2-def936b94cf7", "png"],
  ["69434102-e5f5-5311-9294-2f101f81906f", "png"],
  ["1848c4c4-1bfb-5ae4-8322-6fda3dca4e50", "png"],
  ["f2f2a71c-abeb-5dc7-b18b-aa8b00611b0a", "png"],
];

function TrustStrip() {
  const t = useT();
  return (
    <Reveal as="section" className="pr-trust" aria-label={t("pr.trust")}>
      <p>{t("pr.trust")}</p>
      <ul>
        {TRUST.map(([id, ext]) => (
          <li key={id}>
            {/* eslint-disable-next-line @next/next/no-img-element -- small local logo */}
            <img src={`/logos/auto/${id}.${ext}`} alt="" loading="lazy" decoding="async" />
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

function FinalCta() {
  const t = useT();
  return (
    <Reveal as="section" className="pr-cta" aria-labelledby="pr-cta">
      <h2 id="pr-cta" className="pr-h2">{t("pr.cta.title")}</h2>
      <p>{t("pr.cta.sub")}</p>
      <Link href="/auth/sign-up" className="pr-cta-btn">
        {t("pr.cta.btn")} <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </Reveal>
  );
}

const FAQ: [MessageKey, MessageKey][] = [
  ["d2.faq.q1", "d2.faq.a1"],
  ["d2.faq.q2", "d2.faq.a2"],
  ["d2.faq.q3", "d2.faq.a3"],
  ["d2.faq.q4", "d2.faq.a4"],
];

function PlanFAQ() {
  const t = useT();
  return (
    <section aria-labelledby="d2-faq" className="pr-section pr-faq">
      <Reveal className="pr-head">
        <h2 id="d2-faq" className="pr-h2">{t("d2.faq.title")}</h2>
      </Reveal>
      <div className="pr-faq-list">
        {FAQ.map(([q, a], i) => (
          <Reveal as="details" key={q} delay={i * 60} className="pr-qa">
            <summary>
              {t(q)}
              <Plus className="pr-qa-icon" aria-hidden="true" />
            </summary>
            <p>{t(a)}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/** /dashboard/plans */
export function PlansPage() {
  return <PlansView inDashboard />;
}
