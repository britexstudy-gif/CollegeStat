/**
 * CollegeStat plans: the single source for prices and limits. The pricing
 * page, the onboarding paywall, the dashboard meters, the client-side guards
 * and the server-side AI quota (server/plan-quota.ts) all read this file.
 *
 * Payments are not connected yet. Nobody can buy Plus or Pro; "Get early
 * access" records interest on the student's profile and, until launch, that
 * student gets Plus limits free (EARLY_ACCESS_PLAN). A paid tier is never read
 * from the student-writable profile; it will come from a server-written column
 * (supabase/proposals/plan-limits-nov16.sql).
 */

export type PlanId = "free" | "plus" | "pro";
export const PLAN_IDS: readonly PlanId[] = ["free", "plus", "pro"];

/** Unlimited is a number so limits compare without special cases. */
export const UNLIMITED = Number.POSITIVE_INFINITY;

export type PlanLimits = {
  /** AI counsellor, quick answers and the personal report: requests per day. */
  aiPerDay: number;
  /** AI essay reviews on the writing desk, per 30 days. */
  essayReviewsPerMonth: number;
  /** Universities in My colleges. */
  listSize: number;
  /** Application-form simulators (Common App, UCAS, uni-assist…) a student can open. */
  formPractice: number;
  /** Basic = category only; full = category, score gaps and what to fix. */
  chances: "basic" | "full";
  personalPlan: boolean;
  agentActions: boolean;
  deadlineReminders: boolean;
  priorityData: boolean;
};

export type Plan = {
  id: PlanId;
  /** US dollars. */
  monthly: number;
  /** Billed once a year, US dollars. */
  yearly: number;
  limits: PlanLimits;
  highlight?: boolean;
};

export const PLANS: readonly Plan[] = [
  {
    id: "free",
    monthly: 0,
    yearly: 0,
    limits: {
      aiPerDay: 5,
      essayReviewsPerMonth: 2,
      listSize: 5,
      formPractice: 1,
      chances: "basic",
      personalPlan: false,
      agentActions: false,
      deadlineReminders: false,
      priorityData: false,
    },
  },
  {
    id: "plus",
    monthly: 6,
    yearly: 39,
    limits: {
      aiPerDay: 100,
      essayReviewsPerMonth: 30,
      listSize: 25,
      formPractice: UNLIMITED,
      chances: "full",
      personalPlan: true,
      agentActions: false,
      deadlineReminders: true,
      priorityData: false,
    },
  },
  {
    id: "pro",
    monthly: 15,
    yearly: 99,
    limits: {
      aiPerDay: 250,
      essayReviewsPerMonth: 80,
      listSize: 50,
      formPractice: UNLIMITED,
      chances: "full",
      personalPlan: true,
      agentActions: true,
      deadlineReminders: true,
      priorityData: true,
    },
  },
];

/** Feature lines shown on each plan card, in order (i18n: d2.plan.<id>.f<n>). */
export const PLAN_FEATURES: Record<PlanId, number> = { free: 5, plus: 7, pro: 5 };

/** Until payments launch, students on the early-access list get this plan free. */
export const EARLY_ACCESS_PLAN: PlanId = "plus";

export const planById = (id: PlanId): Plan => PLANS.find((p) => p.id === id) ?? PLANS[0];
export const limitsOf = (id: PlanId): PlanLimits => planById(id).limits;

export type PlanPreference = { tier?: PlanId; waitlist_at?: string; wanted?: PlanId };

/** Reads the plan marker from profile preferences. Only the early-access
 * grant is honoured: it is free, so a self-written flag cannot be abused. */
export function effectivePlan(prefs: unknown): PlanId {
  const plan = (prefs as { plan?: PlanPreference } | null | undefined)?.plan;
  return plan?.waitlist_at ? EARLY_ACCESS_PLAN : "free";
}

export const onEarlyAccess = (prefs: unknown) =>
  !!(prefs as { plan?: PlanPreference } | null | undefined)?.plan?.waitlist_at;

/** True while `used` is still under the plan's limit for `key`. */
export function withinLimit(id: PlanId, key: "aiPerDay" | "essayReviewsPerMonth" | "listSize" | "formPractice", used: number) {
  return used < limitsOf(id)[key];
}

/** The cheapest plan that lifts `key` above `needed`. */
export function upgradeFor(key: "aiPerDay" | "essayReviewsPerMonth" | "listSize" | "formPractice", needed: number): PlanId | null {
  return PLANS.find((p) => p.limits[key] >= needed)?.id ?? null;
}

/** Quota windows used by the server for each metered action. */
export const QUOTA_WINDOWS = {
  ai: { key: "aiPerDay", seconds: 86400 },
  essayReview: { key: "essayReviewsPerMonth", seconds: 30 * 86400 },
} as const satisfies Record<string, { key: keyof PlanLimits; seconds: number }>;
export type QuotaKind = keyof typeof QUOTA_WINDOWS;
