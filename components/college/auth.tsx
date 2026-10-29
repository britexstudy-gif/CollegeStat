"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Mail,
  Lock,
  CheckCircle2,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
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
  const providers = (["google", "apple", "telegram"] as const).filter(
    (provider) => enabled[provider],
  );
  const title = reset
    ? "Set a new password"
    : forgot
      ? "Reset your password"
      : signup
        ? "Create your account"
        : staff
          ? "Staff sign-in"
          : "Welcome back";
  const subtitle = reset
    ? "Choose a long, unique password to secure your account."
    : forgot
      ? "Enter your email and we will send you a reset link."
      : signup
        ? "Free to use. Save your shortlist, deadlines and notes."
        : staff
          ? "Use your administrator account to open the staff console."
          : "Sign in to pick up your plan where you left it.";
  return (
    <div className="au">
      <div className="au-main">
        <header className="au-top">
          <Brand />
          <Link className="au-back" href={returnTo}>
            <ArrowLeft size={15} /> Back
          </Link>
        </header>
        <section className="au-form" aria-labelledby="auth-title">
          {staff && <span className="au-badge">CollegeStat staff</span>}
          <h1 id="auth-title">{title}</h1>
          <p className="au-sub">{subtitle}</p>
          {!forgot && !reset && !staff && (
            <nav className="au-switch" aria-label="Account access">
              <Link
                href={"/auth/sign-in?next=" + encodeURIComponent(next)}
                aria-current={!signup ? "page" : undefined}
              >
                Sign in
              </Link>
              <Link
                href={"/auth/sign-up?next=" + encodeURIComponent(next)}
                aria-current={signup ? "page" : undefined}
              >
                Create account
              </Link>
            </nav>
          )}
          {sent ? (
            <div className="au-sent" role="status">
              <span>
                <CheckCircle2 size={26} />
              </span>
              <h2>Check your inbox</h2>
              <p>
                If {email.trim() || "this address"} can receive the link, it
                will arrive in a minute. Open it in this browser.
              </p>
              <button
                className="au-btn au-btn-quiet"
                onClick={() => setSent(false)}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              {!forgot && !reset && providers.length > 0 && (
                <div className={"au-providers au-providers-" + providers.length}>
                  {providers.map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      className="au-btn au-btn-quiet"
                      disabled={busy || !s.configured}
                      onClick={() =>
                        oauth(
                          provider === "telegram" ? "custom:telegram" : provider,
                        )
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
                        {providers.length === 1 ? "Continue with " : ""}
                        {provider[0].toUpperCase() + provider.slice(1)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!forgot && !reset && providers.length > 0 && enabled.email && (
                <div className="au-divider">
                  <span>or with email</span>
                </div>
              )}
              {!forgot && !reset && !providersChecked && !providers.length && (
                <p className="au-hint" role="status">
                  Checking sign-in options…
                </p>
              )}
              {enabled.email && (
                <form className="au-fields" onSubmit={submit} aria-busy={busy}>
                  {signup && (
                    <div className="au-field">
                      <label htmlFor="auth-name">
                        Name <span>optional</span>
                      </label>
                      <input
                        id="auth-name"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={120}
                        disabled={busy}
                        placeholder="What should we call you?"
                      />
                    </div>
                  )}
                  {!reset && (
                    <div className="au-field">
                      <label htmlFor="auth-email">Email</label>
                      <div className="au-input">
                        <Mail size={17} aria-hidden="true" />
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
                    <div className="au-field">
                      <div className="au-label-row">
                        <label htmlFor="auth-password">
                          {reset ? "New password" : "Password"}
                        </label>
                        {!signup && !reset && (
                          <Link
                            href={
                              "/auth/forgot-password?next=" +
                              encodeURIComponent(next)
                            }
                          >
                            Forgot password?
                          </Link>
                        )}
                      </div>
                      <div className="au-input">
                        <Lock size={17} aria-hidden="true" />
                        <input
                          id="auth-password"
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={signup || reset ? 8 : 1}
                          autoComplete={
                            signup || reset ? "new-password" : "current-password"
                          }
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={busy}
                          placeholder={
                            signup || reset ? "At least 8 characters" : ""
                          }
                          aria-describedby={
                            signup || reset ? "password-hint" : undefined
                          }
                        />
                        <button
                          type="button"
                          className="au-eye"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          aria-pressed={showPassword}
                        >
                          {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </div>
                      {(signup || reset) && (
                        <PasswordStrength value={password} />
                      )}
                    </div>
                  )}
                  {error && (
                    <p className="au-alert" role="alert">
                      {error}
                    </p>
                  )}
                  {signup && !enabled.signup && (
                    <p className="au-alert" role="status">
                      New registrations are currently closed. Existing accounts
                      can still sign in.
                    </p>
                  )}
                  <button
                    className="au-btn au-btn-primary au-submit"
                    disabled={!s.configured || busy || (signup && !enabled.signup)}
                  >
                    {busy ? (
                      <span className="au-spinner" aria-hidden="true" />
                    ) : null}
                    {busy
                      ? "Please wait…"
                      : reset
                        ? "Update password"
                        : forgot
                          ? "Send reset link"
                          : signup
                            ? "Create account"
                            : "Sign in"}
                    {!busy && <ArrowRight size={17} />}
                  </button>
                  {s.configured && !reset && !forgot && !signup && (
                    <button
                      type="button"
                      className="au-btn au-btn-quiet"
                      disabled={
                        busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
                      }
                      title="Enter your email above first"
                      onClick={(e) => submit(e, true)}
                    >
                      <Sparkles size={16} /> Email me a sign-in link
                    </button>
                  )}
                </form>
              )}
              {!enabled.email && error && (
                <p className="au-alert" role="alert">
                  {error}
                </p>
              )}
              {forgot && (
                <Link
                  className="au-text-link"
                  href={"/auth/sign-in?next=" + encodeURIComponent(next)}
                >
                  <ArrowLeft size={14} /> Back to sign in
                </Link>
              )}
            </>
          )}
          {!s.configured && (
            <p className="au-alert au-alert-info" role="status">
              Accounts are temporarily unavailable. You can still browse
              universities and scholarships.
            </p>
          )}
          <footer className="au-foot">
            <span>
              <ShieldCheck size={15} aria-hidden="true" />
              {staff
                ? "Access is checked against your database role."
                : "Your saved research stays private to your account."}
            </span>
            {signup && (
              <span>
                By creating an account you agree to the{" "}
                <Link href="/terms">Terms</Link> and{" "}
                <Link href="/privacy">Privacy Policy</Link>.
              </span>
            )}
          </footer>
        </section>
      </div>
      <aside className="au-aside" aria-hidden="true">
        <div className="au-aside-inner">
          <h2>Your university plan, all in one place.</h2>
          <ul>
            <li>
              <Check size={16} /> Shortlist from 8,900+ universities
            </li>
            <li>
              <Check size={16} /> Compare QS, THE and ARWU side by side
            </li>
            <li>
              <Check size={16} /> Track every deadline and task
            </li>
          </ul>
          <div className="au-preview">
            <div className="au-preview-card">
              <span className="au-preview-label">Next deadline</span>
              <strong>Personal statement</strong>
              <small>In 6 days</small>
              <div className="au-preview-bar">
                <span />
              </div>
            </div>
            <div className="au-preview-card au-preview-small">
              <span className="au-preview-label">Shortlist</span>
              <div className="au-preview-dots">
                <i />
                <i />
                <i />
                <i />
              </div>
              <small>4 universities · 2 applying</small>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
function PasswordStrength({ value }: { value: string }) {
  const score = !value
    ? 0
    : [
        value.length >= 8,
        value.length >= 12,
        /[a-z]/.test(value) && /[A-Z]/.test(value),
        /\d/.test(value) || /[^\w\s]/.test(value),
      ].filter(Boolean).length;
  const label = ["", "Weak", "Fair", "Good", "Strong"][score];
  return (
    <div className="au-strength" data-score={score} id="password-hint">
      <div aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <i key={n} className={n <= score ? "on" : ""} />
        ))}
      </div>
      <small>
        {value
          ? `${label} password`
          : "At least 8 characters. A long passphrase works well."}
      </small>
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
    <div className="au au-callback">
      <div className="au-callback-card">
        <Brand />
        {!error && <span className="au-spinner au-spinner-lg" aria-hidden="true" />}
        <h1>{error ? "Let’s try that again" : "Signing you in…"}</h1>
        <p>{error || "Restoring your secure session."}</p>
        {error && (
          <Link href="/auth/sign-in" className="au-btn au-btn-primary">
            Return to sign in
          </Link>
        )}
      </div>
    </div>
  );
}
