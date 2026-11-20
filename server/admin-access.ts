import { authenticate } from "./config";
import { HttpError } from "./http";
import { assertAdminSession } from "./admin-session-access";
export async function adminAccess(request: Request, _write = false) {
  // The compatibility flag no longer relaxes reads: every privileged request needs MFA.
  void _write;
  const auth = await authenticate(request);
  if (!auth) throw new HttpError(401, "Sign in required");
  const { data, error } = await auth.db
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();
  if (error || data?.role !== "admin")
    throw new HttpError(403, "Administrator required");
  await assertAdminSession(auth.db, auth.token);
  const budget = await auth.db.rpc("consume_admin_limit");
  if (budget.error)
    throw new HttpError(503, "Administrative rate limiting unavailable");
  if (!budget.data)
    throw new HttpError(
      429,
      "Administrative limit reached. Retry in one minute.",
    );
  return auth;
}
