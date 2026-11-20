/* eslint-disable @next/next/no-img-element -- Authenticator QR data stays local to this enrollment view. */
"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  KeyRound,
  LockKeyhole,
  Check,
  LoaderCircle,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useStaffAccount } from "./use-staff-account";
import { useStaffSession } from "./staff-session-provider";
import { abortable } from "@/lib/abortable";
export function StaffSecurity({ compact = false }: { compact?: boolean }) {
  const { scope } = useStaffAccount();
  const session = useStaffSession();
  const [factor, setFactor] = useState(""),
    [qr, setQr] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  const inspect = useCallback(async () => {
    const db = getSupabase();
    if (!db) return;
    const owner = scope.capture();
    let aal,factors;
    try {
      [aal,factors]=await abortable(Promise.all([
        db.auth.mfa.getAuthenticatorAssuranceLevel(),db.auth.mfa.listFactors(),
      ]),AbortSignal.timeout(10000));
    } catch {
      if(scope.isCurrent(owner))setError("Could not check account security. Please retry.");
      return;
    }
    if (!scope.isCurrent(owner)) return;
    if (aal.error || factors.error) {
      setError("Could not check account security. Please retry.");
      return;
    }
    setFactor(factors.data.totp.find((f) => f.status === "verified")?.id || "");
    setLoaded(true);
  }, [scope]);
  useEffect(() => {
    void inspect();
    const client = getSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = client?.auth.onAuthStateChange((event) => {
      if (
        [
          "SIGNED_IN",
          "TOKEN_REFRESHED",
          "MFA_CHALLENGE_VERIFIED",
          "USER_UPDATED",
        ].includes(event)
      ) {
        clearTimeout(timer);
        timer = setTimeout(() => void inspect(), 0);
      }
    });
    const focused = () => void inspect();
    window.addEventListener("focus", focused);
    return () => {
      clearTimeout(timer);
      changed?.data.subscription.unsubscribe();
      window.removeEventListener("focus", focused);
    };
  }, [inspect]);
  const enroll = async () => {
    const db = getSupabase();
    if (!db) return;
    const owner = scope.capture();
    setBusy(true);
    setError("");
    try {
      const signal=AbortSignal.timeout(20000);
      // Resume an abandoned, unverified TOTP enrollment without accumulating factors.
      const list = await abortable(db.auth.mfa.listFactors(),signal);
      if (!scope.isCurrent(owner)) return;
      if (list.error) throw list.error;
      for (const f of list.data.all.filter(
        (f) => f.factor_type === "totp" && f.status === "unverified",
      )) {
        const removed = await abortable(db.auth.mfa.unenroll({ factorId: f.id }),signal);
        if (!scope.isCurrent(owner)) return;
        if (removed.error) throw removed.error;
      }
      const result = await abortable(db.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "CollegeStat staff",
        issuer: "CollegeStat",
      }),signal);
      if (!scope.isCurrent(owner)) return;
      if (result.error) throw result.error;
      setFactor(result.data.id);
      setQr(result.data.totp.qr_code);
    } catch {
      if (!scope.isCurrent(owner)) return;
      setError(
        "Authenticator setup failed. Retry or check Supabase MFA settings.",
      );
    } finally {
      if (scope.isCurrent(owner)) setBusy(false);
    }
  };
  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    const db = getSupabase();
    if (!db) return;
    const owner = scope.capture();
    setBusy(true);
    setError("");
    try {
      const signal=AbortSignal.timeout(20000);
      const challenge=await abortable(db.auth.mfa.challenge({factorId:factor}),signal);
      if(!scope.isCurrent(owner))return;
      if(challenge.error)throw challenge.error;
      const result = await abortable(db.auth.mfa.verify({
        factorId: factor,
        challengeId:challenge.data.id,
        code,
      }),signal);
      if (!scope.isCurrent(owner)) return;
      if (result.error) throw result.error;
      setQr("");
      setCode("");
      await session.open();
      if (!scope.isCurrent(owner)) return;
      await inspect();
    } catch {
      if (!scope.isCurrent(owner)) return;
      setError(
        "That code could not be verified. Use the current six-digit code.",
      );
    } finally {
      if (scope.isCurrent(owner)) setBusy(false);
    }
  };
  return (
    <section className={"staff-security " + (compact ? "compact" : "")}>
      <div className="staff-security-heading">
        <ShieldCheck size={19} />
        <div>
          <h2>
            {session.active ? "Staff session verified" : "Verify admin access"}
          </h2>
          <p>
            {session.active
              ? "Admin access is verified. This panel signs out after 15 minutes without activity."
              : "Connect an authenticator app and verify its code to open the admin panel."}
          </p>
        </div>
        {session.active && <Check size={18} />}
      </div>
      {!loaded && !error && (
        <p role="status">
          <LoaderCircle size={14} /> Checking security…
        </p>
      )}
      {loaded && !session.active && !factor && (
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={enroll}
        >
          <KeyRound size={15} /> Set up authenticator
        </button>
      )}
      {loaded && !session.active && factor && (
        <form onSubmit={verify}>
          {qr && (
            <div className="staff-qr">
              <img
                src={qr}
                alt="Scan this QR code in your authenticator app"
                width={176}
                height={176}
              />
              <p>
                Scan with your authenticator app, then enter its code. Keep
                access to your authenticator for future staff sessions.
              </p>
            </div>
          )}
          <label>
            Authenticator code
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              required
              pattern="[0-9]{6}"
            />
          </label>
          <button
            className="button button-primary"
            disabled={busy || code.length !== 6}
          >
            <LockKeyhole size={14} />
            {busy ? "Verifying…" : "Verify session"}
          </button>
        </form>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error} <button onClick={inspect}>Retry</button>
        </p>
      )}
      {!compact && (
        <div className="staff-security-facts">
          <div>
            <strong>Access</strong>
            <p>
              Supabase verifies each session. Staff roles come from the
              database. Student records stay protected by owner policies.
            </p>
          </div>
          <div>
            <strong>Data protection</strong>
            <p>
              Supabase encrypts managed storage at rest. HTTPS protects
              transport. Private notes use access controls; they are not
              end-to-end encrypted.
            </p>
          </div>
          <div>
            <strong>AI & MCP</strong>
            <p>
              Tools use your verified session and database permissions. All
              privileged access requires your authenticator. Changes keep their
              full audit history.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
