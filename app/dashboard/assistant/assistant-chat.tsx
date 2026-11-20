"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  History,
  RotateCcw,
  Square,
  SquarePen,
  Trash2,
  ExternalLink,
  CircleCheck,
  CircleDashed,
  CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Mascot } from "@/components/college/mascot";
import { ShiningText } from "@/components/ui/shining-text";
import { AIMark } from "@/components/college/ai-mark";
import { useI18n, type Translate } from "@/components/college/i18n";
import { useCollege } from "@/components/college/provider";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { getSupabase } from "@/lib/supabase/client";
import { recordActivity, useProgress } from "@/lib/progress-store";
import { utcDay } from "@/lib/student-progress";
import { effectivePlan, limitsOf } from "@/lib/plans";
import type { MessageKey } from "@/lib/i18n/messages";
import type {
  AssistantCard,
  AssistantError,
  AssistantEvent,
  AssistantToolName,
} from "@/lib/ai-assistant";
import { Markdown, citations } from "./markdown";
import { ResultCard, type CardState } from "./cards";
import { AiPaywall } from "@/components/college/ai-paywall";
import "./assistant.css";

/* ── Conversation model (kept in localStorage, this browser only) ───── */

type Step = {
  id: string;
  tool: AssistantToolName;
  args: Record<string, string>;
  status: "run" | "ok" | "fail";
  n?: number;
};
type Part =
  | { type: "text"; text: string }
  | { type: "steps"; steps: Step[] }
  | { type: "card"; card: AssistantCard; state?: CardState };
type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts?: Part[];
  error?: AssistantError;
  stopped?: boolean;
};
type Thread = { id: string; title: string; updated: number; messages: Msg[] };

const STORE = "collegestat-ai-threads";
const MAX_THREADS = 20;
const uid = () => Math.random().toString(36).slice(2, 10);
const DEV = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

function loadThreads(): Thread[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "[]");
    return Array.isArray(raw)
      ? raw.filter((t) => t && Array.isArray(t.messages)).slice(0, MAX_THREADS)
      : [];
  } catch {
    return [];
  }
}
function saveThreads(threads: Thread[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(threads.slice(0, MAX_THREADS)));
  } catch {}
}

/** The model ends each answer with "FOLLOWUPS: a | b | c". Split it off; while streaming, also
 * hide a last line that is only the start of that marker, so it never flashes. */
const MARK = "FOLLOWUPS:";
function splitFollowups(text: string): { body: string; followups: string[] } {
  const i = text.lastIndexOf(MARK);
  if (i >= 0)
    return {
      body: text.slice(0, i).trimEnd(),
      followups: text
        .slice(i + MARK.length)
        .split("|")
        .map((x) => x.trim().replace(/^["“]|["”]$/g, ""))
        .filter((x) => x.length > 2 && x.length < 140)
        .slice(0, 3),
    };
  const nl = text.lastIndexOf("\n");
  const tail = text.slice(nl + 1).trim();
  if (tail && MARK.startsWith(tail)) return { body: text.slice(0, nl + 1).trimEnd(), followups: [] };
  return { body: text, followups: [] };
}

const rawTextOf = (m: Msg) =>
  m.role === "user"
    ? m.content
    : (m.parts || [])
        .flatMap((p) => (p.type === "text" ? [p.text] : []))
        .join("")
        .trim();
const textOf = (m: Msg) => (m.role === "user" ? m.content : splitFollowups(rawTextOf(m)).body);
const followupsOf = (m: Msg) => (m.role === "user" ? [] : splitFollowups(rawTextOf(m)).followups);

/** What the model sees of an earlier answer: its text plus the records its cards showed, so "add the first one" still works. */
function historyContent(m: Msg) {
  if (m.role === "user") return m.content;
  const shown = (m.parts || []).flatMap((p) => {
    if (p.type !== "card") return [];
    const c = p.card;
    if (c.kind === "universities")
      return c.items.map((u) => `${u.name} (slug ${u.slug})`);
    if (c.kind === "compare")
      return c.columns.map((u) => `${u.name} (slug ${u.slug})`);
    if (c.kind === "scholarships") return c.items.map((s) => s.name);
    if (c.kind === "add")
      return [
        `Proposed adding ${c.university.name}: ${p.state === "confirmed" ? "confirmed" : p.state === "dismissed" ? "dismissed" : "not confirmed yet"}`,
      ];
    if (c.kind === "plan")
      return [
        `Proposed a ${c.items.length}-date plan: ${p.state === "confirmed" ? "confirmed" : "not confirmed yet"}`,
      ];
    if (c.kind === "task_edit")
      return [`Proposed ${c.items.length} plan change(s): ${p.state === "confirmed" ? "confirmed" : "not confirmed yet"}`];
    return [];
  });
  const text = textOf(m) || "(no text)";
  return (
    shown.length
      ? `${text}\n\n[Cards shown: ${shown.slice(0, 12).join("; ")}]`
      : text
  ).slice(0, 12000);
}

/** A university already shown in an earlier card of the same answer is not shown again; a card
 * left empty by that is dropped (null keeps part indexes stable for card state). */
function dedupeCards(parts: Part[]): (Part | null)[] {
  const seen = new Set<string>();
  return parts.map((p) => {
    if (p.type !== "card" || p.card.kind !== "universities") return p;
    const items = p.card.items.filter((u) => !seen.has(u.id));
    items.forEach((u) => seen.add(u.id));
    return items.length ? { ...p, card: { ...p.card, items } } : null;
  });
}

/* ── Step labels ─────────────────────────────────────────────────────── */

function stepLabel(t: Translate, s: Step) {
  const a = s.args;
  switch (s.tool) {
    case "search_universities":
      return a.where
        ? t("ai.step.search.where", { where: a.where })
        : t("ai.step.search");
    case "find_scholarships":
      return a.where
        ? t("ai.step.scholarships.where", { where: a.where })
        : t("ai.step.scholarships");
    case "get_university":
      return t("ai.step.university");
    case "compare":
      return t("ai.step.compare", { n: a.n || "2" });
    case "get_profile":
      return t("ai.step.profile");
    case "estimate_chance":
      return t("ai.step.chance");
    case "add_to_my_colleges":
      return t("ai.step.add");
    case "create_deadline_plan":
      return t("ai.step.plan");
    case "review_essay":
      return t("ai.step.essay");
    case "scam_check":
      return t("ai.step.scam");
    case "open_page":
      return t("ai.step.open");
    case "add_tasks":
      return t("ai.step.tasks");
    case "list_tasks":
      return t("ai.step.tasklist");
    case "update_task":
    case "complete_task":
      return t("ai.step.taskedit");
    case "show_chart":
      return t("ai.step.chart");
    case "make_quiz":
      return t("ai.step.quiz");
    case "web_lookup":
      return t("ai.step.web");
    default:
      return t("ai.thinking");
  }
}

function Steps({
  steps,
  live,
  t,
}: {
  steps: Step[];
  live: boolean;
  t: Translate;
}) {
  const running = steps.find((s) => s.status === "run");
  return (
    <Collapsible className="asx-steps">
      <CollapsibleTrigger className="asx-steps-trigger">
        {live && running ? (
          <ShiningText as="span" text={stepLabel(t, running) + "…"} />
        ) : (
          <span>
            {steps.length === 1
              ? stepLabel(t, steps[0])
              : t("ai.steps", { n: steps.length })}
          </span>
        )}
        <ChevronDown size={14} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="asx-step-list">
          {steps.map((s) => (
            <li key={s.id} className={"is-" + s.status}>
              {s.status === "run" ? (
                <CircleDashed size={14} aria-hidden="true" />
              ) : s.status === "ok" ? (
                <CircleCheck size={14} aria-hidden="true" />
              ) : (
                <CircleAlert size={14} aria-hidden="true" />
              )}
              <span>{stepLabel(t, s)}</span>
              {s.status !== "run" && (
                <em>
                  {s.status === "fail"
                    ? t("ai.step.failed")
                    : s.n != null &&
                        ![
                          "get_profile",
                          "estimate_chance",
                          "add_to_my_colleges",
                          "get_university",
                          "review_essay",
                        ].includes(s.tool)
                      ? t("ai.step.found", { n: s.n })
                      : ""}
                </em>
              )}
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** "3 of 5 today": AI answers on this account today against the plan's daily allowance. */
function AiAllowance() {
  const { t } = useI18n();
  const { user, profile } = useCollege();
  const { events } = useProgress(user?.id);
  const today = utcDay();
  const used = events.filter((e) => e.kind === "ai" && e.day === today).length;
  const max = limitsOf(effectivePlan(profile?.preferences)).aiPerDay;
  if (!user) return null;
  return (
    <Link
      href="/dashboard/plans"
      className="asx-allowance"
      title={t("d3.ai.allowance.hint")}
    >
      {t("d3.ai.allowance", { n: Math.min(used, max), max })}
    </Link>
  );
}

/* ── The chat ────────────────────────────────────────────────────────── */

const ERR: Record<AssistantError, MessageKey> = {
  signin: "ai.err.signin",
  quota: "ai.err.quota",
  busy: "ai.err.busy",
  timeout: "ai.err.timeout",
  failed: "ai.err.failed",
  offline: "ai.err.offline",
  invalid: "ai.err.failed",
};

/** The clock, read outside render purity checks (the thread list groups by today/yesterday). */
const nowMs = () => Date.now();

export function AssistantChat({ connected }: { connected: boolean }) {
  const { t, lang } = useI18n();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [current, setCurrent] = useState<string>("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const devMode = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const list = loadThreads();
    try {
      devMode.current = DEV ? localStorage.getItem("cs-ai-dev") : null;
    } catch {}
    const params = new URLSearchParams(window.location.search);
    const prompt = params.get("ask") || params.get("prompt");
    queueMicrotask(() => {
      if (!alive) return;
      setThreads(list);
      if (prompt) setText(prompt.slice(0, 4000));
    });
    return () => {
      alive = false;
    };
  }, []);

  const thread = threads.find((th) => th.id === current);
  const messages = useMemo(() => thread?.messages || [], [thread]);

  const update = useCallback(
    (id: string, fn: (msgs: Msg[]) => Msg[], title?: string) => {
      setThreads((list) => {
        const existing = list.find((th) => th.id === id);
        const next: Thread = existing
          ? {
              ...existing,
              messages: fn(existing.messages),
              updated: Date.now(),
            }
          : { id, title: title || "…", updated: Date.now(), messages: fn([]) };
        const out = [next, ...list.filter((th) => th.id !== id)];
        saveThreads(out);
        return out;
      });
    },
    [],
  );

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [text]);

  // Follow the answer while it streams, unless the student scrolled up.
  const onScroll = () => {
    const el = body.current;
    if (el)
      stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
  };
  useEffect(() => {
    const el = body.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [current]);

  const ask = async (threadId: string, history: Msg[]) => {
    const answerId = uid();
    const patch = (fn: (m: Msg) => Msg) =>
      update(threadId, (msgs) =>
        msgs.map((m) => (m.id === answerId ? fn(m) : m)),
      );
    update(threadId, (msgs) => [
      ...msgs,
      { id: answerId, role: "assistant", content: "", parts: [] },
    ]);
    const apply = (e: AssistantEvent) =>
      patch((m) => {
        const parts = [...(m.parts || [])];
        const last = parts[parts.length - 1];
        if (e.t === "text") {
          if (last?.type === "text")
            parts[parts.length - 1] = { type: "text", text: last.text + e.d };
          else if (e.d.trim()) parts.push({ type: "text", text: e.d });
        } else if (e.t === "step") {
          const step: Step = {
            id: e.id,
            tool: e.tool,
            args: e.args,
            status: "run",
          };
          if (last?.type === "steps")
            parts[parts.length - 1] = {
              type: "steps",
              steps: [...last.steps, step],
            };
          else parts.push({ type: "steps", steps: [step] });
        } else if (e.t === "step_done") {
          for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            if (p.type === "steps" && p.steps.some((s) => s.id === e.id))
              parts[i] = {
                type: "steps",
                steps: p.steps.map((s) =>
                  s.id === e.id
                    ? { ...s, status: e.ok ? "ok" : "fail", n: e.n }
                    : s,
                ),
              };
          }
        } else if (e.t === "card") parts.push({ type: "card", card: e.card });
        else if (e.t === "error") return { ...m, parts, error: e.code };
        return { ...m, parts };
      });

    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    stick.current = true;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (devMode.current === "script" || devMode.current === "model")
        headers["x-cs-ai-dev"] = devMode.current;
      else {
        const token = (await getSupabase()?.auth.getSession())?.data.session
          ?.access_token;
        if (!token)
          throw Object.assign(new Error("signin"), { code: "signin" as const });
        headers.Authorization = "Bearer " + token;
      }
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          language: lang,
          messages: history
            .filter((m) => !m.error || textOf(m))
            .slice(-16)
            .map((m) => ({ role: m.role, content: historyContent(m) }))
            .filter((m) => m.content.trim()),
        }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const code =
          (["signin", "quota", "offline", "invalid"] as const).find(
            (c) => c === data.error,
          ) || (res.status === 429 ? "quota" : "failed");
        apply({ t: "error", code });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            apply(JSON.parse(line) as AssistantEvent);
          } catch {}
        }
      }
      void recordActivity("ai", "assistant:" + answerId);
    } catch (e) {
      if (controller.signal.aborted)
        patch((m) => ({
          ...m,
          stopped: true,
          parts: (m.parts || []).map((p) =>
            p.type === "steps"
              ? {
                  ...p,
                  steps: p.steps.map((s) =>
                    s.status === "run" ? { ...s, status: "fail" as const } : s,
                  ),
                }
              : p,
          ),
        }));
      else
        apply({
          t: "error",
          code: (e as { code?: AssistantError }).code || "failed",
        });
    } finally {
      abort.current = null;
      setBusy(false);
    }
  };

  const send = (message: string) => {
    const content = message.trim().slice(0, 12000);
    if (!content || busy || !connected) return;
    const id = current || uid();
    if (!current) setCurrent(id);
    const user: Msg = { id: uid(), role: "user", content };
    update(id, (msgs) => [...msgs, user], content.slice(0, 80));
    setText("");
    void ask(id, [...messages, user]);
  };

  const retry = () => {
    if (busy || !thread) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const idx = messages.lastIndexOf(lastUser);
    const kept = messages.slice(0, idx + 1);
    update(thread.id, () => kept);
    void ask(thread.id, kept);
  };

  const copy = async (m: Msg) => {
    try {
      await navigator.clipboard.writeText(textOf(m));
      setCopied(m.id);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {}
  };

  const setCardState = (msgId: string, partIndex: number, state: CardState) =>
    update(current, (msgs) =>
      msgs.map((m) =>
        m.id === msgId
          ? {
              ...m,
              parts: m.parts?.map((p, i) =>
                i === partIndex && p.type === "card" ? { ...p, state } : p,
              ),
            }
          : m,
      ),
    );

  const newChat = () => {
    abort.current?.abort();
    setCurrent("");
    setText("");
    box.current?.focus();
  };

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  // Out of AI credits: open the paywall once for that answer.
  const [paywallClosed, setPaywallClosed] = useState<unknown>(null);
  const [paywallFor, setPaywallFor] = useState<unknown>(null);
  const paywallOpen = paywallFor != null || (lastAssistant?.error === "quota" && paywallClosed !== lastAssistant);
  const closePaywall = () => {
    setPaywallClosed(lastAssistant);
    setPaywallFor(null);
  };

  /** Saved chats, newest first: the side list on wide screens and the sheet on phones. */
  const threadGroups = useMemo(() => {
    const day = (ms: number) => new Date(ms).toDateString();
    const now = nowMs();
    const today = day(now), yesterday = day(now - 86400000);
    const groups: { key: string; label: string; items: Thread[] }[] = [];
    for (const th of threads) {
      const d = day(th.updated);
      const key = d === today ? "today" : d === yesterday ? "yesterday" : "earlier";
      let g = groups.find((x) => x.key === key);
      if (!g) groups.push((g = { key, label: t(("ai.h." + key) as MessageKey), items: [] }));
      g.items.push(th);
    }
    return groups;
  }, [threads, t]);

  const threadList = (close?: () => void) =>
    threads.length ? (
      <div className="asx-groups">
        {threadGroups.map((g) => (
          <div key={g.key}>
            <p className="asx-threads-label">{g.label}</p>
            <ul>
              {g.items.map((th) => (
                <li key={th.id} className={th.id === current ? "is-current" : ""}>
                  <button
                    type="button"
                    onClick={() => {
                      if (busy) abort.current?.abort();
                      setCurrent(th.id);
                      close?.();
                    }}
                  >
                    <span>{th.title}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("ai.history.delete")}
                    onClick={() =>
                      setThreads((list) => {
                        const out = list.filter((x) => x.id !== th.id);
                        saveThreads(out);
                        if (th.id === current) setCurrent("");
                        return out;
                      })
                    }
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    ) : (
      <p className="asx-muted asx-history-empty">{t("ai.history.empty")}</p>
    );

  return (
    <div className="asx-shell">
      <section
        className={"asx" + (messages.length ? " has-thread" : " is-fresh")}
        aria-labelledby="asx-title"
      >
        <div className="asx-backdrop" aria-hidden="true" />
        {paywallOpen ? <AiPaywall onClose={closePaywall} /> : null}
        <header className="asx-head">
          <AIMark tile size={30} thinking={busy} />
          <h1 id="asx-title">{t("ai.title")}</h1>
          <div className="asx-head-actions">
            <AiAllowance />
            <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="asx-history-btn"
                  aria-label={t("ai.history")}
                  title={t("ai.history")}
                >
                  <History size={17} aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={8} className="asx-history-pop">
                <p className="asx-history-title">{t("ai.history")}</p>
                {threadList(() => setHistoryOpen(false))}
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={newChat}
              aria-label={t("ai.new")}
              title={t("ai.new")}
              disabled={!messages.length}
            >
              <SquarePen size={17} aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div
          className="asx-body"
          ref={body}
          onScroll={onScroll}
          aria-live="polite"
          aria-busy={busy}
        >
          {!messages.length ? (
            <div className="asx-empty">
              <Mascot size={112} />
              <h2>{t("ai.hello")}</h2>
              <p className="asx-muted">{t("ai.sub")}</p>
            </div>
          ) : (
            messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="asx-user">
                  <p>{m.content}</p>
                </div>
              ) : (
                <article key={m.id} className="asx-answer">
                  {dedupeCards(m.parts || []).map((p, i) =>
                    p === null ? null : p.type === "text" ? (
                      splitFollowups(p.text).body ? (
                        <div key={i} className="asx-md">
                          <Markdown text={splitFollowups(p.text).body} />
                        </div>
                      ) : null
                    ) : p.type === "steps" ? (
                      <Steps
                        key={i}
                        steps={p.steps}
                        live={busy && m === lastAssistant}
                        t={t}
                      />
                    ) : (
                      <ResultCard
                        key={i}
                        card={p.card}
                        state={p.state}
                        onState={(s) => setCardState(m.id, i, s)}
                        lang={lang}
                      />
                    ),
                  )}
                  {busy && m === lastAssistant && !(m.parts || []).length && (
                    <ShiningText
                      as="span"
                      text={t("ai.thinking")}
                      className="asx-thinking"
                    />
                  )}
                  {m.error && (
                    <p className="asx-error" role="alert">
                      {t(ERR[m.error])}
                      {m.error === "quota" && (
                        <>
                          {" "}
                          <button type="button" className="asx-link" onClick={() => setPaywallFor(m)}>
                            {t("pw.ai.open")}
                          </button>
                        </>
                      )}
                      {m.error === "signin" && (
                        <>
                          {" "}
                          <Link href="/auth/sign-in" className="asx-link">
                            {t("ai.signin")}
                          </Link>
                        </>
                      )}
                    </p>
                  )}
                  {m.stopped && <p className="asx-muted">{t("ai.stopped")}</p>}
                  {!(busy && m === lastAssistant) && (
                    <>
                      {citations(textOf(m)).filter((c) => !c.href.startsWith("/")).length > 0 && (
                        <ul className="asx-cites" aria-label={t("ai.sources")}>
                          {citations(textOf(m)).filter((c) => !c.href.startsWith("/")).map((c) => (
                            <li key={c.href}>
                              {c.href.startsWith("/") ? (
                                <Link href={c.href}>{c.label}</Link>
                              ) : (
                                <a
                                  href={c.href}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                >
                                  <ExternalLink size={11} aria-hidden="true" />{" "}
                                  {hostOf(c.href)}
                                </a>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {m === lastAssistant && followupsOf(m).length > 0 && (
                        <div className="asx-follow">
                          {followupsOf(m).map((f) => (
                            <button key={f} type="button" disabled={!connected || busy} onClick={() => send(f)}>
                              <ArrowUp size={13} aria-hidden="true" className="asx-follow-icon" />
                              {f}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="asx-tools">
                        {textOf(m) && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void copy(m)}
                            aria-label={t("ai.copy")}
                            title={
                              copied === m.id ? t("ai.copied") : t("ai.copy")
                            }
                          >
                            {copied === m.id ? (
                              <Check size={15} aria-hidden="true" />
                            ) : (
                              <Copy size={15} aria-hidden="true" />
                            )}
                          </Button>
                        )}
                        {m === lastAssistant && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={retry}
                            aria-label={t("ai.retry")}
                            title={t("ai.retry")}
                          >
                            <RotateCcw size={15} aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </article>
              ),
            )
          )}
        </div>

        <div className="asx-dock">
          <form
            className="asx-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <textarea
              ref={box}
              rows={1}
              value={text}
              maxLength={12000}
              aria-label={t("ai.placeholder")}
              placeholder={
                connected ? t("ai.placeholder") : t("ai.err.offline")
              }
              disabled={!connected}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send(text);
                }
              }}
            />
            {busy ? (
              <Button
                type="button"
                size="icon"
                className="rounded-full"
                onClick={() => abort.current?.abort()}
                aria-label={t("ai.stop")}
                title={t("ai.stop")}
              >
                <Square size={13} fill="currentColor" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                className="rounded-full"
                disabled={!connected || !text.trim()}
                aria-label={t("ai.send")}
              >
                <ArrowUp size={18} aria-hidden="true" />
              </Button>
            )}
          </form>
          <p className="asx-note">{t("ai.note")}</p>
        </div>
      </section>
    </div>
  );
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
