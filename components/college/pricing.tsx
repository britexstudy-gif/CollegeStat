"use client";
import { useState, type ComponentType, type PointerEvent, type SVGProps } from "react";
import {
  ArrowRight,
  BellRing,
  Bot,
  Check,
  Compass,
  Crown,
  Database,
  FileStack,
  FileText,
  GraduationCap,
  MessageSquare,
  PenLine,
  Rocket,
  Route,
  Target,
} from "lucide-react";
import "./pricing.css";
import { cn } from "@/lib/utils";
import { PLANS, PLAN_FEATURES, UNLIMITED, type Plan, type PlanId } from "@/lib/plans";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n, useT } from "./i18n";

export type Billing = "monthly" | "yearly";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Explorer / Applicant / Admit, shared by the landing (#pricing), /dashboard/plans and the
 * onboarding paywall. One panel split into three equal columns (no "most popular" plan),
 * a Monthly / Yearly switch with the real saving, and an icon per feature line.
 */
export function PricingTable({
  current,
  earlyAccess,
  busy,
  onChoose,
  compact,
}: {
  /** The plan the student is on now; undefined when signed out. */
  current?: PlanId;
  /** Already on the early-access list. */
  earlyAccess?: boolean;
  busy?: boolean;
  onChoose: (plan: PlanId) => void;
  /** Tighter columns for the onboarding paywall. */
  compact?: boolean;
}) {
  const t = useT();
  const [billing, setBilling] = useState<Billing>("monthly");
  // The smallest saving across paid plans, so the chip never overstates.
  const saving = Math.min(...PLANS.filter((p) => p.monthly > 0).map((p) => Math.round((1 - p.yearly / (p.monthly * 12)) * 100)));
  return (
    <div className="pc-wrap">
      <div className="pc-toggle" role="radiogroup" aria-label={t("d2.price.period")} data-on={billing}>
        <span className="pc-toggle-pill" aria-hidden="true" />
        {(["monthly", "yearly"] as const).map((b) => (
          <button key={b} type="button" role="radio" aria-checked={billing === b} onClick={() => setBilling(b)}>
            {t(b === "monthly" ? "d2.price.monthly" : "d2.price.season")}
            {b === "yearly" && saving > 0 && <span className="pc-save">{t("pr.save", { n: saving })}</span>}
          </button>
        ))}
      </div>
      <div className={cn("pc-panel", compact && "is-compact")}>
        {PLANS.map((plan) => (
          <PlanColumn
            key={plan.id}
            plan={plan}
            billing={billing}
            current={current === plan.id}
            earlyAccess={!!earlyAccess}
            busy={!!busy}
            onChoose={() => onChoose(plan.id)}
          />
        ))}
      </div>
      <p className="pc-note">{t("d2.price.note")}</p>
    </div>
  );
}

const PLAN_ICON: Record<PlanId, Icon> = { free: Compass, plus: Rocket, pro: Crown };
/** One icon per feature line (d2.plan.<id>.f<n>, in order). */
const FEATURE_ICONS: Record<PlanId, Icon[]> = {
  free: [MessageSquare, PenLine, GraduationCap, FileText, Target],
  plus: [MessageSquare, PenLine, GraduationCap, FileStack, Target, Route, BellRing],
  pro: [MessageSquare, PenLine, GraduationCap, Bot, Database],
};
/** Label above each feature list: what the plan adds on top of the one before. */
const INCLUDES: Record<PlanId, MessageKey> = { free: "pr.inc.base", plus: "pr.inc.free", pro: "pr.inc.plus" };

/** The cursor position drives a soft spotlight on the column (CSS --mx/--my). */
function spotlight(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", e.clientX - r.left + "px");
  e.currentTarget.style.setProperty("--my", e.clientY - r.top + "px");
}

function PlanColumn({
  plan,
  billing,
  current,
  earlyAccess,
  busy,
  onChoose,
}: {
  plan: Plan;
  billing: Billing;
  current: boolean;
  earlyAccess: boolean;
  busy: boolean;
  onChoose: () => void;
}) {
  const t = useT();
  const { lang } = useI18n();
  const paid = plan.monthly > 0;
  const yearly = billing === "yearly";
  const price = yearly ? plan.yearly : plan.monthly;
  const PlanIcon = PLAN_ICON[plan.id];
  const ai = plan.limits.aiPerDay;
  const aiValue = ai === UNLIMITED ? "∞" : ai.toLocaleString(lang);
  const label = current
    ? t("d2.price.current")
    : !paid
      ? t("d2.price.start_free")
      : earlyAccess
        ? t("d2.price.listed")
        : t("d2.price.early");
  const icons = FEATURE_ICONS[plan.id];
  return (
    <article className={cn("pc-col", "is-" + plan.id, current && "is-current")} aria-labelledby={"plan-" + plan.id} onPointerMove={spotlight}>
      <header className="pc-head">
        <span className="pc-icon" aria-hidden="true">
          <PlanIcon />
        </span>
        <h3 id={"plan-" + plan.id}>{t(`d2.plan.${plan.id}.name` as MessageKey)}</h3>
      </header>
      <p className="pc-tagline">{t(`d2.plan.${plan.id}.tagline` as MessageKey)}</p>

      <div className="pc-price">
        <p>
          <strong key={billing}>${price}</strong>
          <span>{!paid ? t("d2.price.forever") : yearly ? t("d2.price.per_season") : t("d2.price.per_month")}</span>
        </p>
        <p className="pc-bill">
          {!paid ? (
            t("pr.bill.free")
          ) : yearly ? (
            <>
              <s>${plan.monthly * 12}</s> ${plan.yearly} {t("pr.bill.year")}
            </>
          ) : (
            t("pr.bill.month")
          )}
        </p>
      </div>

      <button type="button" className="pc-btn" disabled={busy || current || (paid && earlyAccess)} onClick={onChoose}>
        {current && <Check aria-hidden="true" />}
        {label}
        {!current && !(paid && earlyAccess) && <ArrowRight aria-hidden="true" />}
      </button>

      <p className="pc-key">
        <strong>{aiValue}</strong>
        <span>{t("pr.stat.ai")}</span>
      </p>

      <div className="pc-features">
        <p className="pc-inc">{t(INCLUDES[plan.id])}</p>
        <ul>
          {Array.from({ length: PLAN_FEATURES[plan.id] - 1 }, (_, i) => {
            const FeatureIcon = icons[i + 1] ?? Check;
            return (
              <li key={i}>
                <FeatureIcon aria-hidden="true" />
                {t(`d2.plan.${plan.id}.f${i + 2}` as MessageKey)}
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}
