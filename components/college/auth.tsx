"use client";
import "./workspace-studio.css";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowLeft,
  LockKeyhole,
  LoaderCircle,
  Database,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { safeNext } from "@/lib/domain";
import { useCollege } from "./provider";
import { Brand } from "./primitives";
import { isStaffPath, STAFF_PATH } from "@/lib/staff-route";
import { isDashboardPath, postAuthDestination, writeSessionHint } from "@/lib/auth-navigation";
import { authErrorKey } from "@/lib/auth-errors";
import { AuthCodeStep } from "./auth-code-step";
import { useI18n, useT } from "./i18n";
import { HOME_FIRST, HOME_OTHER } from "./onboarding-steps";
import { regionName } from "@/lib/region-name";
import { AppearanceButton } from "./appearance-button";
import "./auth-v2.css";
import dynamic from "next/dynamic";
// WebGL backdrop, purely decorative: loads after the page is interactive.
const Aurora = dynamic(() => import("@/components/react-bits/Aurora"), { ssr: false });
import type { AuthAvailability } from "@/lib/auth-availability";
export function AuthForm({ staffOnly = false }: { staffOnly?: boolean } = {}) {
  const s = useCollege(),
    t = useT(),
    params = useSearchParams(),
    path = usePathname(),
    router = useRouter();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [codeFor, setCodeFor] = useState<{ kind: "email" | "signup" | "recovery"; email: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState(""),
    [country, setCountry] = useState(""),
    // Sign-in is email + a 6-digit code by default; a password stays one click away.
    [usePassword, setUsePassword] = useState(false);
  const { lang } = useI18n();
  const [capsLock, setCapsLock] = useState(false);
  const submitting = useRef(false);
  const awaitingNavigation = useRef(false);
  const [authenticatedDestination, setAuthenticatedDestination] = useState<{
    userId: string;
    href: string;
  } | null>(null);
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
    let live = true;
    const timeout = setTimeout(() => controller.abort(), 10000);
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
        clearTimeout(timeout);
        if (live) setProvidersChecked(true);
      });
    return () => {
      live = false;
      clearTimeout(timeout);
      controller.abort();
    };
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
  const codeMode = !signup && !forgot && !reset && !staffOnly && !usePassword;
  const next = safeNext(
    staffOnly
      ? isStaffPath(params.get("next")) &&
        !params.get("next")?.includes("/sign-in")
        ? params.get("next")!
        : STAFF_PATH
      : params.get("next") ||
          (!path?.startsWith("/auth/")
            ? path + (params.toString() ? "?" + params.toString() : "")
            : "/dashboard"),
  );
  useEffect(() => {
    setCodeFor(null);
    setError("");
    setPassword("");
    setShowPassword(false);
    setUsePassword(false);
    setCapsLock(false);
    setAuthenticatedDestination(null);
    awaitingNavigation.current = false;
  }, [path]);
  useEffect(() => {
    if (
      authenticatedDestination &&
      s.authReady &&
      s.user?.id === authenticatedDestination.userId
    ) {
      // Commit the signed-in context before the protected page renders. Navigating
      // straight from the Auth response can race its anonymous-page redirect.
      router.replace(authenticatedDestination.href);
      setAuthenticatedDestination(null);
    }
  }, [authenticatedDestination, s.authReady, s.user?.id, router]);
  // The proxy sends signed-out dashboard visits here. A visitor whose session
  // was only missing its routing cookie is already signed in: send them back.
  useEffect(() => {
    if (
      staffOnly ||
      path !== "/auth/sign-in" ||
      !s.authReady ||
      !s.user ||
      awaitingNavigation.current ||
      !isDashboardPath(next.split(/[?#]/)[0])
    )
      return;
    router.replace(next);
  }, [staffOnly, path, s.authReady, s.user, next, router]);
  const navigateAuthenticated = (userId: string, href: string) => {
    awaitingNavigation.current = true;
    setAuthenticatedDestination({ userId, href });
  };
  useEffect(() => {
    if (!authenticatedDestination) return;
    const timeout = setTimeout(() => {
      awaitingNavigation.current = false;
      submitting.current = false;
      setAuthenticatedDestination(null);
      setBusy(false);
      setCodeFor(null);
      setError(t("au.err.session"));
    }, 10000);
    return () => clearTimeout(timeout);
  }, [authenticatedDestination, t]);
  const callback = () =>
    location.origin + "/auth/callback?next=" + encodeURIComponent(next);
  const oauth = async (provider: "google" | "github" | "apple" | "custom:telegram") => {
    if (submitting.current) return;
    const key = provider === "custom:telegram" ? "telegram" : provider;
    // GitHub is not in the availability report: it is tried, and "not enabled" is shown kindly.
    if (key !== "github" && !enabled[key]) {
      setError(t("au.err.unavailable"));
      return;
    }
    const db = getSupabase();
    if (!db) {
      setError(t("au.err.unavailable"));
      return;
    }
    setBusy(true);
    submitting.current = true;
    setError("");
    try {
      const { data, error } = await db.auth.signInWithOAuth({
        provider: provider as Parameters<
          typeof db.auth.signInWithOAuth
        >[0]["provider"],
        options: { redirectTo: callback(), skipBrowserRedirect: provider === "github" },
      });
      if (error) throw error;
      if (provider === "github" && data?.url) {
        // Supabase answers a disabled provider with a JSON error page, so look first.
        const probe = await fetch(data.url, { redirect: "manual" }).catch(() => null);
        if (probe && probe.type !== "opaqueredirect" && probe.status === 400) {
          const body = await probe.text().catch(() => "");
          if (/not enabled|unsupported provider/i.test(body)) throw new Error("provider is not enabled");
        }
        location.assign(data.url);
      }
    } catch (err) {
      const soon = key === "github" && /not enabled|unsupported provider/i.test(String((err as Error)?.message || ""));
      setError(soon ? t("gh.soon") : t("au.err.provider", { name: key === "github" ? "GitHub" : key[0].toUpperCase() + key.slice(1) }));
      setBusy(false);
      submitting.current = false;
    }
  };
  const submit = async (e: React.FormEvent, magic = false) => {
    e.preventDefault();
    if (submitting.current) return;
    const db = getSupabase();
    if (!db) {
      setError(t("au.err.unavailable"));
      return;
    }
    setBusy(true);
    submitting.current = true;
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
        setCodeFor({ kind: "recovery", email: email.trim() });
      } else if (magic || codeMode) {
        // The email carries a 6-digit code and a link. New students are created
        // here when sign-ups are open; the welcome questions follow.
        const { error } = await db.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: callback(), shouldCreateUser: enabled.signup },
        });
        if (error) throw error;
        setCodeFor({ kind: "email", email: email.trim() });
      } else if (signup) {
        const { data, error } = await db.auth.signUp({
          email: email.trim(),
          password,
          options: {
            // The welcome questions start from these (profiles.display_name via the auth trigger).
            data: { full_name: name.trim().slice(0, 120) || null, country: country || null },
            emailRedirectTo: callback(),
          },
        });
        if (error) throw error;
        if (data.session) {
          navigateAuthenticated(data.user!.id, next);
        } else setCodeFor({ kind: "signup", email: email.trim() });
      } else {
        const { data, error } = await db.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (staffOnly) {
          const profile = await db
            .from("profiles")
            .select("role")
            .eq("id", data.user.id)
            .abortSignal(AbortSignal.timeout(10000))
            .single();
          if (profile.error) {
            setError("Staff access could not be checked. Please retry.");
            return;
          }
          if (profile.data?.role !== "admin") {
            setError(
              "You are signed in to a student account. Open your dashboard, or switch to your assigned staff account.",
            );
            return;
          }
        }
        navigateAuthenticated(data.user.id, next);
      }
    } catch (cause) {
      const code =
        typeof cause === "object" && cause && "code" in cause
          ? String(cause.code)
          : "";
      setError(
        code === "invalid_credentials"
          ? t("au.err.credentials")
          : code === "weak_password"
            ? t("au.err.weak")
            : t(authErrorKey(cause)),
      );
    } finally {
      if (!awaitingNavigation.current) {
        setBusy(false);
        submitting.current = false;
      }
    }
  };
  const verifyCode = async (code: string) => {
    const db = getSupabase();
    if (!db || !codeFor) throw Object.assign(new Error("offline"), { name: "AuthRetryableFetchError" });
    const { data, error } = await db.auth.verifyOtp({ email: codeFor.email, token: code, type: codeFor.kind });
    if (error) throw error;
    if (!data.user || !data.session) throw Object.assign(new Error("no session"), { code: "unexpected_failure" });
    // The proxy reads this hint on the very next navigation; do not wait for the provider's auth event.
    writeSessionHint(true);
    navigateAuthenticated(data.user.id, postAuthDestination(next, data.user, { recovery: codeFor.kind === "recovery" }));
  };
  const resendCode = async () => {
    const db = getSupabase();
    if (!db || !codeFor) throw Object.assign(new Error("offline"), { name: "AuthRetryableFetchError" });
    const result =
      codeFor.kind === "signup"
        ? await db.auth.resend({ type: "signup", email: codeFor.email, options: { emailRedirectTo: callback() } })
        : codeFor.kind === "recovery"
          ? await db.auth.resetPasswordForEmail(codeFor.email, { redirectTo: location.origin + "/auth/callback?next=/auth/reset-password" })
          : await db.auth.signInWithOtp({ email: codeFor.email, options: { emailRedirectTo: callback(), shouldCreateUser: enabled.signup } });
    if (result.error) throw result.error;
  };
  const staff = staffOnly;
  const formSection = (
          <section className="auth-form" aria-labelledby="auth-title">
            {staffOnly && (
              <div className="staff-auth-brand">
                <Brand />
                <span>
                  <LockKeyhole size={16} /> Staff access
                </span>
              </div>
            )}
            {codeFor ? (
              <AuthCodeStep
                email={codeFor.email}
                verify={verifyCode}
                resend={resendCode}
                onChangeEmail={() => setCodeFor(null)}
              />
            ) : (
              <>
            {staff && <span className="auth-kicker">COLLEGESTAT · STAFF</span>}
            <h1 id="auth-title">
              {reset
                ? t("au.title.reset")
                : forgot
                  ? t("au.title.forgot")
                  : signup
                    ? t("au.title.signup")
                    : staff
                      ? "Staff sign in"
                      : t("au.title.signin")}
            </h1>
            <p>
              {reset
                ? t("au.sub.reset")
                : forgot
                  ? t("au.sub.forgot")
                  : signup
                    ? t("au3.signup.sub")
                    : staff
                      ? "Your catalogue, sources, and review workspace."
                      : codeMode
                        ? t("au3.signin.sub")
                        : t("au3.signin.sub.pw")}
            </p>
            {staffOnly && (
              <div className="staff-auth-scope">
                <span>
                  <Database size={14} /> Catalogue management
                </span>
                <span>
                  <ShieldCheck size={14} /> Role verified access
                </span>
              </div>
            )}
            {!forgot && !reset && !staff && (
              <nav className="ax-toggle" aria-label={t("au.tabs.label")}>
                <Link
                  href={"/auth/sign-up?next=" + encodeURIComponent(next)}
                  aria-current={signup ? "page" : undefined}
                >
                  {t("au.tab.signup")}
                </Link>
                <Link
                  href={"/auth/sign-in?next=" + encodeURIComponent(next)}
                  aria-current={!signup ? "page" : undefined}
                >
                  {t("au.tab.signin")}
                </Link>
              </nav>
            )}
            {forgot && (
              <Link
                className="auth-back-link"
                href={"/auth/sign-in?next=" + encodeURIComponent(next)}
              >
                {t("au.back.signin")}
              </Link>
            )}
            {(
              <>
                {staffOnly && s.user && s.profile?.role === "student" && (
                  <div className="staff-account-recovery" role="status">
                    <Link className="text-link" href="/dashboard">
                      Open your student dashboard
                    </Link>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => void s.signOut()}
                      disabled={busy}
                    >
                      Switch account
                    </button>
                  </div>
                )}
                {!forgot &&
                  !reset &&
                  !staff && (
                    <div className="auth-providers">
                      {(["google", "github", "apple", "telegram"] as const)
                        .filter((provider) => provider === "google" || provider === "github" || enabled[provider])
                        .map((provider) => (
                          <button
                            type="button"
                            key={provider}
                            className="provider-button"
                            disabled={busy || !s.authReady || !s.configured}
                            onClick={() =>
                              oauth(
                                provider === "telegram"
                                  ? "custom:telegram"
                                  : provider,
                              )
                            }
                          >
                            {provider === "google" ? (
                              <GoogleMark />
                            ) : provider === "github" ? (
                              <GitHubMark />
                            ) : provider === "apple" ? (
                              <AppleMark />
                            ) : (
                              <TelegramMark />
                            )}
                            <span>
                              {t(signup ? "au.provider.signup" : "au.provider.signin", {
                                name: provider === "github" ? "GitHub" : provider[0].toUpperCase() + provider.slice(1),
                              })}
                            </span>
                          </button>
                        ))}
                      {enabled.email && (
                        <div className="auth-divider">
                          <span /> {t("au.or")} <span />
                        </div>
                      )}
                    </div>
                  )}
                {(enabled.email || reset) && (
                  <form onSubmit={submit} aria-busy={busy}>
                    {signup && (
                      <div className="auth-row">
                        <div className="auth-field">
                          <label htmlFor="auth-name">{t("au3.field.name")}</label>
                          <div className="auth-input">
                            <input
                              id="auth-name"
                              name="name"
                              required
                              autoComplete="name"
                              maxLength={120}
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder={t("au3.name.ph")}
                              disabled={busy}
                            />
                          </div>
                        </div>
                        <div className="auth-field">
                          <label htmlFor="auth-country">{t("au3.field.country")}</label>
                          <div className="auth-input is-select">
                            <select
                              id="auth-country"
                              name="country"
                              required
                              autoComplete="country"
                              value={country}
                              onChange={(e) => setCountry(e.target.value)}
                              disabled={busy}
                            >
                              <option value="" disabled>
                                {t("au3.country.choose")}
                              </option>
                              {HOME_FIRST.map((c) => (
                                <option key={c} value={c}>
                                  {regionName(c, lang)}
                                </option>
                              ))}
                              <optgroup label={t("au3.country.other")}>
                                {HOME_OTHER.map((c) => (
                                  <option key={c} value={c}>
                                    {regionName(c, lang)}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                    {!reset && (
                      <div className="auth-field">
                        <label htmlFor="auth-email">{t("au.field.email")}</label>
                        <div className="auth-input">
                          <Mail size={18} aria-hidden="true" />
                          <input
                            id="auth-email"
                            name="email"
                            type="email"
                            required
                            autoComplete="email"
                            autoCapitalize="none"
                            spellCheck={false}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            disabled={busy}
                          />
                        </div>
                      </div>
                    )}
                    {!forgot && !codeMode && (
                      <div className="auth-field">
                        <label htmlFor="auth-password">
                          {reset ? t("au.title.reset") : t("au.field.password")}
                        </label>
                        {!reset && !signup && (
                          <Link
                            className="auth-recovery"
                            href={
                              "/auth/forgot-password?next=" +
                              encodeURIComponent(next)
                            }
                          >
                            {t("au.forgot.link")}
                          </Link>
                        )}
                        <div className="auth-input">
                          <input
                            id="auth-password"
                            name="password"
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
                            onKeyUp={(e) =>
                              setCapsLock(e.getModifierState("CapsLock"))
                            }
                            onKeyDown={(e) =>
                              setCapsLock(e.getModifierState("CapsLock"))
                            }
                            onBlur={() => setCapsLock(false)}
                            aria-describedby={
                              signup || reset ? "password-hint" : undefined
                            }
                          />
                          <button
                            type="button"
                            className="auth-password-toggle"
                            disabled={busy || !s.authReady}
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={
                              showPassword ? t("au.pw.hide") : t("au.pw.show")
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
                            {t("au.pw.hint")}
                          </small>
                        )}
                        {capsLock && (
                          <small className="auth-caps-lock" role="status">
                            {t("au.caps")}
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
                        {t("au.closed")}
                      </p>
                    )}
                    <button
                      className="button button-primary auth-submit"
                      disabled={
                        !s.configured ||
                        !s.authReady ||
                        busy ||
                        (signup && !enabled.signup)
                      }
                    >
                      {busy
                        ? t("au.btn.wait")
                        : reset
                          ? t("au.btn.reset")
                          : forgot
                            ? t("au.btn.sendreset")
                            : signup
                              ? t("au.btn.signup")
                              : codeMode
                                ? t("au3.btn.code")
                                : t("au.btn.signin")}
                      {busy ? (
                        <LoaderCircle className="auth-loading" size={17} />
                      ) : (
                        <ArrowRight size={17} />
                      )}
                    </button>
                  </form>
                )}
                {!enabled.email && !reset && error && (
                  <p className="inline-error" role="alert">
                    {error}
                  </p>
                )}
                {providersChecked &&
                  !reset &&
                  !enabled.email &&
                  !(enabled.google || enabled.apple || enabled.telegram) &&
                  s.configured && (
                    <p className="inline-error" role="status">
                      {t("au.err.unavailable")}
                    </p>
                  )}
                {s.configured && enabled.email && !reset && !forgot && !signup && !staff && (
                  <button
                    type="button"
                    className="auth-mode-switch"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setPassword("");
                      setUsePassword((v) => !v);
                    }}
                  >
                    {usePassword ? <Mail size={15} aria-hidden="true" /> : <LockKeyhole size={15} aria-hidden="true" />}
                    {t(usePassword ? "au3.use.code" : "au3.use.password")}
                  </button>
                )}
              </>
            )}
            {!s.configured && (
              <p className="inline-error" role="status">
                {t("au.unavailable")}
              </p>
            )}
            <div className="auth-privacy">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>
                {staff
                  ? "Access is checked against your database role."
                  : t("au.privacy")}
              </span>
            </div>
            {signup && (
              <p className="auth-terms">
                {t("au.terms.lead")} <Link href="/terms">{t("au.terms.terms")}</Link>{" "}
                {t("au.terms.and")} <Link href="/privacy">{t("au.terms.privacy")}</Link>
                {t("au.terms.tail")}
              </p>
            )}
            {staffOnly && (
              <nav
                className="staff-auth-return"
                aria-label="Return from staff access"
              >
                <Link href="/">
                  <ArrowLeft size={14} /> Public website
                </Link>
                <Link href="/auth/sign-in">
                  Student sign in <ArrowRight size={14} />
                </Link>
              </nav>
            )}
              </>
            )}
          </section>
  );
  if (!staffOnly)
    return (
      <div className="ax">
        <div className="ax-main">
          <header className="ax-top">
            <Brand />
            <div>
              <AppearanceButton />
              <Link className="ax-back" href={returnTo}>
                <ArrowLeft size={14} aria-hidden="true" /> {t("au.back.site")}
              </Link>
            </div>
          </header>
          {formSection}
          <footer className="ax-foot">
            <span>© {new Date().getFullYear()} CollegeStat</span>
            <Link href="/terms">{t("au.foot.terms")}</Link>
            <Link href="/privacy">{t("au.foot.privacy")}</Link>
            <Link href="/support">{t("au.foot.help")}</Link>
          </footer>
        </div>
        <AuthShowcase signup={signup} />
      </div>
    );
  return (
    <div className="auth-workspace auth-reference oct12-auth auth-studio staff-auth">
      <div className="auth-appearance">
        <AppearanceButton />
      </div>
      <div className="auth-layout">
        <div className="auth-access-panel">
          {formSection}
        </div>
      </div>
    </div>
  );
}
/** Quiet brand panel beside the form: an animated aurora and one line. */
function AuthShowcase({ signup }: { signup: boolean }) {
  const t = useT();
  const mode = signup ? "signup" : "signin";
  return (
    <aside className="ax-show" aria-label={t("au.show.label")}>
      <div className="ax-aurora" aria-hidden="true">
        <Aurora
          colorStops={["#1e40af", "#3b82f6", "#1d4ed8"]}
          amplitude={1.1}
          blend={0.55}
          speed={0.6}
          height={0.55}
          layers={2}
          mouseInteraction
        />
      </div>
      <div className="ax-show-copy">
        <span className="ax-brand-row">
          <strong>CollegeStat</strong>
          <em>Admissions</em>
        </span>
        <h2>{t(`au.show.${mode}.title`)}</h2>
        <p>{t(`au.show.${mode}.body`)}</p>
        <ol className="ax-steps">
          {([1, 2, 3] as const).map((n, i) => (
            <li key={n} className={i === 0 ? "is-on" : undefined}>
              <span>{n}</span>
              {t(`au.show.${mode}.s${n}`)}
            </li>
          ))}
        </ol>
      </div>
    </aside>
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
function GitHubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
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

/** Magic-link and OAuth return: exchange the code, then go where the code step would have gone. */
export function AuthCallback() {
  const router = useRouter(),
    params = useSearchParams(),
    t = useT(),
    ran = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const db = getSupabase(),
      code = params.get("code");
    if (params.get("error") || !db || !code) {
      setError(t("au.cb.expired"));
      return;
    }
    db.auth
      .exchangeCodeForSession(code)
      .then(({ data, error }) => {
        if (error || !data.session) {
          // PKCE keeps its verifier in this browser's storage: a link opened in a
          // mail app's own browser cannot finish, but the code in the email can.
          const lost = /verifier|flow state/i.test(error?.message || "") || error?.code === "flow_state_not_found";
          setError(t(lost ? "au.cb.browser" : "au.cb.expired"));
          return;
        }
        writeSessionHint(true);
        router.replace(
          postAuthDestination(params.get("next"), data.session.user, {
            recovery: params.get("next") === "/auth/reset-password",
          }),
        );
      })
      .catch(() => setError(t("au.err.network")));
  }, [params, router, t]);
  return (
    <div className="auth-callback">
      <Brand />
      <h1>{error ? t("au.cb.failed") : t("au.cb.working")}</h1>
      <p>{error || t("au.cb.working.body")}</p>
      {error && (
        <Link href="/auth/sign-in" className="button button-primary">
          {t("au.cb.retry")}
        </Link>
      )}
    </div>
  );
}
