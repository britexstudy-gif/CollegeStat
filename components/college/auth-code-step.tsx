"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { authErrorKey, classifyAuthError, cleanCode, MAX_CODE_ATTEMPTS, OTP_LENGTH, RESEND_SECONDS } from "@/lib/auth-errors";
import { useT } from "./i18n";

type Props = {
  email: string;
  /** Resolves when the code is accepted (the parent starts the redirect); rejects with the Supabase error. */
  verify: (code: string) => Promise<void>;
  /** Sends a fresh code. */
  resend: () => Promise<void>;
  onChangeEmail: () => void;
};

const slot =
  "size-12 rounded-xl border! border-[var(--ax-line)]! bg-[var(--ax-field)]! text-[var(--ax-ink)]! text-lg font-semibold shadow-none first:rounded-l-xl last:rounded-r-xl sm:size-14 sm:text-xl data-[active=true]:border-primary data-[active=true]:ring-primary/25";

/** Six-digit email code: autofocus, paste, auto-submit, mapped errors and a 60 s resend timer. */
export function AuthCodeStep({ email, verify, resend, onChangeEmail }: Props) {
  const t = useT();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "done">("idle");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [resent, setResent] = useState(false);
  const [sending, setSending] = useState(false);
  const [until, setUntil] = useState(() => Date.now() + RESEND_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);
  const locked = attempts >= MAX_CODE_ATTEMPTS;
  const left = Math.max(0, Math.ceil((until - now) / 1000));

  // autoFocus alone is skipped when hydrated, and the app's route-focus handler can claim focus just after mount.
  useEffect(() => {
    input.current?.focus();
    const id = setTimeout(() => {
      const a = document.activeElement;
      if (!a || a === document.body || a.id === "main") input.current?.focus();
    }, 300);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    if (left <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [left]);

  const submit = useCallback(
    async (value: string) => {
      if (status !== "idle" || locked || value.length !== OTP_LENGTH) return;
      setStatus("checking");
      setError("");
      setResent(false);
      try {
        await verify(value);
        setStatus("done");
      } catch (cause) {
        const next = attempts + 1;
        setAttempts(next);
        const kind = classifyAuthError(cause);
        setError(kind === "wrong_or_expired" && next >= MAX_CODE_ATTEMPTS ? t("au.err.locked") : t(authErrorKey(cause)));
        setCode("");
        setStatus("idle");
        requestAnimationFrame(() => input.current?.focus());
      }
    },
    [attempts, locked, status, t, verify],
  );

  const sendAgain = async () => {
    if (left > 0 || sending) return;
    setSending(true);
    setError("");
    try {
      await resend();
      setAttempts(0);
      setCode("");
      setResent(true);
      const start = Date.now();
      setNow(start);
      setUntil(start + RESEND_SECONDS * 1000);
      requestAnimationFrame(() => input.current?.focus());
    } catch (cause) {
      setError(t(authErrorKey(cause)));
      if (classifyAuthError(cause) === "email_limit" || classifyAuthError(cause) === "too_many") {
        const start = Date.now();
        setNow(start);
        setUntil(start + RESEND_SECONDS * 1000);
      }
    } finally {
      setSending(false);
    }
  };

  if (status === "done")
    return (
      <div className="grid justify-items-start gap-3 py-6" role="status" aria-live="polite">
        <CheckCircle2 size={34} className="text-emerald-600 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:fade-in duration-300" aria-hidden="true" />
        <h1 id="auth-title" className="m-0 text-[28px] font-semibold tracking-tight">{t("au.done.title")}</h1>
        <p className="m-0 flex items-center gap-2 text-[15px] text-[var(--ax-muted)]">
          <Spinner className="size-4" aria-label={t("au.done.body")} /> {t("au.done.body")}
        </p>
      </div>
    );

  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <div className="grid gap-5 text-left motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 duration-300" data-testid="auth-code-step">
      <div className="grid gap-2">
        <MailCheck size={28} className="text-[var(--ax-accent)]" aria-hidden="true" />
        <h1 id="auth-title" className="m-0 text-[28px] font-semibold leading-tight tracking-tight">{t("au.code.title")}</h1>
        <p className="m-0 text-[15px] leading-relaxed text-[var(--ax-muted)]">
          {t("au.code.body", { email })}
        </p>
      </div>
      <div className="grid gap-3">
        <InputOTP
          ref={input}
          autoFocus
          maxLength={OTP_LENGTH}
          value={code}
          onChange={(v) => {
            setCode(cleanCode(v));
            if (error) setError("");
          }}
          onComplete={(v) => void submit(cleanCode(v))}
          pasteTransformer={cleanCode}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          name="code"
          aria-label={t("au.code.label")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "auth-code-error" : undefined}
          disabled={status === "checking" || locked}
          className="outline-none! ring-0!"
          containerClassName="gap-2 sm:gap-3"
        >
          <InputOTPGroup className="gap-2 sm:gap-3">
            {Array.from({ length: OTP_LENGTH }, (_, i) => (
              <InputOTPSlot key={i} index={i} aria-invalid={error ? true : undefined} className={slot} />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <div className="min-h-6 text-sm" aria-live="polite">
          {status === "checking" ? (
            <span className="flex items-center gap-2 text-[var(--ax-muted)]"><Spinner className="size-4" aria-label={t("au.code.checking")} /> {t("au.code.checking")}</span>
          ) : error ? (
            <p id="auth-code-error" role="alert" className="m-0 font-medium text-destructive">{error}</p>
          ) : resent ? (
            <p className="m-0 text-emerald-700 dark:text-emerald-400">{t("au.code.resent")}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Button type="button" variant="link" className="h-auto p-0 text-[14.5px]" disabled={left > 0 || sending || status === "checking"} onClick={sendAgain}>
          {sending ? t("au.code.sending") : left > 0 ? t("au.code.resendIn", { time: clock }) : t("au.code.resend")}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="-ml-2 text-[var(--ax-muted)]" disabled={status === "checking"} onClick={onChangeEmail}>
          <ArrowLeft size={14} aria-hidden="true" /> {t("au.code.change")}
        </Button>
      </div>
      <p className="m-0 text-[13px] leading-relaxed text-[var(--ax-muted)]">{t("au.code.hint")}</p>
    </div>
  );
}
