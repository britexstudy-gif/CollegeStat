import type { SupabaseClient } from "@supabase/supabase-js";
/** Explicit staff step-up for CLI imports; never log or persist a one-time code. */
export async function verifyStaffMFA(db: SupabaseClient) {
  const aal = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.error) throw new Error("Could not check staff session assurance.");
  if (aal.data.currentLevel === "aal2") return;
  const factors = await db.auth.mfa.listFactors();
  if (factors.error)
    throw new Error("Could not inspect enrolled staff authenticators.");
  const id = process.env.COLLEGESTAT_MFA_FACTOR_ID;
  const factor = factors.data.totp.find(
    (f) => f.status === "verified" && (!id || f.id === id),
  );
  const code = process.env.COLLEGESTAT_MFA_CODE || "";
  delete process.env.COLLEGESTAT_MFA_CODE;
  if (!factor)
    throw new Error(
      "Enroll a staff authenticator in /staff/college-console/security before running a catalogue import.",
    );
  if (!/^\d{6}$/.test(code))
    throw new Error(
      "Set COLLEGESTAT_MFA_CODE to your current authenticator code for this import. Do not save it in a file or command argument.",
    );
  const result = await db.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code,
  });
  if (result.error)
    throw new Error(
      "Staff authenticator verification failed. No import was started.",
    );
}
