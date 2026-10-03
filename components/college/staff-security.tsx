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
export function StaffSecurity({ compact = false }: { compact?: boolean }) {
  const [verified, setVerified] = useState(false),
    [factor, setFactor] = useState(""),
    [qr, setQr] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  const inspect = useCallback(async () => {
    const db = getSupabase();
    if (!db) return;
    const [aal, factors] = await Promise.all([
      db.auth.mfa.getAuthenticatorAssuranceLevel(),
      db.auth.mfa.listFactors(),
    ]);
    if (aal.error || factors.error) {
      setError("Could not check account security. Please retry.");
      return;
    }
    setVerified(aal.data.currentLevel === "aal2");
    setFactor(factors.data.totp.find((f) => f.status === "verified")?.id || "");
    setLoaded(true);
  }, []);
  useEffect(() => {
    void inspect();
  }, [inspect]);
  const enroll = async () => {
    const db = getSupabase();
    if (!db) return;
    setBusy(true);
    setError("");
    try {
      // Resume an abandoned, unverified TOTP enrollment without accumulating factors.
      const list = await db.auth.mfa.listFactors();
      if (list.error) throw list.error;
      for (const f of list.data.all.filter(
        (f) => f.factor_type === "totp" && f.status === "unverified",
      )) {
        const removed = await db.auth.mfa.unenroll({ factorId: f.id });
        if (removed.error) throw removed.error;
      }
      const result = await db.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "CollegeStat staff",
        issuer: "CollegeStat",
      });
      if (result.error) throw result.error;
      setFactor(result.data.id);
      setQr(result.data.totp.qr_code);
    } catch {
      setError(
        "Authenticator setup failed. Retry or check Supabase MFA settings.",
      );
    } finally {
      setBusy(false);
    }
  };
  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    const db = getSupabase();
    if (!db) return;
    setBusy(true);
    setError("");
    try {
      const result = await db.auth.mfa.challengeAndVerify({
        factorId: factor,
        code,
      });
      if (result.error) throw result.error;
      setQr("");
      setCode("");
      await inspect();
    } catch {
      setError(
        "That code could not be verified. Use the current six-digit code.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={"staff-security " + (compact ? "compact" : "")}>
      <div className="staff-security-heading">
        <ShieldCheck size={19} />
        <div>
          <h2>
            {verified ? "Staff session verified" : "Protect catalogue changes"}
          </h2>
          <p>
            {verified
              ? "Authenticator verified for this session."
              : "An authenticator code is required to edit, stage, or publish."}
          </p>
        </div>
        {verified && <Check size={18} />}
      </div>
      {!loaded && !error && (
        <p role="status">
          <LoaderCircle size={14} /> Checking security…
        </p>
      )}
      {loaded && !verified && !factor && (
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={enroll}
        >
          <KeyRound size={15} /> Set up authenticator
        </button>
      )}
      {loaded && !verified && factor && (
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
              Tools use your session and database permissions. AI only routes
              read requests. Staff API writes require MFA and are audited.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
