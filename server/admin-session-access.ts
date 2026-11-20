import { staffSessionReceipt } from "@/lib/staff-session";
import { HttpError } from "./http";

/** Only signature-verified Supabase claims are accepted; DB checks live role/session/factor. */
export async function assertAdminSession(
  db: {
    auth: {
      getClaims(
        token: string,
      ): Promise<{
        data: { claims: Record<string, unknown> } | null;
        error: unknown;
      }>;
    };
    rpc(name: string): PromiseLike<{ data: unknown; error: unknown }>;
  },
  token: string,
) {
  const claims = await db.auth.getClaims(token);
  if (claims.error || claims.data?.claims.aal !== "aal2")
    throw new HttpError(
      403,
      "Verify your authenticator to open the admin panel.",
    );
  const session = await db.rpc("admin_session_status");
  const parsed = staffSessionReceipt.safeParse(session.data);
  if (session.error || !parsed.success)
    throw new HttpError(
      503,
      "Admin session checks are unavailable. Please retry.",
    );
  if (!parsed.data.active)
    throw new HttpError(
      403,
      "Your admin session ended. Verify your authenticator again.",
    );
}
