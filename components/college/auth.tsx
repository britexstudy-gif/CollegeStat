/* eslint-disable @next/next/no-img-element -- Local editorial artwork. */
"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Mail,
  CheckCircle2,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { safeNext } from "@/lib/domain";
import { useCollege } from "./provider";
import { Brand } from "./primitives";
import { isStaffPath } from "@/lib/staff-route";
import type { AuthAvailability } from "@/lib/auth-availability";
export function AuthForm() {
  const s = useCollege(),
    params = useSearchParams(),
    path = usePathname(),
    router = useRouter();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [availability, setAvailability] = useState<AuthAvailability | null>(
    null,
  );
  const [providersChecked, setProvidersChecked] = useState(false);
  const enabled = availability || {
    google: false,
    apple: false,
    telegram: false,
    email: process.env.NEXT_PUBLIC_AUTH_EMAIL_ENABLED !== "false",
    signup: true,
  };
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/providers", { signal: controller.signal })
      .then(async (response) => {
        if (response.ok)
          setAvailability(
            ((await response.json()) as { available: AuthAvailability | null })
              .available,
          );
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setProvidersChecked(true);
      });
    return () => controller.abort();
  }, []);
  const [returnTo, setReturnTo] = useState("/");
  useEffect(() => {
    try {
      setReturnTo(
        safeNext(
          params.get("returnTo") ||
            sessionStorage.getItem("collegestat:return-to") ||
            params.get("next") ||
            "/",
        ),
      );
    } catch {
      setReturnTo("/");
    }
  }, [params]);
  const signup = path === "/auth/sign-up",
    forgot = path === "/auth/forgot-password",
    reset = path === "/auth/reset-password";
  const next = safeNext(
    params.get("next") ||
      (!path?.startsWith("/auth/")
        ? path + (params.toString() ? "?" + params.toString() : "")
        : "/dashboard"),
  );
  useEffect(() => {
    setSent(false);
    setError("");
    setPassword("");
    setShowPassword(false);
  }, [path]);
  const callback = () =>
    location.origin + "/auth/callback?next=" + encodeURIComponent(next);
  const oauth = async (provider: "google" | "apple" | "custom:telegram") => {
    const key = provider === "custom:telegram" ? "telegram" : provider;
    if (!enabled[key]) {
      setError(
        `${key[0].toUpperCase() + key.slice(1)} sign-in is not available yet. Please use another sign-in method.`,
      );
      return;
    }
    const db = getSupabase();
    if (!db) {
      setError("Sign-in is temporarily unavailable. Please try again later.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error } = await db.auth.signInWithOAuth({
        provider: provider as Parameters<
          typeof db.auth.signInWithOAuth
        >[0]["provider"],
        options: { redirectTo: callback() },
      });
      if (error) throw error;
    } catch {
      setError("Could not start provider sign-in. Please try again.");
      setBusy(false);
    }
  };
  const submit = async (e: React.FormEvent, magic = false) => {
    e.preventDefault();
    const db = getSupabase();
    if (!db) {
      setError("Sign-in is temporarily unavailable. Please try again later.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (reset) {
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        router.replace("/profile");
      } else if (forgot) {
        const { error } = await db.auth.resetPasswordForEmail(email.trim(), {
          redirectTo:
            location.origin + "/auth/callback?next=/auth/reset-password",
        });
        if (error) throw error;
        setSent(true);
      } else if (magic) {
        const { error } = await db.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: callback(), shouldCreateUser: false },
        });
        if (error) throw error;
        setSent(true);
      } else if (signup) {
        const { data, error } = await db.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() || null },
            emailRedirectTo: callback(),
          },
        });
        if (error) throw error;
        if (data.session) {
          router.replace(next);
        } else setSent(true);
      } else {
        const { error } = await db.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        router.replace(next);
      }
    } catch (cause) {
      const code =
        typeof cause === "object" && cause && "code" in cause
          ? String(cause.code)
          : "";
      setError(
        code === "invalid_credentials"
          ? "Email or password is incorrect. Try again or reset your password."
          : code === "email_not_confirmed"
            ? "Confirm your email first. Check your inbox for the sign-up link."
            : code.includes("rate_limit")
              ? "Too many attempts. Wait a minute before trying again."
              : code === "weak_password"
                ? "Choose a longer password with a mix of letters, numbers, and symbols."
                : "Unable to complete this request. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const staff = isStaffPath(next);
  return (
    <div className="auth-workspace">
      <header className="auth-header">
        <Brand />
        <Link className="text-link" href={returnTo}>
          <ArrowLeft size={16} /> Back to browsing
        </Link>
      </header>
      <div className="auth-layout">
        <div className="auth-access-panel">
          <aside className="auth-art" aria-label="Plan your university journey">
            <img
              src="/images/hero/blue-collage.webp"
              alt="Blue editorial collage of a student, university buildings and a plane"
              width="1200"
              height="800"
            />
            <div>
              <span>YOUR NEXT STEP</span>
              <h2>A plan of your own.</h2>
              <p>Shortlist. Compare. Apply.</p>
            </div>
          </aside>
          <section className="auth-form" aria-labelledby="auth-title">
            <span className="eyebrow">
              {staff ? "COLLEGESTAT · STAFF" : "YOUR COLLEGESTAT ACCOUNT"}
            </span>
            <h1 id="auth-title">
              {reset
                ? "New password"
                : forgot
                  ? "Reset password"
                  : signup
                    ? "Create an account"
                    : staff
                      ? "Admin sign-in"
                      : "Sign in"}
            </h1>
            <p>
              {reset
                ? "Choose a unique password to secure your account."
                : forgot
                  ? "Enter your email to receive a reset link."
                  : signup
                    ? "Save your shortlist, comparisons, and application plan."
                    : staff
                      ? "Use your administrator account to open the database workspace."
                      : "Your universities, funding, and next steps. Together."}
            </p>
            {!forgot && !reset && !staff && (
              <nav className="auth-mode-nav" aria-label="Account access">
                <Link
                  aria-current={!signup ? "page" : undefined}
                  href={"/auth/sign-in?next=" + encodeURIComponent(next)}
                >
                  Sign in
                </Link>
                <Link
                  aria-current={signup ? "page" : undefined}
                  href={"/auth/sign-up?next=" + encodeURIComponent(next)}
                >
                  Create account
                </Link>
              </nav>
            )}
            {sent ? (
              <div className="auth-sent" role="status">
                <CheckCircle2 size={30} />
                <h3>Check your inbox.</h3>
                <p>
                  If this address can receive the requested link, it will arrive
                  shortly. Open it in this browser.
                </p>
                <Link
                  className="text-link"
                  href={"/auth/sign-in?next=" + encodeURIComponent(next)}
                >
                  Back to sign in <ArrowRight size={15} />
                </Link>
              </div>
            ) : (
              <>
                {!forgot && !reset && (
                  <div className="auth-providers">
                    {(["google", "apple", "telegram"] as const).map(
                      (provider) => (
                        <button
                          key={provider}
                          className="provider-button"
                          disabled={busy || !s.configured || !enabled[provider]}
                          onClick={() =>
                            oauth(
                              provider === "telegram"
                                ? "custom:telegram"
                                : provider,
                            )
                          }
                          aria-describedby={
                            !enabled[provider]
                              ? "provider-availability"
                              : undefined
                          }
                        >
                          {provider === "google" ? (
                            <GoogleMark />
                          ) : provider === "apple" ? (
                            <AppleMark />
                          ) : (
                            <TelegramMark />
                          )}
                          <span>
                            {provider[0].toUpperCase() + provider.slice(1)}
                          </span>
                        </button>
                      ),
                    )}
                    {(!enabled.google ||
                      !enabled.apple ||
                      !enabled.telegram) && (
                      <p
                        id="provider-availability"
                        className="provider-availability"
                      >
                        {providersChecked
                          ? "Grey options aren’t enabled yet. Email sign-in is available."
                          : "Checking sign-in options…"}
                      </p>
                    )}
                    {enabled.email && (
                      <div className="auth-divider">
                        <span /> or use your email <span />
                      </div>
                    )}
                  </div>
                )}
                {enabled.email && (
                  <form onSubmit={submit} aria-busy={busy}>
                    {signup && (
                      <div className="auth-field">
                        <label htmlFor="auth-name">
                          Display name <span>(optional)</span>
                        </label>
                        <input
                          id="auth-name"
                          autoComplete="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          maxLength={120}
                          disabled={busy}
                        />
                      </div>
                    )}
                    {!reset && (
                      <div className="auth-field">
                        <label htmlFor="auth-email">Email address</label>
                        <div className="auth-input">
                          <Mail size={18} aria-hidden="true" />
                          <input
                            id="auth-email"
                            type="email"
                            required
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            disabled={busy}
                          />
                        </div>
                      </div>
                    )}
                    {!forgot && (
                      <div className="auth-field">
                        <label htmlFor="auth-password">
                          {reset ? "New password" : "Password"}
                        </label>
                        <div className="auth-input">
                          <input
                            id="auth-password"
                            type={showPassword ? "text" : "password"}
                            required
                            minLength={signup || reset ? 8 : 1}
                            autoComplete={
                              signup || reset
                                ? "new-password"
                                : "current-password"
                            }
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={busy}
                            aria-describedby={
                              signup || reset ? "password-hint" : undefined
                            }
                          />
                          <button
                            type="button"
                            className="auth-password-toggle"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={
                              showPassword ? "Hide password" : "Show password"
                            }
                            aria-pressed={showPassword}
                          >
                            {showPassword ? (
                              <EyeOff size={18} />
                            ) : (
                              <Eye size={18} />
                            )}
                          </button>
                        </div>
                        {(signup || reset) && (
                          <small id="password-hint">
                            At least 8 characters. A long, unique passphrase
                            works well.
                          </small>
                        )}
                      </div>
                    )}
                    {error && (
                      <p className="inline-error" role="alert">
                        {error}
                      </p>
                    )}
                    {signup && !enabled.signup && (
                      <p className="inline-error" role="status">
                        New registrations are currently closed. Existing
                        accounts can still sign in.
                      </p>
                    )}
                    <button
                      className="button button-primary auth-submit"
                      disabled={
                        !s.configured || busy || (signup && !enabled.signup)
                      }
                    >
                      {busy
                        ? "Please wait…"
                        : reset
                          ? "Update password"
                          : forgot
                            ? "Send reset link"
                            : signup
                              ? "Create account"
                              : "Sign in"}
                      <ArrowRight size={17} />
                    </button>
                  </form>
                )}
                {!enabled.email && error && (
                  <p className="inline-error" role="alert">
                    {error}
                  </p>
                )}
                {s.configured &&
                  enabled.email &&
                  !reset &&
                  !forgot &&
                  !signup && (
                    <button
                      className="magic-link-button text-link"
                      disabled={
                        busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
                      }
                      onClick={(e) => submit(e, true)}
                    >
                      <Mail size={15} /> Email me a sign-in link
                    </button>
                  )}
                {!forgot && !reset && !signup && (
                  <div className="auth-links">
                    <Link
                      className="text-link"
                      href={
                        "/auth/forgot-password?next=" + encodeURIComponent(next)
                      }
                    >
                      Forgot password?
                    </Link>
                  </div>
                )}
              </>
            )}
            {!s.configured && (
              <p className="inline-error" role="status">
                Sign-in is temporarily unavailable. You can still browse
                universities and scholarships.
              </p>
            )}
            <div className="auth-privacy">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>
                {staff
                  ? "Access is checked against your database role."
                  : "Your saved research stays private to your account."}
              </span>
            </div>
            {signup && (
              <p className="auth-terms">
                By creating an account, you agree to our{" "}
                <Link href="/terms">Terms</Link> and{" "}
                <Link href="/privacy">Privacy Policy</Link>.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.27 5.48-4.78 7.18l7.73 6C44.4 38.05 46.98 31.87 46.98 24.55Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.86 23.86 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6C30.02 37.65 27.25 38.5 24 38.5c-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
      />
    </svg>
  );
}
function AppleMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.1 12.4c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.6 0-3.1.9-3.9 2.3-1.7 2.9-.4 7.2 1.2 9.5.8 1.1 1.6 2.2 2.8 2.2 1.1 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.7-2.2c.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.4-.9-2.4-4.2ZM14.8 5.9c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.9-1.1 2.9 1.1.1 2.2-.5 2.9-1.3Z" />
    </svg>
  );
}
function TelegramMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path
        fill="white"
        d="m5.1 11.7 12.8-5c.6-.2 1 .2.8.9l-2.2 10.3c-.1.6-.5.8-1 .5l-3.3-2.4-1.6 1.5c-.2.2-.3.3-.6.3l.2-3.4 6.1-5.5c.3-.2 0-.4-.3-.2l-7.6 4.8-3.2-1c-.7-.2-.7-.6-.1-.8Z"
      />
    </svg>
  );
}

export function AuthCallback() {
  const router = useRouter(),
    params = useSearchParams(),
    ran = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const db = getSupabase(),
      code = params.get("code");
    if (params.get("error") || !db || !code) {
      setError(
        "This sign-in link is incomplete or expired. Request a new link.",
      );
      return;
    }
    db.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error)
          setError(
            "The sign-in link could not be used. Request a fresh link in this browser.",
          );
        else
          router.replace(
            params.get("next") === "/auth/reset-password"
              ? "/auth/reset-password"
              : safeNext(params.get("next")),
          );
      })
      .catch(() =>
        setError("Sign-in could not be completed. Please try again."),
      );
  }, [params, router]);
  return (
    <div className="auth-callback">
      <Brand />
      <h1>{error ? "Let’s try that again." : "Finishing your sign-in."}</h1>
      <p>{error || "Restoring your secure session…"}</p>
      {error && (
        <Link href="/auth/sign-in" className="button button-primary">
          Return to sign in
        </Link>
      )}
    </div>
  );
}
