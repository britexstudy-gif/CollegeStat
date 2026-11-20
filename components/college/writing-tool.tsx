"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ALargeSmall,
  Bot,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  History,
  LayoutGrid,
  Lightbulb,
  List,
  ListTree,
  Maximize2,
  MessageSquareQuote,
  Minimize2,
  PanelLeft,
  PanelRight,
  Pause,
  PenSquare,
  Play,
  Plus,
  Quote,
  Redo2,
  Save,
  ScanText,
  Sparkles,
  SquareDashed,
  Timer,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { z } from "zod";
import { recordActivity } from "@/lib/progress-store";
import {
  countText,
  essayType,
  essayTypes,
  joinSections,
  splitSections,
  type EssayType,
} from "@/lib/essay-types";
import { findQuote, MAX_REVIEW_TEXT } from "@/lib/essay-review";
import { docType, docUniversity, universityEssays, type UniversityEssays } from "@/lib/university-essays";
import type { PlatformData, PlatformUniversity } from "@/lib/application-platforms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EssayReviewPanel, requestEssayReview, type AnchoredComment, type StoredReview } from "./writing-review";
import { diffWords } from "@/lib/text-diff";
import { legacyWritingFormats, type WritingFormat, type WritingVersion } from "@/lib/student-writing";
import { loadWritingVersions, removeWritingVersion, saveWritingVersion } from "@/services/student-writing";
import type { AccountScope } from "@/lib/account-owner";
import { getSupabase } from "@/lib/supabase/client";
import { studentAIReply, type StudentAIResult } from "@/lib/student-ai";
import { ShiningText } from "@/components/ui/shining-text";
import { useI18n, useT, type Translate } from "./i18n";
import type { Lang } from "@/lib/i18n/languages";
import type { MessageKey } from "@/lib/i18n/messages";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CountRing, DeskArt, Tip, TypeIcon, TypeTile } from "./writing-desk";
import "./writing-tool.css";
import "./writing-notion.css";
import "./writing-desk.css";

type Draft = {
  body: string;
  prompt: number;
  /** The exact prompt pasted by the student (a university's own question). */
  customPrompt?: string;
  mode?: "self" | "ai";
  outline?: string;
  chat?: ChatMsg[];
  /** The last AI review of this draft. */
  review?: StoredReview;
  /** The student marked this essay as finished. */
  final?: boolean;
  /** Last time the text changed (ISO). */
  updated?: string;
};
type DraftStatus = "draft" | "reviewed" | "final";
const statusOf = (d?: Draft): DraftStatus => (d?.final ? "final" : d?.review ? "reviewed" : "draft");
/** A commented range in the editor. */
type Mark = { start: number; end: number; kind: string; id: number; on: boolean };
type ChatMsg = { role: "user" | "assistant"; content: string };
type Version = WritingVersion & { local?: boolean };
type Panel = "coach" | "feedback" | "guide" | "history";
/** A "/" command: inserts text at the caret, runs an action, or both. */
type SlashCommand = { id: string; label: string; hint: string; icon: LucideIcon; insert?: string; run?: () => void };

/** Editor text sizes the "text size" button cycles through. */
const SIZES = [16, 17.5, 20];
const GROUP_KEY: Record<EssayType["group"], MessageKey> = {
  Undergraduate: "wd.group.undergraduate",
  Graduate: "wd.group.graduate",
  "Scholarships & letters": "wd.group.letters",
};

/** Sends text to the student AI for questions and suggestions (never a rewrite). */
async function askStudentAI(text: string, language: Lang, fallback: string): Promise<StudentAIResult> {
  const session = await getSupabase()?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error(fallback);
  const res = await fetch("/api/student-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ mode: "essay_feedback", text: text.slice(0, 8000), consent: true, language }),
  });
  const data = await res.json();
  if (!res.ok) {
    const f = z.object({ error: z.string() }).safeParse(data);
    throw new Error(f.success ? f.data.error : fallback);
  }
  void recordActivity("ai", "essay:" + Date.now().toString(36));
  return studentAIReply.parse(data).result;
}

const DRAFTS = (owner: string) => "collegestat-writing:" + owner;
const LOCAL_VERSIONS = (owner: string) => "collegestat-writing-versions:" + owner;
const readJSON = <T,>(key: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(key) || "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
};

/** Application writing desk: every common essay type plus the essays each
 * saved university needs, a calm editor with prompts and limits, AI review
 * with comments tied to the text, and version history. Drafts autosave on this
 * device; versions save to the student's private account. */
export function WritingTool({
  owner,
  accountScope,
  active,
  addTask,
  universities = [],
}: {
  owner: string;
  accountScope: AccountScope;
  active: boolean;
  addTask: (title: string) => Promise<boolean>;
  /** Saved universities: their essays are listed first. */
  universities?: PlatformUniversity[];
}) {
  const { lang } = useI18n();
  const [docId, setDocId] = useState(essayTypes[0].id);
  const typeId = docType(docId);
  const type = essayType(typeId);
  const uni = universities.find((u) => u.id === docUniversity(docId));
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loaded, setLoaded] = useState(false);
  const [panel, setPanel] = useState<Panel>("feedback");
  const [launch, setLaunch] = useState(false);
  const [focus, setFocus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [compare, setCompare] = useState<Version | null>(null);
  const [savedBody, setSavedBody] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [navOpen, setNavOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [size, setSize] = useState(1);
  const [review, setReview] = useState<{ busy: boolean; error: string }>({ busy: false, error: "" });
  const [activeComment, setActiveComment] = useState<number | null>(null);
  const [platformData, setPlatformData] = useState<PlatformData | undefined>();
  const activeArea = useRef(0);
  const history = useRef<{ id: string; past: string[]; future: string[]; at: number }>({ id: "", past: [], future: [], at: 0 });
  // Undo/redo availability mirrors the ref above so rendering never reads it.
  const [avail, setAvail] = useState({ id: "", undo: false, redo: false });
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const [passage, setPassage] = useState<string | null>(null);
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const reviewing = useRef(false);
  const t = useT();

  // Platform data (which essays each university needs) loads only when there are universities.
  useEffect(() => {
    if (!universities.length || platformData) return;
    let alive = true;
    void import("./application-practice/platform-data.json").then((m) => alive && setPlatformData(m.default as unknown as PlatformData));
    return () => {
      alive = false;
    };
  }, [universities.length, platformData]);
  const plans = useMemo(() => universities.map((u) => universityEssays(u, platformData)), [universities, platformData]);

  // Load local drafts once.
  useEffect(() => {
    let alive = true;
    const saved = readJSON<Record<string, Draft>>(DRAFTS(owner), {});
    queueMicrotask(() => {
      if (!alive) return;
      setDrafts(saved && typeof saved === "object" ? saved : {});
      setLoaded(true);
      // ?doc=why_us@<id> (from the application practice) opens that essay.
      const asked = new URLSearchParams(window.location.search).get("doc") || "";
      if (asked && essayTypes.some((x) => x.id === docType(asked))) setDocId(asked);
      else if (!Object.values(saved || {}).some((d) => d?.body?.trim())) setLaunch(true);
    });
    return () => {
      alive = false;
    };
  }, [owner]);
  // Autosave on this device shortly after typing stops.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFTS(owner), JSON.stringify(drafts));
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [drafts, owner, loaded]);

  const draft = drafts[docId] || { body: "", prompt: 0 };
  const patch = (change: Partial<Draft>, id = docId) =>
    setDrafts((d) => ({
      ...d,
      [id]: { ...(d[id] || { body: "", prompt: 0 }), ...change, ...(change.body !== undefined ? { updated: new Date().toISOString() } : null) },
    }));
  const parts = type.sections ? splitSections(type, draft.body) : [draft.body];
  const fullText = type.sections ? parts.join("\n\n") : draft.body;
  // Commands run from the "/" menu are created in an earlier render; they read
  // the newest text from here so "/save" is not saved along with the draft.
  const latestBody = useRef(draft.body);
  useLayoutEffect(() => {
    latestBody.current = draft.body;
  });
  // Own undo history: slash commands and toolbar edits change the text from
  // code, which the browser's built-in undo does not follow. Typing groups into
  // one step per pause; `boundary` edits (commands, bullet, note, restore) are
  // always their own step.
  const syncAvail = () => {
    const h = history.current;
    setAvail({ id: h.id, undo: h.past.length > 0, redo: h.future.length > 0 });
  };
  const setBody = (body: string, boundary = false) => {
    if (body === draft.body) return;
    const h = history.current;
    if (h.id !== docId) Object.assign(h, { id: docId, past: [], future: [], at: 0 });
    const now = nowMs();
    if (boundary || now - h.at > 700 || !h.past.length) {
      h.past.push(draft.body);
      if (h.past.length > 200) h.past.shift();
    }
    h.at = boundary ? 0 : now;
    h.future = [];
    syncAvail();
    patch({ body });
  };
  const stepHistory = (direction: "undo" | "redo") => {
    const h = history.current;
    if (h.id !== docId) return;
    const from = direction === "undo" ? h.past : h.future;
    const to = direction === "undo" ? h.future : h.past;
    const body = from.pop();
    if (body === undefined) return;
    to.push(draft.body);
    h.at = 0;
    syncAvail();
    patch({ body });
    // Put the caret where the text changed rather than at the very end.
    const el = refs.current[0];
    if (!type.sections && el) {
      let at = 0;
      while (at < body.length && body[at] === draft.body[at]) at++;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(at, at);
      });
    }
  };
  const setPart = (i: number, value: string, boundary = false) => {
    const next = [...parts];
    next[i] = value;
    setBody(joinSections(type, next), boundary);
  };

  // Version history: account versions plus any saved on this device. Essays
  // for one university keep their versions on this device.
  const perUniversity = docId.includes("@");
  const loadVersions = useCallback(async () => {
    const local = readJSON<Version[]>(LOCAL_VERSIONS(owner), []).filter((v) => v.format === docId);
    let remote: Version[] = [];
    if (!docId.includes("@") && accountScope.isOwner(owner))
      remote = await loadWritingVersions(accountScope, docId as WritingFormat, 0).catch(() => []);
    return [...remote, ...local].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [accountScope, owner, docId]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void loadVersions().then((list) => alive && setVersions(list));
    return () => {
      alive = false;
    };
  }, [active, loadVersions]);

  const count = countText(type.sections && type.sharedLimit ? parts.join("") : fullText, type.limit.unit);
  const isSaved = !!draft.body.trim() && savedBody[docId] === draft.body;

  const save = async () => {
    const body = latestBody.current;
    if (saving || !body.trim()) return;
    setSaving(true);
    setNotice(null);
    const version: Version = {
      id: crypto.randomUUID(),
      user_id: owner,
      format: docId as WritingFormat,
      body,
      created_at: new Date().toISOString(),
    };
    try {
      if (perUniversity) throw new Error("device");
      await saveWritingVersion(accountScope, { id: version.id, format: version.format, body: version.body });
      toast.success(t("wd.save.account"));
    } catch (error) {
      if (!perUniversity && legacyWritingFormats.includes(typeId)) {
        setNotice({ text: error instanceof Error ? error.message : t("wd.save.error"), error: true });
        setSaving(false);
        return;
      }
      // Newer essay types, university essays and signed-out previews keep the version on this device.
      const list = readJSON<Version[]>(LOCAL_VERSIONS(owner), []);
      try {
        localStorage.setItem(LOCAL_VERSIONS(owner), JSON.stringify([{ ...version, local: true }, ...list].slice(0, 200)));
      } catch {}
      toast.success(t("wd.save.device"));
    }
    setSavedBody((s) => ({ ...s, [docId]: body }));
    void recordActivity("writing", typeId);
    setVersions(await loadVersions());
    setSaving(false);
  };
  const removeVersion = async (v: Version) => {
    if (!window.confirm(t("wd.history.remove.confirm"))) return;
    if (v.local) {
      const list = readJSON<Version[]>(LOCAL_VERSIONS(owner), []).filter((x) => x.id !== v.id);
      try {
        localStorage.setItem(LOCAL_VERSIONS(owner), JSON.stringify(list));
      } catch {}
    } else await removeWritingVersion(accountScope, v.id).catch(() => {});
    setCompare(null);
    setVersions(await loadVersions());
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([fullText], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `collegestat-${docId.replace("@", "-")}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Cmd/Ctrl+S saves.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const groups = [...new Set(essayTypes.map((t) => t.group))];
  const listedPrompt = type.prompts?.[Math.min(draft.prompt, (type.prompts?.length || 1) - 1)];
  const prompt = draft.customPrompt?.trim() || (perUniversity && typeId === "why_us" ? undefined : listedPrompt);
  const docName = (id: string) => {
    const u = universities.find((x) => x.id === docUniversity(id));
    return essayType(docType(id)).name + (u ? " · " + u.name : "");
  };

  const status: "empty" | "over" | "ok" | "draft" = !draft.body.trim() ? "empty" : count > type.limit.max ? "over" : count >= type.limit.min ? "ok" : "draft";
  const openPanel = (next: Panel) => {
    setPanel(next);
    setRailOpen(true);
    setFocus(false);
  };
  const pick = (id: string) => {
    setDocId(id);
    setCompare(null);
    setNotice(null);
    setPassage(null);
    setActiveComment(null);
    setReview({ busy: false, error: "" });
  };

  // AI review: comments are found again in the current text on every render,
  // so they follow edits and drop out once their words are gone.
  const stored = draft.review || null;
  const comments: AnchoredComment[] = useMemo(() => {
    if (!stored) return [];
    return stored.result.comments
      .map((c, index) => {
        for (let area = 0; area < parts.length; area++) {
          const range = findQuote(parts[area] || "", c.quote);
          if (range) return { ...c, index, range, area };
        }
        return { ...c, index, range: null, area: 0 };
      })
      .sort((a, b) => a.area - b.area || (a.range?.start ?? Infinity) - (b.range?.start ?? Infinity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored, draft.body, typeId]);
  const marksFor = (area: number): Mark[] =>
    comments
      .filter((c) => c.area === area && c.range)
      .map((c) => ({ start: c.range!.start, end: c.range!.end, kind: c.kind, id: c.index, on: c.index === activeComment }));
  const words = fullText.trim() ? fullText.trim().split(/\s+/).length : 0;
  const reviewReady = fullText.trim().length >= 80 && words >= 30;
  const runReview = async () => {
    if (reviewing.current) return;
    if (!reviewReady) return void toast(t("ws.review.short"));
    reviewing.current = true;
    const id = docId;
    const text = fullText;
    setReview({ busy: true, error: "" });
    openPanel("feedback");
    setPassage(null);
    try {
      const result = await requestEssayReview(
        {
          text: text.slice(0, MAX_REVIEW_TEXT),
          essay_type: type.name,
          prompt: type.sections ? type.sections.map((s) => s.label).join(" / ") : prompt || "",
          limit: `${type.limit.min}–${type.limit.max} ${type.limit.unit === "chars" ? "characters" : "words"}`,
          university: uni?.name || "",
          language: lang,
        },
        t("ws.review.error"),
      );
      patch({ review: { at: new Date().toISOString(), text, result } }, id);
      setActiveComment(null);
      setReview({ busy: false, error: "" });
    } catch (e) {
      setReview({ busy: false, error: e instanceof Error ? e.message : t("ws.review.error") });
    } finally {
      reviewing.current = false;
    }
  };
  const showComment = (c: AnchoredComment) => {
    setActiveComment(c.index);
    const el = refs.current[c.area];
    const mark = el?.parentElement?.querySelector(`mark[data-c="${c.index}"]`);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mark?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  };
  const onCaret = (area: number, offset: number) => {
    const hit = comments.find((c) => c.area === area && c.range && offset >= c.range.start && offset <= c.range.end);
    setActiveComment(hit ? hit.index : null);
  };

  const commands: SlashCommand[] = [
    { id: "review", label: t("wd.cmd.review"), hint: t("wd.cmd.review.hint"), icon: Sparkles, run: () => void runReview() },
    {
      id: "coach",
      label: t("wd.cmd.coach"),
      hint: t("wd.cmd.coach.hint"),
      icon: Bot,
      run: () => {
        patch({ mode: "ai" });
        openPanel("coach");
      },
    },
    {
      id: "outline",
      label: t("wd.cmd.outline"),
      hint: t("wd.cmd.outline.hint"),
      icon: ListTree,
      insert: "Opening moment: \nContext: \nWhat I did: \nWhat changed: \nWhy it matters for my goal: ",
    },
    ...type.brainstorm.slice(0, 2).map((question, i) => ({
      id: "question-" + i,
      label: t("wd.cmd.question", { n: i + 1 }),
      hint: question,
      icon: Quote,
      insert: `[ ${question} ]\n`,
    })),
    { id: "guide", label: t("wd.cmd.guide"), hint: t("wd.cmd.guide.hint"), icon: Lightbulb, run: () => openPanel("guide") },
    { id: "save", label: t("wd.cmd.save"), hint: t("wd.cmd.save.hint"), icon: Save, run: () => void save() },
    { id: "history", label: t("wd.cmd.history"), hint: t("wd.cmd.history.hint"), icon: History, run: () => openPanel("history") },
    { id: "focus", label: t("wd.cmd.focus"), hint: t("wd.cmd.focus.hint"), icon: Maximize2, run: () => setFocus((f) => !f) },
  ];
  const askAbout = (text: string) => {
    setPassage(text.trim().slice(0, 1200));
    openPanel("feedback");
  };

  /** Edits the text box that was last focused and puts the caret back. */
  const editArea = (change: (value: string, start: number, end: number) => { value: string; caret: number }) => {
    const i = type.sections ? activeArea.current : 0;
    const el = refs.current[i];
    if (!el) return;
    const current = type.sections ? parts[i] || "" : draft.body;
    const next = change(current, el.selectionStart ?? current.length, el.selectionEnd ?? current.length);
    if (type.sections) setPart(i, next.value, true);
    else setBody(next.value, true);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };
  const addBullet = () =>
    editArea((value, start) => {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      return { value: value.slice(0, lineStart) + "- " + value.slice(lineStart), caret: start + 2 };
    });
  const addNote = () =>
    editArea((value, start, end) => ({
      value: value.slice(0, start) + "[" + value.slice(start, end) + "]" + value.slice(end),
      caret: end + 1,
    }));
  const canUndo = avail.id === docId && avail.undo;
  const canRedo = avail.id === docId && avail.redo;
  const docRow = (id: string, label: string, sub?: string) => {
    const x = essayType(docType(id));
    const body = drafts[id]?.body || "";
    const n = countText(body.replace(/^### .*$/gm, ""), x.limit.unit);
    return (
      <li key={id} className={sub ? "is-uni" : undefined}>
        <button type="button" aria-current={id === docId} onClick={() => pick(id)} title={sub ? label + " · " + sub : label}>
          <TypeIcon type={x.id} size={15} />
          <span>
            {label}
            {sub && <small>{sub}</small>}
          </span>
          {n > 0 && <em>{n.toLocaleString()}</em>}
        </button>
      </li>
    );
  };

  return (
    <section
      className={"wt wn" + (focus ? " is-focus" : "") + (navOpen ? "" : " is-nav-closed") + (railOpen ? "" : " is-rail-closed")}
      style={{ "--wn-size": SIZES[size] + "px" } as React.CSSProperties}
      aria-labelledby="wt-title"
    >
      <TooltipProvider delayDuration={250}>
      <header className={"wn-top" + (launch ? " sr-only" : "")}>
        <div className="wn-side">
          {!launch && (
            <Tip label={t("wd.top.pages")}>
              <button type="button" className="wn-ghost wn-nav-toggle" aria-pressed={navOpen} aria-label={t("wd.top.pages")} onClick={() => setNavOpen((v) => !v)}>
                <PanelLeft size={18} />
              </button>
            </Tip>
          )}
          {!launch && (
            <Tip label={t("wn9.drafts")}>
              <button type="button" className="wn-ghost wn-all" aria-label={t("wn9.drafts")} onClick={() => setLaunch(true)}>
                <LayoutGrid size={18} />
              </button>
            </Tip>
          )}
          {!launch && (
            <span className={"wn-saved wd-count is-" + status} role="status" title={t("wd.status.autosaved")}>
              <CountRing value={count} min={type.limit.min} max={type.limit.max} size={26} />
              <span className="wd-count-text">
                <span>
                  <b>{count.toLocaleString()}</b> / {type.limit.max.toLocaleString()} {type.limit.unit === "chars" ? t("wd.unit.characters") : t("wd.unit.words")}
                </span>
                <small>
                  {type.limit.unit === "chars"
                    ? t("wn9.count.words", { n: countText(fullText, "words").toLocaleString() })
                    : t("wn9.count.chars", { n: fullText.length.toLocaleString() })}
                  {saving ? ` · ${t("wd.status.saving")}` : isSaved ? ` · ${t("wd.status.saved")}` : draft.body.trim() ? ` · ${t("ws.autosaved")}` : ""}
                </small>
              </span>
            </span>
          )}
        </div>
        <h1 id="wt-title" className="wn-doc">
          {launch ? (
            t("wd.title")
          ) : (
            <>
              <button type="button" className="wn-doc-button" aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>
                <span>{docName(docId)}</span> <ChevronDown size={15} aria-hidden="true" />
              </button>
              <label className="wt-type-select">
                <span className="sr-only">{t("wd.top.type")}</span>
                <select value={docId} onChange={(e) => pick(e.target.value)}>
                  {plans.length > 0 && (
                    <optgroup label={t("ws.nav.unis")}>
                      {plans.flatMap((p) =>
                        p.essays.filter((e) => !e.shared).map((e) => (
                          <option key={e.doc} value={e.doc}>
                            {docName(e.doc)}
                          </option>
                        )),
                      )}
                    </optgroup>
                  )}
                  {groups.map((g) => (
                    <optgroup key={g} label={t(GROUP_KEY[g])}>
                      {essayTypes.filter((x) => x.group === g).map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown size={15} aria-hidden="true" />
              </label>
            </>
          )}
        </h1>
        <div className="wn-side is-end">
          {!launch && (
            <>
              <Tip label={t("wd.cmd.save.hint")}>
                <button type="button" className="wn-ghost" onClick={() => void save()} disabled={saving || !draft.body.trim() || isSaved} aria-label={t("wd.top.save")}>
                  <Check size={19} />
                </button>
              </Tip>
              <Tip label={t("wd.top.help")}>
                <button type="button" className="wn-ghost wn-rail-toggle" aria-pressed={railOpen} aria-label={t("wd.top.help")} onClick={() => setRailOpen((v) => !v)}>
                  <PanelRight size={18} />
                </button>
              </Tip>
            </>
          )}
        </div>
      </header>

      {!launch && (
          <div className="wn-tools" role="toolbar" aria-label={t("wd.tool.label")}>
            <Tip label={t("wd.tool.undo")}>
              <button type="button" className="wn-ghost" disabled={!canUndo} onClick={() => stepHistory("undo")} aria-label={t("wd.tool.undo")}>
                <Undo2 size={18} />
              </button>
            </Tip>
            <Tip label={t("wd.tool.redo")}>
              <button type="button" className="wn-ghost" disabled={!canRedo} onClick={() => stepHistory("redo")} aria-label={t("wd.tool.redo")}>
                <Redo2 size={18} />
              </button>
            </Tip>
            <i aria-hidden="true" />
            <Tip label={t("wd.tool.size")}>
              <button type="button" className="wn-ghost" onClick={() => setSize((n) => (n + 1) % SIZES.length)} aria-label={t("wd.tool.size")}>
                <ALargeSmall size={19} />
              </button>
            </Tip>
            <Tip label={t("wd.tool.bullet")}>
              <button type="button" className="wn-ghost" onMouseDown={(e) => e.preventDefault()} onClick={addBullet} aria-label={t("wd.tool.bullet")}>
                <List size={18} />
              </button>
            </Tip>
            <Tip label={t("wd.tool.note")}>
              <button type="button" className="wn-ghost" onMouseDown={(e) => e.preventDefault()} onClick={addNote} aria-label={t("wd.tool.note")}>
                <SquareDashed size={17} />
              </button>
            </Tip>
            <i aria-hidden="true" />
            <WritingTimer t={t} />
            <Tip label={t("wd.tool.check.hint")}>
              <button type="button" className="wn-check" onClick={() => void runReview()} disabled={review.busy}>
                <ScanText size={16} aria-hidden="true" /> <span className="wn-check-label">{review.busy ? t("ws.review.running") : t("wd.tool.check")}</span>
                {comments.some((c) => c.range) && <small>{comments.filter((c) => c.range).length}</small>}
              </button>
            </Tip>
            <i aria-hidden="true" />
            <Tip label={t("wd.cmd.history")}>
              <button type="button" className="wn-ghost" onClick={() => openPanel("history")} aria-label={t("wd.cmd.history")}>
                <History size={17} />
              </button>
            </Tip>
            <Tip label={t("wd.top.download")}>
              <button type="button" className="wn-ghost" onClick={download} disabled={!draft.body.trim()} aria-label={t("wd.top.download")}>
                <Download size={17} />
              </button>
            </Tip>
            <Tip label={focus ? t("wd.top.focus.exit") : t("wd.top.focus")}>
              <button type="button" className="wn-ghost wn-focus-btn" aria-pressed={focus} onClick={() => setFocus((f) => !f)} aria-label={focus ? t("wd.top.focus.exit") : t("wd.top.focus")}>
                {focus ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </button>
            </Tip>
          </div>
      )}

      </TooltipProvider>

      {!launch && (
        <div className={"wn-goal is-" + status} role="status">
          <span className="wn-goal-text">
            {status === "empty"
              ? t("w2.goal.empty")
              : status === "draft"
                ? t("w2.goal.draft", { n: Math.max(0, type.limit.min - count).toLocaleString(), unit: type.limit.unit === "chars" ? t("wd.unit.characters") : t("wd.unit.words") })
                : status === "ok"
                  ? t("w2.goal.ok")
                  : t("w2.goal.over", { n: (count - type.limit.max).toLocaleString(), unit: type.limit.unit === "chars" ? t("wd.unit.characters") : t("wd.unit.words") })}
          </span>
          <span className={"wn-status is-" + statusOf(draft)}>{t(("wn9.status." + statusOf(draft)) as MessageKey)}</span>
          <button type="button" className="wt-link wn-final" disabled={!draft.body.trim()} onClick={() => patch({ final: !draft.final })}>
            {draft.final ? t("wn9.final.unmark") : t("wn9.final.mark")}
          </button>
        </div>
      )}

      {launch ? (
        <WritingLauncher
          current={drafts}
          plans={plans}
          onOpen={(id) => {
            pick(id);
            setLaunch(false);
            requestAnimationFrame(() => refs.current[0]?.focus());
          }}
          docName={docName}
          onPick={(id, mode) => {
            pick(id);
            patch({ mode }, id);
            setPanel(mode === "ai" ? "coach" : "feedback");
            setRailOpen(mode === "ai");
            setLaunch(false);
            // Start typing right away instead of hunting for the page.
            requestAnimationFrame(() => refs.current[0]?.focus());
          }}
          onClose={Object.values(drafts).some((d) => d?.body?.trim()) ? () => setLaunch(false) : undefined}
        />
      ) : (
      <div className="wt-layout">
        <nav className="wt-docs" aria-label={t("wd.top.pages")}>
          <button type="button" className="wn-new" onClick={() => setLaunch(true)}>
            <Plus size={15} aria-hidden="true" /> {t("wd.nav.new")}
          </button>
          {plans.length > 0 && (
            <div>
              <button
                type="button"
                className="wn-group"
                aria-expanded={!closedGroups.unis}
                onClick={() => setClosedGroups((c) => ({ ...c, unis: !c.unis }))}
              >
                <ChevronRight size={13} aria-hidden="true" />
                {t("ws.nav.unis")}
              </button>
              {!closedGroups.unis && (
                <ul>
                  {plans.flatMap((p) =>
                    p.essays.filter((e) => !e.shared).map((e) => docRow(e.doc, p.university.name, essayType(e.type).name)),
                  )}
                </ul>
              )}
            </div>
          )}
          {groups.map((g) => (
            <div key={g}>
              <button
                type="button"
                className="wn-group"
                aria-expanded={!closedGroups[g]}
                onClick={() => setClosedGroups((c) => ({ ...c, [g]: !c[g] }))}
              >
                <ChevronRight size={13} aria-hidden="true" />
                {t(GROUP_KEY[g])}
              </button>
              {!closedGroups[g] && <ul>{essayTypes.filter((x) => x.group === g).map((x) => docRow(x.id, x.name))}</ul>}
            </div>
          ))}
        </nav>

        <article className="wt-paper wn-page">
          {!type.sections && (
            <PromptPicker
              key={docId}
              type={type}
              university={uni?.name}
              index={draft.prompt}
              custom={draft.customPrompt || ""}
              onIndex={(prompt) => patch({ prompt, customPrompt: "" })}
              onCustom={(customPrompt) => patch({ customPrompt })}
            />
          )}
          {type.sections && type.sharedLimit && (
            <p className="wn-sections-note">
              {t("ws.ucas.note", { n: type.limit.max.toLocaleString() })}
              {type.source && (
                <a href={type.source.url} target="_blank" rel="noreferrer">
                  {type.source.label} <ExternalLink size={12} aria-hidden="true" />
                </a>
              )}
            </p>
          )}

          {draft.outline && (
            <details className="wt-outline wn-toggle" open>
              <summary>
                <Bot size={14} aria-hidden="true" /> {t("wd.outline.title")}
              </summary>
              <pre>{draft.outline}</pre>
              <button type="button" className="wt-link" onClick={() => patch({ outline: undefined })}>
                {t("wd.outline.remove")}
              </button>
            </details>
          )}

          {type.sections ? (
            <div className="wt-sections">
              {type.sections.map((s, i) => {
                const n = countText(parts[i] || "", (s.limit || type.limit).unit);
                const lim = s.limit;
                const over = !type.sharedLimit && lim && n > lim.max;
                // Activities: show only filled boxes plus one empty one.
                if (type.id === "activities" && i > 0 && !parts[i - 1] && !parts[i]) return null;
                return (
                  <div key={s.label} className="wt-section">
                    <label htmlFor={`wt-sec-${i}`}>
                      <strong>{s.label}</strong>
                      {lim && (
                        <span className={over ? "is-over" : lim.min && n < lim.min && n > 0 ? "is-under" : undefined}>
                          {n.toLocaleString()}
                          {type.sharedLimit ? ` · ${t("wd.section.min", { n: lim.min })}` : ` / ${lim.max}`} {lim.unit === "chars" ? t("wd.unit.chars") : t("wd.unit.words")}
                        </span>
                      )}
                    </label>
                    {s.hint && <small>{s.hint}</small>}
                    <HighlightArea
                      id={`wt-sec-${i}`}
                      value={parts[i] || ""}
                      onChange={(v, boundary) => setPart(i, v, boundary)}
                      marks={marksFor(i)}
                      compact={type.id === "activities"}
                      maxLength={type.id === "activities" ? 150 : undefined}
                      inputRef={(el) => (refs.current[i] = el)}
                      onFocus={() => (activeArea.current = i)}
                      onHistory={stepHistory}
                      onCaret={(offset) => onCaret(i, offset)}
                      placeholder={type.id === "activities" ? t("ws.activity.placeholder") : t("wd.editor.placeholder.section")}
                      commands={type.id === "activities" ? undefined : commands}
                      onAsk={type.id === "activities" ? undefined : askAbout}
                      t={t}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <HighlightArea
              id="wt-editor"
              value={draft.body}
              onChange={setBody}
              onHistory={stepHistory}
              marks={marksFor(0)}
              onCaret={(offset) => onCaret(0, offset)}
              inputRef={(el) => (refs.current[0] = el)}
              placeholder={t("wd.editor.placeholder")}
              commands={commands}
              onAsk={askAbout}
              plus
              t={t}
            />
          )}

          {notice && <p className={"wt-notice" + (notice.error ? " is-error" : "")} role={notice.error ? "alert" : "status"}>{notice.text}</p>}
        </article>

        {railOpen && <button type="button" className="wn-scrim" tabIndex={-1} aria-label={t("wn9.sheet.close")} onClick={() => setRailOpen(false)} />}
        <aside className="wt-rail">
          <div className="wn-sheet-head">
            <i aria-hidden="true" />
            <button type="button" className="wn-ghost" aria-label={t("wn9.sheet.close")} onClick={() => setRailOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="wt-tabs" role="tablist" aria-label={t("wd.top.help")}>
            {(
              [
                ...(draft.mode === "ai" ? ([["coach", t("wd.tab.coach")]] as const) : []),
                ["feedback", t("wd.tab.feedback")],
                ["guide", t("wd.tab.guide")],
                ["history", t("wd.tab.history")],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={panel === id} onClick={() => setPanel(id)}>
                {label}
                {id === "history" && versions.length > 0 && <em>{versions.length}</em>}
              </button>
            ))}
          </div>

          {panel === "coach" && draft.mode === "ai" && (
            <BrainstormCoach
              key={docId}
              type={type}
              prompt={prompt}
              chat={draft.chat || []}
              onChat={(chat) => patch({ chat })}
              onOutline={(outline) => patch({ outline })}
            />
          )}

          {panel === "feedback" && (
            <>
              {passage && (
                <PassageReview key={passage} passage={passage} type={type} fullText={fullText} onClose={() => setPassage(null)} />
              )}
              <EssayReviewPanel
                stored={stored}
                comments={comments}
                active={activeComment}
                onPick={showComment}
                onRun={() => void runReview()}
                busy={review.busy}
                error={review.error}
                ready={reviewReady}
                changed={!!stored && stored.text !== fullText}
              />
            </>
          )}

          {panel === "guide" && (
            <>
              <section className="wt-card">
                <header>
                  <h3>
                    <Lightbulb size={15} aria-hidden="true" /> {t("wd.guide.start")}
                  </h3>
                </header>
                <ol className="wt-brainstorm">
                  {type.brainstorm.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ol>
              </section>
              <ChecklistCard type={type} owner={owner} />
              {type.source && (
                <a className="wt-card wt-source" href={type.source.url} target="_blank" rel="noreferrer">
                  <BookOpen size={15} aria-hidden="true" />
                  <span>
                    <strong>{type.source.label}</strong>
                    <small>{t("wd.guide.source")}</small>
                  </span>
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              )}
              <button
                type="button"
                className="wt-btn wt-btn-block"
                disabled={!!added[docId]}
                onClick={async () => {
                  if (await addTask(t("wd.guide.task", { name: docName(docId) }))) setAdded((a) => ({ ...a, [docId]: true }));
                }}
              >
                {added[docId] ? <Check size={15} /> : null}
                {added[docId] ? t("wd.guide.added") : t("wd.guide.add")}
              </button>
            </>
          )}

          {panel === "history" && (
            <section className="wt-card">
              <header>
                <h3>{t("wd.history.title")}</h3>
                <span>{docName(docId)}</span>
              </header>
              {!versions.length && <p className="wt-muted">{t("wd.history.empty")}</p>}
              <ul className="wt-versions">
                {versions.map((v) => (
                  <li key={v.id} className={compare?.id === v.id ? "is-on" : undefined}>
                    <button type="button" onClick={() => setCompare(compare?.id === v.id ? null : v)}>
                      <strong>{new Date(v.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</strong>
                      <small>
                        {t("wd.bubble.words", { n: countText(v.body, "words") })}
                        {v.local ? ` · ${t("wd.history.device")}` : ""}
                      </small>
                    </button>
                    <button type="button" className="wt-icon" aria-label={t("wd.history.remove")} onClick={() => void removeVersion(v)}>
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
              {compare && (
                <div className="wt-diff">
                  <header>
                    <strong>{t("wd.history.changes")}</strong>
                    <button
                      type="button"
                      className="wt-link"
                      onClick={() => {
                        if (!draft.body.trim() || window.confirm(t("wd.history.restore.confirm"))) {
                          setBody(compare.body, true);
                          setCompare(null);
                        }
                      }}
                    >
                      {t("wd.history.restore")}
                    </button>
                  </header>
                  <p className="wt-legend">
                    <ins>{t("wd.history.added")}</ins> <del>{t("wd.history.removed")}</del>
                  </p>
                  <div className="wt-diff-body">
                    {diffWords(compare.body.replace(/^### .*$/gm, ""), draft.body.replace(/^### .*$/gm, "")).map((p, i) =>
                      p.type === "same" ? <span key={i}>{p.text}</span> : p.type === "add" ? <ins key={i}>{p.text}</ins> : <del key={i}>{p.text}</del>,
                    )}
                  </div>
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
      )}
    </section>
  );
}

/** The prompt above the page, with a picker for the official prompts and a
 * box for the exact wording of a university's own question. */
function PromptPicker({
  type,
  university,
  index,
  custom,
  onIndex,
  onCustom,
}: {
  type: EssayType;
  university?: string;
  index: number;
  custom: string;
  onIndex: (i: number) => void;
  onCustom: (text: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(custom);
  const prompts = type.prompts || [];
  const asksOwn = !!university && type.id === "why_us";
  const current = custom.trim() || (asksOwn ? "" : prompts[Math.min(index, prompts.length - 1)] || "");
  const position = !custom.trim() && prompts.length > 1 && !asksOwn ? `${Math.min(index, prompts.length - 1) + 1} / ${prompts.length}` : "";
  return (
    <div className="wn-prompt-box">
      <div className="wn-prompt-head">
        <b>
          {t("wd.prop.prompt")}
          {position && <small>{position}</small>}
          {custom.trim() && <small>{t("ws.prompt.own")}</small>}
        </b>
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) setDraft(custom);
          }}
        >
          <DialogTrigger asChild>
            <button type="button" className="wt-link">
              {current ? t("ws.prompt.change") : t("ws.prompt.add")}
            </button>
          </DialogTrigger>
          <DialogContent className="wn-prompt-dialog border-border sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("ws.prompt.title")}</DialogTitle>
              <DialogDescription>
                {asksOwn ? t("ws.prompt.uni", { name: university! }) : t("ws.prompt.lead")}
              </DialogDescription>
            </DialogHeader>
            {prompts.length > 0 && (
              <ul className="wn-prompt-list" role="radiogroup" aria-label={t("wd.prop.prompt")}>
                {prompts.map((p, i) => {
                  const on = !custom.trim() && !asksOwn && i === Math.min(index, prompts.length - 1);
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={on ? "is-on" : undefined}
                        onClick={() => {
                          onIndex(i);
                          setOpen(false);
                        }}
                      >
                        <span>{i + 1}</span>
                        <p>{p}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <label className="wn-prompt-own">
              <span>{asksOwn ? t("ws.prompt.paste") : t("ws.prompt.own.label")}</span>
              <textarea rows={3} value={draft} maxLength={1200} onChange={(e) => setDraft(e.target.value)} placeholder={t("ws.prompt.placeholder")} />
            </label>
            <DialogFooter>
              {type.source && (
                <a className="wn-prompt-source" href={type.source.url} target="_blank" rel="noreferrer">
                  {type.source.label} <ExternalLink size={12} aria-hidden="true" />
                </a>
              )}
              <Button
                type="button"
                disabled={!draft.trim() || draft.trim() === custom.trim()}
                onClick={() => {
                  onCustom(draft.trim());
                  setOpen(false);
                }}
              >
                {t("ws.prompt.use")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {current ? <p>{current}</p> : <p className="wt-muted">{t("ws.prompt.missing", { name: university || "" })}</p>}
    </div>
  );
}

/** A textarea with a mirrored backdrop that marks commented ranges. The
 * backdrop also tells us where the caret is on screen, which places the "/"
 * command menu and the selection bubble. */
function HighlightArea({
  id,
  value,
  onChange,
  marks,
  onCaret,
  placeholder,
  compact,
  maxLength,
  inputRef,
  commands,
  onAsk,
  onFocus,
  onHistory,
  plus,
  t,
}: {
  id: string;
  value: string;
  /** `boundary`: a command edit that gets its own undo step. */
  onChange: (v: string, boundary?: boolean) => void;
  /** Ctrl/Cmd+Z and redo go to the desk's own history (see setBody). */
  onHistory?: (direction: "undo" | "redo") => void;
  marks: Mark[];
  /** Caret moved (no selection): the desk highlights the comment there. */
  onCaret?: (offset: number) => void;
  placeholder?: string;
  compact?: boolean;
  maxLength?: number;
  inputRef?: (el: HTMLTextAreaElement | null) => void;
  commands?: SlashCommand[];
  onAsk?: (text: string) => void;
  onFocus?: () => void;
  /** Show the "+" button beside the caret line that opens the command menu. */
  plus?: boolean;
  t: Translate;
}) {
  const ta = useRef<HTMLTextAreaElement | null>(null);
  const back = useRef<HTMLDivElement | null>(null);
  const [slash, setSlash] = useState<{ at: number; query: string; index: number; virtual?: boolean } | null>(null);
  const [plusY, setPlusY] = useState(14);
  const [slashAt, setSlashAt] = useState<{ x: number; y: number } | null>(null);
  const [bubble, setBubble] = useState<{ x: number; y: number; text: string } | null>(null);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  }, [value]);

  /** Screen position of a character offset, relative to the editor box. */
  const point = useCallback((offset: number) => {
    const root = back.current;
    if (!root) return null;
    const box = root.getBoundingClientRect();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let left = offset;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent?.length || 0;
      if (left < length) {
        const range = document.createRange();
        range.setStart(node, left);
        range.setEnd(node, left + 1);
        const rect = range.getClientRects()[0] || range.getBoundingClientRect();
        if (rect && (rect.height || rect.width)) return { x: rect.left - box.left, top: rect.top - box.top, bottom: rect.bottom - box.top };
        break;
      }
      left -= length;
    }
    return { x: 28, top: 22, bottom: 52 };
  }, []);

  const matches = slash
    ? (commands || []).filter((c) => (c.label + " " + c.id).toLowerCase().includes(slash.query.toLowerCase()))
    : [];
  useLayoutEffect(() => {
    if (!slash) return setSlashAt(null);
    const p = point(slash.at);
    const width = back.current?.clientWidth || 600;
    setSlashAt(p && { x: slash.virtual ? 0 : Math.max(8, Math.min(p.x, width - 300)), y: p.bottom + 6 });
  }, [slash?.at, value, point]); // eslint-disable-line react-hooks/exhaustive-deps

  const runCommand = (command: SlashCommand) => {
    const el = ta.current;
    if (!el || !slash) return;
    const end = slash.virtual ? slash.at : slash.at + 1 + slash.query.length;
    const insert = command.insert || "";
    onChange(value.slice(0, slash.at) + insert + value.slice(end), true);
    setSlash(null);
    const caret = slash.at + insert.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
      // After the "/query" text is gone, so actions such as save see clean text.
      command.run?.();
    });
  };

  const pieces: React.ReactNode[] = [];
  let at = 0;
  [...marks].sort((a, b) => a.start - b.start).forEach((m) => {
    if (m.start < at || m.end > value.length) return;
    pieces.push(value.slice(at, m.start));
    pieces.push(
      <mark key={m.id} data-c={m.id} className={"k-" + m.kind + (m.on ? " is-on" : "")}>
        {value.slice(m.start, m.end)}
      </mark>,
    );
    at = m.end;
  });
  pieces.push(value.slice(at) + "\n");
  return (
    <div className={"wt-area" + (compact ? " is-compact" : "")}>
      <div className="wt-backdrop" aria-hidden="true" ref={back}>
        {pieces}
      </div>
      <textarea
        id={id}
        ref={(el) => {
          ta.current = el;
          inputRef?.(el);
        }}
        value={value}
        maxLength={maxLength ?? 20000}
        spellCheck
        placeholder={placeholder}
        aria-haspopup={commands ? "listbox" : undefined}
        aria-controls={slash ? id + "-commands" : undefined}
        aria-activedescendant={slash && matches[slash.index] ? `${id}-cmd-${matches[slash.index].id}` : undefined}
        onChange={(e) => {
          const next = e.target.value;
          const caret = e.target.selectionStart;
          onChange(next);
          setBubble(null);
          if (!commands) return;
          if (slash?.virtual) setSlash(null);
          else if (slash) {
            const query = next.slice(slash.at + 1, caret);
            if (caret <= slash.at || next[slash.at] !== "/" || /\s/.test(query) || query.length > 20) setSlash(null);
            else setSlash({ at: slash.at, query, index: 0 });
          } else if (next.length > value.length && next[caret - 1] === "/" && (caret === 1 || /\s/.test(next[caret - 2])))
            setSlash({ at: caret - 1, query: "", index: 0 });
        }}
        onKeyDown={(e) => {
          const key = e.key.toLowerCase();
          if (onHistory && (e.metaKey || e.ctrlKey) && !e.altKey && (key === "z" || key === "y")) {
            e.preventDefault();
            onHistory(key === "y" || e.shiftKey ? "redo" : "undo");
            setSlash(null);
            return;
          }
          if (!slash) return;
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setSlash(null);
          } else if (!matches.length) {
            if (e.key === "Enter") setSlash(null);
          } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const step = e.key === "ArrowDown" ? 1 : -1;
            setSlash({ ...slash, index: (slash.index + step + matches.length) % matches.length });
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            e.stopPropagation();
            runCommand(matches[Math.min(slash.index, matches.length - 1)]);
          }
        }}
        onFocus={onFocus}
        onSelect={(e) => {
          const el = e.currentTarget;
          if (plus) setPlusY(point(el.selectionEnd)?.top ?? 14);
          if (el.selectionStart === el.selectionEnd) onCaret?.(el.selectionStart);
          if (!onAsk) return;
          const text = el.value.slice(el.selectionStart, el.selectionEnd);
          if (text.trim().length < 12) return setBubble(null);
          const p = point(el.selectionStart);
          const width = back.current?.clientWidth || 600;
          setBubble(p && { x: Math.max(8, Math.min(p.x, width - 250)), y: p.top - 44, text });
        }}
        onBlur={() => {
          setSlash(null);
          setBubble(null);
        }}
      />
      {plus && commands && (
        <button
          type="button"
          className="wn-plus"
          style={{ top: plusY }}
          aria-label={t("wd.plus")}
          title={t("wd.plus")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const el = ta.current;
            if (!el) return;
            if (document.activeElement !== el) el.focus();
            setBubble(null);
            setSlash(slash ? null : { at: el.selectionStart, query: "", index: 0, virtual: true });
          }}
        >
          <Plus size={20} />
        </button>
      )}
      {slash && slashAt && (
        <div
          className="wn-slash"
          id={id + "-commands"}
          role="listbox"
          aria-label={t("wd.slash.label")}
          style={{ left: slashAt.x, top: slashAt.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <small>{t("wd.slash.label")}</small>
          {matches.length ? (
            matches.map((c, i) => (
              <button
                key={c.id}
                id={`${id}-cmd-${c.id}`}
                type="button"
                role="option"
                aria-selected={i === slash.index}
                onMouseEnter={() => setSlash({ ...slash, index: i })}
                onClick={() => runCommand(c)}
              >
                <i aria-hidden="true">
                  <c.icon size={16} />
                </i>
                <span>
                  <strong>{c.label}</strong>
                  <em>{c.hint}</em>
                </span>
              </button>
            ))
          ) : (
            <p>{t("wd.slash.empty")}</p>
          )}
        </div>
      )}
      {bubble && onAsk && (
        <div className="wn-bubble" style={{ left: bubble.x, top: Math.max(-40, bubble.y) }} onMouseDown={(e) => e.preventDefault()}>
          <button
            type="button"
            onClick={() => {
              onAsk(bubble.text);
              setBubble(null);
            }}
          >
            <Sparkles size={14} aria-hidden="true" /> {t("wd.bubble.ask")}
          </button>
          <span>{t("wd.bubble.words", { n: countText(bubble.text, "words") })}</span>
        </div>
      )}
    </div>
  );
}

function ChecklistCard({ type, owner }: { type: EssayType; owner: string }) {
  const t = useT();
  const key = `collegestat-writing-checks:${owner}:${type.id}`;
  const [done, setDone] = useState<number[]>([]);
  useEffect(() => {
    let alive = true;
    const saved = readJSON<number[]>(key, []);
    queueMicrotask(() => alive && setDone(Array.isArray(saved) ? saved : []));
    return () => {
      alive = false;
    };
  }, [key]);
  const toggle = (i: number) => {
    const next = done.includes(i) ? done.filter((x) => x !== i) : [...done, i];
    setDone(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  };
  return (
    <section className="wt-card">
      <header>
        <h3>{t("wd.guide.checks")}</h3>
        <span>
          {done.length}/{type.checks.length}
        </span>
      </header>
      <ul className="wt-checks">
        {type.checks.map((c, i) => (
          <li key={c}>
            <label>
              <input type="checkbox" checked={done.includes(i)} onChange={() => toggle(i)} />
              <span>{c}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AIResult({ result, t }: { result: StudentAIResult; t: Translate }) {
  return (
    <>
      <p>{result.summary}</p>
      {result.strengths.length > 0 && (
        <>
          <h4>{t("wd.ai.works")}</h4>
          <ul>
            {result.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {result.next_steps.length > 0 && (
        <>
          <h4>{t("wd.ai.improve")}</h4>
          <ol>
            {result.next_steps.map((s) => (
              <li key={s.title}>
                <strong>{s.title}.</strong> {s.detail}
              </li>
            ))}
          </ol>
        </>
      )}
      {result.practice_questions.length > 0 && (
        <>
          <h4>{t("wd.ai.questions")}</h4>
          <ul>
            {result.practice_questions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </>
      )}
      <small className="wt-muted">{result.limitations[0]}</small>
    </>
  );
}


/** Clock read for event handlers; the compiler cannot tell they never run in render. */
const nowMs = () => Date.now();

/** Writing timer for timed practice: pick a length, then pause or reset. */
function WritingTimer({ t }: { t: Translate }) {
  const [total, setTotal] = useState(0);
  const [left, setLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const end = useRef(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const seconds = Math.max(0, Math.round((end.current - Date.now()) / 1000));
      setLeft(seconds);
      if (seconds === 0) {
        setRunning(false);
        toast(t("wd.timer.done"));
      }
    }, 500);
    return () => clearInterval(id);
  }, [running, t]);
  const start = (minutes: number) => {
    setTotal(minutes * 60);
    setLeft(minutes * 60);
    end.current = nowMs() + minutes * 60000;
    setRunning(true);
  };
  const reset = () => {
    setRunning(false);
    setTotal(0);
    setLeft(0);
  };
  if (!total)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="wn-ghost" aria-label={t("wd.timer")} title={t("wd.timer")}>
            <Timer size={18} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          {[10, 25, 40, 60].map((minutes) => (
            <DropdownMenuItem key={minutes} onSelect={() => start(minutes)}>
              {t("wd.timer.minutes", { n: minutes })}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  const clock = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  return (
    <span className={"wn-timer" + (left === 0 ? " is-done" : left <= 60 ? " is-low" : "")} role="timer" aria-label={t("wd.timer")}>
      <button
        type="button"
        disabled={left === 0}
        aria-label={running ? t("wd.timer.pause") : t("wd.timer.resume")}
        title={running ? t("wd.timer.pause") : t("wd.timer.resume")}
        onClick={() => {
          if (!running) end.current = nowMs() + left * 1000;
          setRunning(!running);
        }}
      >
        {running ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <b>{clock}</b>
      <button type="button" aria-label={t("wd.timer.reset")} title={t("wd.timer.reset")} onClick={reset}>
        <X size={14} />
      </button>
    </span>
  );
}

/** Feedback on one selected passage, like a comment in the margin. Nothing is
 * sent until the student presses the button. */
function PassageReview({
  passage,
  type,
  fullText,
  onClose,
}: {
  passage: string;
  type: EssayType;
  fullText: string;
  onClose: () => void;
}) {
  const { lang, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<StudentAIResult | null>(null);
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const body = `Essay type: ${type.name}. Give feedback only on this passage from my draft: specificity, clarity and voice. Ask questions that help me revise it myself.\n\nPASSAGE:\n${passage}\n\nFULL DRAFT (context only):\n${fullText}`;
      setResult(await askStudentAI(body, lang, t("wd.ai.error")));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("wd.ai.error"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="wt-card wn-comment" aria-label={t("wd.passage.title")}>
      <header>
        <h3>
          <MessageSquareQuote size={15} aria-hidden="true" /> {t("wd.passage.title")}
        </h3>
        <button type="button" className="wt-icon" aria-label={t("wd.passage.close")} onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <blockquote>{passage.length > 280 ? passage.slice(0, 278) + "…" : passage}</blockquote>
      {result ? (
        <div className="wt-ai-result">
          <AIResult result={result} t={t} />
        </div>
      ) : (
        <>
          <p className="wt-muted">{t("wd.passage.consent")}</p>
          <button type="button" className="wt-btn wt-btn-ai" disabled={busy} onClick={() => void run()}>
            <Sparkles size={15} aria-hidden="true" /> {busy ? t("wd.ai.busy") : t("wd.passage.run")}
          </button>
        </>
      )}
      {error && (
        <p className="wt-notice is-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Start screen: choose what to write, then whether to use AI. */
function WritingLauncher({
  current,
  plans,
  docName,
  onOpen,
  onPick,
  onClose,
}: {
  current: Record<string, Draft>;
  plans: UniversityEssays[];
  docName: (doc: string) => string;
  onOpen: (doc: string) => void;
  onPick: (doc: string, mode: "self" | "ai") => void;
  onClose?: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const t = useT();
  const { lang } = useI18n();
  const groups = [...new Set(essayTypes.map((x) => x.group))];
  const chosen = picked ? essayType(docType(picked)) : null;
  const mine = Object.entries(current)
    .filter(([, d]) => d?.body?.trim())
    .sort((a, b) => (b[1].updated || "").localeCompare(a[1].updated || ""));
  const unit = (x: EssayType) => (x.limit.unit === "chars" ? t("wd.unit.characters") : t("wd.unit.words"));
  return (
    <TooltipProvider delayDuration={300}>
    <div className="wl">
      {!chosen ? (
        <>
          <header className="wl-hero">
            <div className="wl-hero-text">
              <h2 className="dk-title">{mine.length ? t("wd.launch.title") : t("wn9.empty.title")}</h2>
              <p>{mine.length ? t("d3.desk.sub") : t("wn9.empty.text")}</p>
              {onClose && (
                <button type="button" className="dk-btn dk-btn--secondary" onClick={onClose}>
                  {t("wd.launch.back")}
                </button>
              )}
            </div>
            <DeskArt className="wl-art" />
          </header>

          {mine.length > 0 && (
            <section className="wl-sec" aria-labelledby="wl-recent">
              <div className="wl-sec-head">
                <h3 id="wl-recent">{t("wn9.drafts")}</h3>
                <span>{mine.length}</span>
              </div>
              <ul className="wl-docs">
                {mine.map(([id, d]) => {
                  const x = essayType(docType(id));
                  const n = countText(d.body.replace(/^### .*$/gm, ""), x.limit.unit);
                  const st = statusOf(d);
                  return (
                    <li key={id}>
                      <button type="button" className="wl-doc" onClick={() => onOpen(id)}>
                        <span className="wl-doc-top">
                          <TypeTile type={x.id} />
                          <span className={"wn-status is-" + st}>{t(("wn9.status." + st) as MessageKey)}</span>
                        </span>
                        <strong>{docName(id)}</strong>
                        <span className="wl-doc-bar" aria-hidden="true">
                          <i className={n > x.limit.max ? "is-over" : undefined} style={{ width: Math.min(100, Math.round((n / Math.max(1, x.limit.max)) * 100)) + "%" }} />
                        </span>
                        <small>
                          <span>{t("wn9.limit", { n: n.toLocaleString(), max: x.limit.max.toLocaleString(), unit: unit(x) })}</span>
                          {d.updated && <span>{t("wn9.edited", { when: ago(d.updated, lang) })}</span>}
                        </small>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {plans.length > 0 && (
            <section className="wl-sec" aria-labelledby="wl-unis">
              <div className="wl-sec-head">
                <h3 id="wl-unis">{t("ws.nav.unis")}</h3>
              </div>
              <ul className="wl-unis">
                {plans.map((p) => (
                  <li key={p.university.id}>
                    <div className="wl-uni-name">
                      <strong>{p.university.name}</strong>
                      {p.platform && <small>{p.platform}</small>}
                    </div>
                    <div className="wl-chips">
                      {p.essays.map((e) => {
                        const x = essayType(e.type);
                        const started = !!current[e.doc]?.body?.trim();
                        const note = [e.shared ? t("ws.launch.shared") : e.required === false ? t("ws.launch.optional") : "", started ? t("wd.launch.progress") : ""].filter(Boolean).join(" · ");
                        return (
                          <button key={e.doc} type="button" className={started ? "is-started" : undefined} onClick={() => (started ? onOpen(e.doc) : onPick(e.doc, "self"))}>
                            <TypeIcon type={x.id} />
                            <span>{x.name}</span>
                            {note && <em>{note}</em>}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="wl-sec" aria-labelledby="wl-start">
            <div className="wl-sec-head">
              <h3 id="wl-start">{t("wn9.start")}</h3>
              <p>{t("wn9.start.sub")}</p>
            </div>
            {groups.map((g) => (
              <div key={g} className="wl-tpl-group">
                <h4>{t(GROUP_KEY[g])}</h4>
                <ul className="wl-tpls">
                  {essayTypes
                    .filter((x) => x.group === g)
                    .map((x) => {
                      const started = !!current[x.id]?.body?.trim();
                      const max = x.limit.max.toLocaleString();
                      return (
                        <li key={x.id} className="wl-tpl">
                          <button type="button" className="wl-tpl-main" onClick={() => (started ? onOpen(x.id) : onPick(x.id, "self"))}>
                            <TypeTile type={x.id} />
                            <span className="wl-tpl-text">
                              <strong>{x.name}</strong>
                              <small>{x.blurb}</small>
                              <em>
                                {x.limit.min ? `${x.limit.min.toLocaleString()}–${max}` : t("wd.launch.upto", { n: max })} {unit(x)}
                                {started ? ` · ${t("wd.launch.progress")}` : ""}
                              </em>
                            </span>
                          </button>
                          <Tip label={t("wd.launch.ai.text")} side="top">
                            <button type="button" className="wl-tpl-ai" onClick={() => onPick(x.id, "ai")} aria-label={t("wd.launch.ai") + ": " + x.name}>
                              <Bot size={15} aria-hidden="true" />
                              <span>{t("wd.launch.ai")}</span>
                            </button>
                          </Tip>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </section>
        </>
      ) : (
        <div className="wl-mode">
          <button type="button" className="wt-link" onClick={() => setPicked(null)}>
            ← {t("wd.launch.all")}
          </button>
          <h2>{docName(picked!)}</h2>
          <p>{t("wd.launch.how")}</p>
          <div className="wl-cards">
            <button type="button" onClick={() => onPick(picked!, "self")}>
              <PenSquare size={22} strokeWidth={1.7} aria-hidden="true" />
              <strong>{t("wd.launch.self")}</strong>
              <small>{t("wd.launch.self.text")}</small>
            </button>
            <button type="button" className="is-ai" onClick={() => onPick(picked!, "ai")}>
              <Bot size={22} strokeWidth={1.7} aria-hidden="true" />
              <strong>{t("wd.launch.ai")}</strong>
              <small>{t("wd.launch.ai.text")}</small>
            </button>
          </div>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}

/** "3 hours ago", "yesterday", or a short date after a week. */
function ago(iso: string, lang: Lang) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((then - nowMs()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  if (mins > -60) return rtf.format(Math.min(0, mins), "minute");
  if (mins > -60 * 24) return rtf.format(Math.round(mins / 60), "hour");
  if (mins > -60 * 24 * 7) return rtf.format(Math.round(mins / 1440), "day");
  return new Date(iso).toLocaleDateString(lang, { month: "short", day: "numeric" });
}

/** Brainstorm interview in the rail: one question at a time, then an outline. */
function BrainstormCoach({
  type,
  prompt,
  chat,
  onChat,
  onOutline,
}: {
  type: EssayType;
  prompt?: string;
  chat: ChatMsg[];
  onChat: (chat: ChatMsg[]) => void;
  onOutline: (outline: string) => void;
}) {
  const { lang, t } = useI18n();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ask = async (thread: ChatMsg[]) => {
    setBusy(true);
    setError("");
    try {
      const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error(t("wd.coach.signin"));
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          messages: thread.slice(-20),
          language: lang,
          brainstorm: `Essay type: ${type.name} (${type.limit.min}-${type.limit.max} ${type.limit.unit}).${prompt ? ` Prompt: ${prompt}` : ""}`.slice(0, 1200),
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) throw new Error(data.error || t("wd.coach.error"));
      const next = [...thread, { role: "assistant" as const, content: data.reply }];
      onChat(next);
      const idx = data.reply.indexOf("OUTLINE:");
      if (idx >= 0) onOutline(data.reply.slice(idx + 8).trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("wd.coach.error"));
    } finally {
      setBusy(false);
    }
  };
  const send = (content: string) => {
    if (!content.trim() || busy) return;
    const next = [...chat, { role: "user" as const, content: content.trim().slice(0, 2000) }];
    onChat(next);
    setText("");
    void ask(next);
  };
  return (
    <section className="wt-card wt-coach" aria-label={t("wd.coach.title")}>
      <header>
        <h3>
          <Bot size={15} aria-hidden="true" /> {t("wd.coach.title")}
        </h3>
      </header>
      {!chat.length ? (
        <>
          <p className="wt-muted">{t("wd.coach.intro")}</p>
          <button type="button" className="wt-btn wt-btn-ai" disabled={busy} onClick={() => send("Hi! Let’s start brainstorming.")}>
            <Sparkles size={15} aria-hidden="true" /> {t("wd.coach.start")}
          </button>
        </>
      ) : (
        <div className="wt-coach-thread">
          {chat
            .filter((m, i) => !(i === 0 && m.role === "user"))
            .map((m, i) => (
              <p key={i} className={"wt-coach-msg is-" + m.role}>
                {m.content.replace(/OUTLINE:[\s\S]*/, t("wd.coach.outline"))}
              </p>
            ))}
          {busy && <ShiningText as="span" text={t("wd.coach.thinking")} className="wt-coach-think" />}
        </div>
      )}
      {chat.length > 0 && (
        <form
          className="wt-coach-input"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <textarea
            rows={2}
            value={text}
            placeholder={t("wd.coach.placeholder")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
          />
          <div>
            <button type="button" className="wt-link" disabled={busy} onClick={() => send(t("wd.coach.make.msg"))}>
              {t("wd.coach.make")}
            </button>
            <button type="submit" className="wt-btn wt-btn-primary" disabled={busy || !text.trim()}>
              {t("wd.coach.send")}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="wt-notice is-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
