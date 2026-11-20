import { z } from "zod";
import type { AccountScope } from "./account-owner";

export const STAFF_IDLE_MS = 15 * 60 * 1000;
export const STAFF_WARNING_MS = 60 * 1000;
export const staffSessionReceipt = z.object({
  active: z.boolean(),
  server_time: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }).nullable(),
});
export type StaffSessionReceipt = z.infer<typeof staffSessionReceipt>;

/** Client partition only. Decoding is never used to authorize a request. */
export function staffTokenSessionId(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const claims: unknown = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    const parsed = z
      .object({ session_id: z.string().uuid() })
      .safeParse(claims);
    return parsed.success ? parsed.data.session_id : null;
  } catch {
    return null;
  }
}

export class StaffSessionExpiredError extends Error {
  constructor() {
    super("Your admin session ended. Verify your authenticator again.");
    this.name = "StaffSessionExpiredError";
  }
}

/** Local access boundary. Server receipts are converted to a monotonic deadline. */
export class StaffSessionScope {
  private generation = 0;
  private deadline = 0;
  private sessionId: string | null = null;
  private listeners = new Set<() => void>();
  constructor(private readonly now: () => number = () => performance.now()) {}
  identify(sessionId: string | null) {
    if (sessionId === this.sessionId) return false;
    const changed = this.sessionId !== null;
    this.sessionId = sessionId;
    if (changed) this.close();
    return changed;
  }
  matchesToken(token: string) {
    return (
      this.sessionId !== null && staffTokenSessionId(token) === this.sessionId
    );
  }
  identity() {
    return this.sessionId;
  }

  accept(receipt: StaffSessionReceipt, elapsedMs = 0) {
    const remaining = receipt.expires_at
      ? Date.parse(receipt.expires_at) - Date.parse(receipt.server_time)
      : 0;
    if (!receipt.active || !Number.isFinite(remaining) || remaining <= 0) {
      this.close();
      return;
    }
    this.deadline =
      this.now() +
      Math.max(0, Math.min(remaining, STAFF_IDLE_MS) - Math.max(0, elapsedMs));
    this.emit();
  }
  capture() {
    return this.generation;
  }
  active() {
    return this.deadline > this.now();
  }
  remaining() {
    return Math.max(0, this.deadline - this.now());
  }
  assertCurrent(generation: number) {
    if (generation !== this.generation || !this.active())
      throw new StaffSessionExpiredError();
  }
  close() {
    this.deadline = 0;
    this.generation++;
    this.emit();
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private emit() {
    for (const listener of this.listeners) listener();
  }
}

/** A delayed completion belongs only to the account and session that started it. */
export function captureStaffSessionCompletion(
  account: AccountScope,
  boundary: StaffSessionScope,
  currentRevision: () => number,
) {
  const token = account.capture();
  const revision = currentRevision();
  const sessionId = boundary.identity();
  return () =>
    account.isCurrent(token) &&
    revision === currentRevision() &&
    sessionId === boundary.identity();
}
