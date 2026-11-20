import type { AccountScope, AccountToken } from "./account-owner";

/** Only the initiating generation, or its direct signed-out transition, owns a completion. */
export function ownsSignOutResult(scope: AccountScope, token: AccountToken) {
  const current = scope.capture();
  return (
    token.owner !== null &&
    (scope.isCurrent(token) ||
      (current.owner === null && current.generation === token.generation + 1))
  );
}

/**
 * Guards application callbacks, not the SDK's internal session removal.
 * The current SDK can still clear a replacement session after delayed logout HTTP.
 */
export async function runAccountSignOut(
  scope: AccountScope,
  captured: AccountToken,
  operation: () => Promise<{ error: Error | null }>,
): Promise<boolean> {
  const token = { ...captured };
  if (token.owner === null || !scope.isCurrent(token)) return false;
  try {
    const result = await operation();
    if (!ownsSignOutResult(scope, token)) return false;
    if (!result || result.error !== null)
      throw result?.error || new Error("Sign out could not be confirmed.");
    return true;
  } catch (error) {
    if (!ownsSignOutResult(scope, token)) return false;
    throw error;
  }
}
