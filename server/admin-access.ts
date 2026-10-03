import { authenticate } from "./config";
import { HttpError } from "./http";
export async function adminAccess(request: Request, write = false) {
  const auth = await authenticate(request);
  if (!auth) throw new HttpError(401, "Sign in required");
  const { data, error } = await auth.db
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();
  if (error || data?.role !== "admin")
    throw new HttpError(403, "Administrator required");
  if (write) {
    const { data: claims, error: invalid } = await auth.db.auth.getClaims(
      auth.token,
    );
    if (invalid || claims?.claims.aal !== "aal2")
      throw new HttpError(
        403,
        "Verify your authenticator in Security before changing catalogue data.",
      );
  }
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
