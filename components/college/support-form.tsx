"use client";
import { useRef, useState, useEffect, useId } from "react";
import { ArrowRight, CheckCircle2, MessageSquareWarning } from "lucide-react";
import { useCollege } from "./provider";
import { useI18n } from "./i18n";
import { getSupabase } from "@/lib/supabase/client";
import { sendSupport } from "@/services/support-client";
import { reportedPath, type SupportInput } from "@/lib/support-requests";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import "@/app/support-inbox-oct12.css";

export function SupportForm({ issue = false, kind }: { issue?: boolean; kind?: "question" | "issue" | "correction" | "feedback" }) {
  const { t, lang } = useI18n();
  const account = useCollege();
  const countId = useId();
  const [draft, setDraft] = useState({
    kind: kind ?? (issue ? "issue" : "question"),
    name: "",
    email: "",
    subject: "",
    message: "",
    consent: false,
    website: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const pending = useRef<AbortController | null>(null);
  const retry = useRef<{ payload: string; id: string } | null>(null);
  useEffect(() => {
    const stop = account.accountScope.subscribe(() => {
      pending.current?.abort(
        new Error(t("sf.changed")),
      );
      retry.current = null;
      setDraft((old) => ({
        ...old,
        name: "",
        email: "",
        subject: "",
        message: "",
        consent: false,
      }));
      setReceipt("");
      setError("");
    });
    return () => {
      stop();
      pending.current?.abort();
    };
  }, [account.accountScope]);
  const field = (name: keyof typeof draft, value: string | boolean) => {
    setDraft((old) => ({ ...old, [name]: value }));
    setError("");
  };
  return (
    <form
      className="support-message-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          busy ||
          !account.authReady ||
          !account.accountScope.isOwner(account.user?.id ?? null)
        )
          return;
        const token = account.accountScope.capture();
        const controller = new AbortController();
        pending.current = controller;
        const page_path = issue
          ? reportedPath(window.location.pathname)
          : "/support";
        const payload = JSON.stringify({ ...draft, page_path });
        const id =
          retry.current?.payload === payload
            ? retry.current.id
            : crypto.randomUUID();
        retry.current = { payload, id };
        setBusy(true);
        setError("");
        try {
          const sent = await sendSupport(
            account.accountScope,
            token,
            { ...draft, id, page_path } as SupportInput,
            {
              fetch,
              session: async () => {
                const client = getSupabase();
                if (!client) return null;
                const { data, error } = await client.auth.getSession();
                return !error && data.session
                  ? {
                      owner: data.session.user.id,
                      token: data.session.access_token,
                    }
                  : null;
              },
            },
            controller.signal,
          );
          if (!account.accountScope.isCurrent(token)) return;
          setReceipt(sent.id);
          setDraft((old) => ({
            ...old,
            subject: "",
            message: "",
            consent: false,
          }));
          retry.current = null;
        } catch (failure) {
          if (account.accountScope.isCurrent(token))
            setError(
              failure instanceof Error
                ? failure.message
                : t("sf.failed"),
            );
        } finally {
          if (pending.current === controller) {
            pending.current = null;
            setBusy(false);
          }
        }
      }}
    >
      {receipt ? (
        <div className="support-message-success" role="status">
          <CheckCircle2 size={25} />
          <h3>{t("sf.done")}</h3>
          <p>{t("sf.done.text")}</p>
          <small>{t("sf.ref", { id: receipt })}</small>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setReceipt("")}
          >
            {t("sf.again")}
          </button>
        </div>
      ) : (
        <>
          <p className="support-message-intro">
            {t("sf.intro")}
          </p>
          <fieldset disabled={busy || !account.authReady}>
            <div className="support-message-fields">
              <label>
                {t("sf.type")}
                <select
                  value={draft.kind}
                  onChange={(e) => field("kind", e.target.value)}
                >
                  <option value="question">{t("sf.type.question")}</option>
                  <option value="issue">{t("sf.type.issue")}</option>
                  <option value="correction">{t("sf.type.correction")}</option>
                  <option value="feedback">{t("sf.type.feedback")}</option>
                </select>
              </label>
              <label>
                {/* One span keeps the hint inline; the label is a grid. */}
                <span>
                  {t("sf.name")} <small>{t("sf.optional")}</small>
                </span>
                <input
                  value={draft.name}
                  maxLength={100}
                  autoComplete="name"
                  onChange={(e) => field("name", e.target.value)}
                />
              </label>
            </div>
            <label>
              <span>
                {t("sf.email")} {account.user ? <small>{t("sf.optional")}</small> : null}
              </span>
              <input
                value={draft.email}
                required={!account.user}
                type="email"
                maxLength={254}
                autoComplete="email"
                placeholder="you@example.com"
                onChange={(e) => field("email", e.target.value)}
              />
            </label>
            <label>
              {t("sf.subject")}
              <input
                required
                minLength={5}
                maxLength={160}
                value={draft.subject}
                placeholder={t("sf.subject.ph")}
                onChange={(e) => field("subject", e.target.value)}
              />
            </label>
            <label>
              {t("sf.message")}
              <textarea
                required
                minLength={20}
                maxLength={5000}
                rows={5}
                aria-describedby={countId}
                value={draft.message}
                placeholder={t("sf.message.ph")}
                onChange={(e) => field("message", e.target.value)}
              />
            </label>
            <small id={countId}>
              {t("sf.count", { n: draft.message.length.toLocaleString(lang) })}
            </small>
            <div className="support-message-trap" aria-hidden="true">
              <label>
                Website
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={draft.website}
                  onChange={(e) => field("website", e.target.value)}
                />
              </label>
            </div>
            <label className="support-message-consent">
              <input
                required
                type="checkbox"
                checked={draft.consent}
                onChange={(e) => field("consent", e.target.checked)}
              />
              <span>
                {t("sf.consent")}
              </span>
            </label>
            <p className="support-message-note">
              {t("sf.note")}
            </p>
            <button className="button button-primary" type="submit">
              {busy ? t("sf.sending") : t("sf.send")}
              <ArrowRight size={17} />
            </button>
          </fieldset>
          {error && (
            <p className="support-message-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </form>
  );
}

export function ReportProblem() {
  const { t } = useI18n();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="workspace-report-button"
          aria-label={t("sf.type.issue")}
        >
          <MessageSquareWarning size={15} aria-hidden="true" />
          <span>{t("sf.type.issue")}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="workspace-report-dialog">
        <DialogHeader>
          <DialogTitle>{t("sf.report.title")}</DialogTitle>
          <DialogDescription>
            {t("sf.report.text")}
          </DialogDescription>
        </DialogHeader>
        <SupportForm issue />
      </DialogContent>
    </Dialog>
  );
}
