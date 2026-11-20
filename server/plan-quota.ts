import type { SupabaseClient } from "@supabase/supabase-js";
import { effectivePlan, limitsOf, QUOTA_WINDOWS, UNLIMITED, type PlanId, type QuotaKind } from "@/lib/plans";
import { serviceClient } from "./config";

export type PlanQuotaResult = { ok: true; plan: PlanId } | { ok: false; plan: PlanId; limit: number };

/** The plan this account is on, read from its own profile with its own token. */
export async function planFor(db: SupabaseClient, owner: string, signal?: AbortSignal): Promise<PlanId> {
  let query = db.from("profiles").select("preferences").eq("id", owner);
  if (signal) query = query.abortSignal(signal);
  const { data } = await query.maybeSingle();
  return effectivePlan((data as { preferences?: unknown } | null)?.preferences);
}

/**
 * Spends one unit of the plan's quota for `kind` (lib/plans.ts). It runs on
 * top of consume_student_ai_limit, which stays the hard per-account guard.
 * Buckets live in public.consume_rate_limit through the service role, so the
 * student cannot reset them. Without a service key (local dev) the plan
 * check is skipped and only the database quota applies.
 */
export async function consumePlanQuota(
  db: SupabaseClient,
  owner: string,
  kind: QuotaKind,
  signal?: AbortSignal,
): Promise<PlanQuotaResult> {
  const plan = await planFor(db, owner, signal).catch((): PlanId => "free");
  const window = QUOTA_WINDOWS[kind];
  const limit = limitsOf(plan)[window.key] as number;
  if (limit === UNLIMITED) return { ok: true, plan };
  const service = serviceClient();
  if (!service) return { ok: true, plan };
  // Bucket per plan, so moving up a plan starts a fresh allowance.
  let call = service.rpc("consume_rate_limit", {
    key: `plan:${kind}:${plan}:${owner}`,
    max_hits: limit,
    window_seconds: window.seconds,
  });
  if (signal) call = call.abortSignal(signal);
  const { data, error } = await call;
  // Fail open on a database error: consume_student_ai_limit still caps usage.
  if (error) return { ok: true, plan };
  return data === true ? { ok: true, plan } : { ok: false, plan, limit };
}

/** The JSON body every metered route returns when a plan limit is reached. */
export const planLimitBody = (r: Extract<PlanQuotaResult, { ok: false }>, kind: QuotaKind) => ({
  error: "plan_limit",
  kind,
  plan: r.plan,
  limit: r.limit,
  upgrade: "/pricing",
});
