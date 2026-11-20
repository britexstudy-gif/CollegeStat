"use client";
import { useCallback, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { CalendarDays, Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { saveProfile } from "@/services/profile-account";
import type { MessageKey } from "@/lib/i18n/messages";
import { countryName, type University } from "@/lib/domain";
import {
  FITS,
  STAGES,
  applicationChecklist,
  readMyColleges,
  stageOf,
  suggestedFit,
  type ChecklistRow,
  type CollegeEntry,
  type Fit,
  type ScoreBand,
  type Stage,
  type TimelineRow,
} from "@/lib/my-colleges";
import { useCollege } from "./provider";
import { useI18n, useT, type Translate } from "./i18n";
import { Btn, Countdown, DataTable, EmptyState, Meter, Page, PageHeader, Segmented, Select, StatusPill, UniLogo, type Column, type Tone } from "./dash-ui";
import "./university-profile.css";

/* ── State: one entry per university inside profile preferences ─────── */
let pendingStore: Record<string, CollegeEntry> = {};
const pendingListeners = new Set<() => void>();
const readPending = () => pendingStore;
const subscribePending = (fn: () => void) => {
  pendingListeners.add(fn);
  return () => pendingListeners.delete(fn);
};
const setPending = (fn: (p: Record<string, CollegeEntry>) => Record<string, CollegeEntry>) => {
  pendingStore = fn(pendingStore);
  pendingListeners.forEach((l) => l());
};

export function useMyColleges() {
  const s = useCollege();
  const stored = useMemo(() => readMyColleges(s.profile?.preferences), [s.profile?.preferences]);
  // Optimistic edits, shared by every component on the page until the saved profile comes back.
  const pending = useSyncExternalStore(subscribePending, readPending, readPending);
  const entries = useMemo(() => ({ ...stored, ...pending }), [stored, pending]);
  const t = useT();
  const update = useCallback(
    async (id: string, patch: Partial<CollegeEntry>) => {
      if (!s.user) {
        s.openAuth();
        return false;
      }
      const owner = s.accountScope.capture();
      if (owner.owner !== s.user.id) return false;
      const prefs = s.profile?.preferences || {};
      const all = readMyColleges(prefs);
      const next: CollegeEntry = { ...all[id], ...entries[id], ...patch };
      if (!next.fit) delete next.fit;
      if (!next.done?.length) delete next.done;
      setPending((p) => ({ ...p, [id]: next }));
      try {
        await saveProfile(
          s.accountScope,
          { display_name: s.profile?.display_name ?? null, preferences: { ...prefs, my_colleges: { ...all, [id]: next } } },
          owner,
        );
        await s.refreshAccount();
        return true;
      } catch {
        toast.error(t("oc.mc.error"));
        return false;
      } finally {
        setPending((p) => {
          const rest = { ...p };
          delete rest[id];
          return rest;
        });
      }
    },
    [s, entries, t],
  );
  const setFit = useCallback(
    async (id: string, fit: Fit | null) => {
      if (!s.user) return s.openAuth();
      // Choosing a fit also keeps the university in the saved list.
      if (fit && !s.saved.includes(id)) await s.toggleSaved(id);
      await update(id, { fit: fit || undefined });
    },
    [s, update],
  );
  const toggleDone = useCallback(
    (id: string, req: string, done: boolean) => {
      const current = entries[id]?.done || [];
      void update(id, { done: done ? [...new Set([...current, req])] : current.filter((r) => r !== req) });
    },
    [entries, update],
  );
  return { entries, setFit, toggleDone };
}

const FIT_KEY: Record<Fit, MessageKey> = { reach: "oc.mc.fit.reach", target: "oc.mc.fit.target", safety: "oc.mc.fit.safety" };
export const fitLabel = (t: Translate, fit: Fit) => t(FIT_KEY[fit]);
const STAGE_KEY: Record<Stage, MessageKey> = {
  researching: "oc.mc.stage.researching",
  applying: "oc.mc.stage.applying",
  submitted: "oc.mc.stage.submitted",
  decision: "oc.mc.stage.decision",
};
export const STATUS_VALUES = ["Researching", "Considering", "Applying", "Submitted", "Accepted", "Waitlisted", "Rejected"] as const;
export const statusLabel = (t: Translate, status: string) =>
  (STATUS_VALUES as readonly string[]).includes(status) ? t(("oc.mc.status." + status.toLowerCase()) as MessageKey) : status;

/** Reach / Target / Safety as one segmented control. */
export function FitPicker({ id, value, suggested, onChange, size = "md" }: { id: string; value?: Fit; suggested?: Fit | null; onChange: (fit: Fit | null) => void; size?: "sm" | "md" }) {
  const t = useT();
  return (
    <div className={"mc-seg is-" + size} role="group" aria-label={t("oc.mc.fit.label")}>
      {FITS.map((fit) => (
        <button
          key={fit}
          type="button"
          className={"is-" + fit}
          aria-pressed={value === fit}
          data-suggested={!value && suggested === fit ? "true" : undefined}
          onClick={() => onChange(value === fit ? null : fit)}
          id={fit === "reach" ? "mc-fit-" + id : undefined}
        >
          {fitLabel(t, fit)}
        </button>
      ))}
    </div>
  );
}

/* ── Score bars ───────────────────────────────────────────────────────── */
const pct = (b: ScoreBand, v: number) => Math.min(100, Math.max(0, ((v - b.min) / (b.max - b.min)) * 100));
export function ScoreBars({ bands }: { bands: ScoreBand[] }) {
  return (
    <ul className="mc-scores">
      {bands.map((b) => (
        <ScoreBar key={b.test} band={b} />
      ))}
    </ul>
  );
}
function ScoreBar({ band: b }: { band: ScoreBand }) {
  const t = useT();
  const desc =
    b.kind === "range"
      ? t("oc.mc.scores.range", { low: b.low, high: b.high })
      : b.kind === "average"
        ? t("oc.mc.scores.avg", { n: b.low })
        : t("oc.mc.scores.min", { n: b.low });
  return (
    <li className="mc-score">
      <div className="mc-score-head">
        <strong>{b.test}</strong>
        <span>{desc}</span>
        {b.year && <span>{b.year}</span>}
        {b.verdict && <em className={"is-" + b.verdict}>{t(("oc.mc.verdict." + b.verdict) as MessageKey)}</em>}
        {b.source_url && (
          <a className="up-src" href={b.source_url} target="_blank" rel="noreferrer">
            {t("up.source")}
          </a>
        )}
      </div>
      <div className="mc-track" aria-hidden="true">
        {b.kind === "range" ? (
          <i className="mc-band" style={{ left: pct(b, b.low) + "%", width: Math.max(pct(b, b.high) - pct(b, b.low), 1.5) + "%" }} />
        ) : b.kind === "average" ? (
          <i className="mc-tick" style={{ left: pct(b, b.low) + "%" }} />
        ) : (
          <i className="mc-band is-min" style={{ left: pct(b, b.low) + "%", right: 0 }} />
        )}
        {b.you != null && (
          <b className={"mc-you is-" + (b.verdict || "within")} style={{ left: pct(b, b.you) + "%" }}>
            <span>{t("oc.mc.scores.you", { n: b.you })}</span>
          </b>
        )}
      </div>
      <div className="mc-scale" aria-hidden="true">
        <span>{b.min}</span>
        <span>{b.max}</span>
      </div>
    </li>
  );
}

/* ── Requirements and deadlines (university page + My colleges) ──────── */
const REQ_KEY: Record<string, MessageKey> = {
  form: "oc.mc.req.form",
  transcript: "oc.mc.req.transcript",
  english: "oc.mc.req.english",
  tests: "oc.mc.req.tests",
  essays: "oc.mc.req.essays",
  recs: "oc.mc.req.recs",
  portfolio: "oc.mc.req.portfolio",
  interview: "oc.mc.req.interview",
  fee: "oc.mc.req.fee",
};
export function requirementLabel(t: Translate, r: ChecklistRow) {
  return r.label || t(REQ_KEY[r.id]);
}

/** `interactive`: a signed-in student may tick items before saving the university. */
export function RequirementChecklist({ university: u, rows, interactive = false }: { university: University; rows: ChecklistRow[]; interactive?: boolean }) {
  const t = useT();
  const s = useCollege();
  const { entries, toggleDone } = useMyColleges();
  const tracked = (interactive && !!s.user) || s.saved.includes(u.id) || !!entries[u.id]?.fit;
  const done = new Set(entries[u.id]?.done || []);
  const count = rows.filter((r) => done.has(r.id)).length;
  return (
    <div className="mc-req">
      {tracked && (
        <div className="mc-req-progress">
          <span>{t("oc.mc.req.progress", { done: count, total: rows.length })}</span>
          <Progress value={rows.length ? (count / rows.length) * 100 : 0} aria-label={t("oc.mc.req.title")} />
        </div>
      )}
      <ul>
        {rows.map((r) => (
          <li key={r.id} className={done.has(r.id) ? "is-done" : undefined}>
            {tracked ? (
              <Checkbox
                id={"req-" + u.id + r.id}
                checked={done.has(r.id)}
                onCheckedChange={(v) => toggleDone(u.id, r.id, v === true)}
              />
            ) : (
              <Check size={15} aria-hidden="true" />
            )}
            <label htmlFor={tracked ? "req-" + u.id + r.id : undefined}>
              {requirementLabel(t, r)}
              {r.detail && <small>{r.detail === "test-flexible" ? t("oc.mc.req.flex") : r.detail}</small>}
            </label>
            {r.source_url && (
              <a className="up-src" href={r.source_url} target="_blank" rel="noreferrer">
                {t("up.source")}
              </a>
            )}
          </li>
        ))}
      </ul>
      {!tracked && <p className="mc-quiet">{t("oc.mc.req.track")}</p>}
    </div>
  );
}

export function DeadlineTimeline({ rows }: { rows: TimelineRow[] }) {
  const { t, lang } = useI18n();
  const fmt = (iso: string) => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
  return (
    <ol className="mc-timeline">
      {rows.map((d) => (
        <li key={d.id} className={d.past ? "is-past" : undefined}>
          <i aria-hidden="true" />
          <div>
            <span className="mc-round">{d.round || <CalendarDays size={12} aria-label={t("oc.mc.dl.title")} />}</span>
            <time dateTime={d.date}>{fmt(d.date)}</time>
            <p>
              {d.title}
              {d.source_url && (
                <>
                  {" "}
                  <a className="up-src" href={d.source_url} target="_blank" rel="noreferrer">
                    {t("up.source")}
                  </a>
                </>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── My colleges board (dashboard) ───────────────────────────────────── */
export type BoardRow = {
  id: string;
  status: string;
  university?: University;
  nextDeadline: { date: string; own: boolean } | null;
  details: ReactNode;
  statusControl: ReactNode;
  onRemove: () => void;
};

export function StagePipeline({ status }: { status: string }) {
  const t = useT();
  const stage = stageOf(status);
  const at = STAGES.indexOf(stage);
  return (
    <ol className="mc-pipe" aria-label={t("oc.mc.stage.label", { stage: t(STAGE_KEY[stage]) })}>
      {STAGES.map((st, i) => (
        <li key={st} className={i < at ? "is-done" : i === at ? "is-now" : undefined} title={t(STAGE_KEY[st])}>
          <span className="sr-only">{t(STAGE_KEY[st])}</span>
        </li>
      ))}
    </ol>
  );
}

const FIT_TONE: Record<Fit, Tone> = { reach: "warning", target: "accent", safety: "success" };
export function FitPill({ fit }: { fit?: Fit }) {
  const t = useT();
  return fit ? (
    <StatusPill tone={FIT_TONE[fit]} dot>
      {fitLabel(t, fit)}
    </StatusPill>
  ) : (
    <StatusPill>{t("oc.mc.fit.unsorted")}</StatusPill>
  );
}

/** Expanded row: fit, checklist, private notes and remove. */
function BoardDetail({ row, entry }: { row: BoardRow; entry?: CollegeEntry }) {
  const t = useT();
  const { setFit } = useMyColleges();
  const u = row.university!;
  const reqs = applicationChecklist(u);
  const suggested = suggestedFit(u);
  return (
    <div className="grid gap-6 pt-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:pl-11">
      <div className="grid content-start gap-3">
        <h4 className="text-[12.5px] font-medium text-[var(--dk-muted)]">{t("oc.mc.fit.title")}</h4>
        <FitPicker id={u.id} size="sm" value={entry?.fit} suggested={suggested} onChange={(fit) => void setFit(u.id, fit)} />
        {!entry?.fit && suggested && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--dk-muted)]">
            {t("oc.mc.fit.suggest", { fit: fitLabel(t, suggested) })}
            <Btn size="sm" variant="ghost" onClick={() => void setFit(u.id, suggested)}>
              {t("oc.mc.board.accept")}
            </Btn>
          </p>
        )}
        <h4 className="mt-2 text-[12.5px] font-medium text-[var(--dk-muted)]">{t("oc.mc.req.title")}</h4>
        <RequirementChecklist university={u} rows={reqs} />
      </div>
      <div className="grid content-start gap-3">
        {row.details}
        <div>
          <Btn size="sm" variant="danger" onClick={row.onRemove}>
            <Trash2 aria-hidden="true" /> {t("oc.mc.board.remove")}
          </Btn>
        </div>
      </div>
    </div>
  );
}

type Shown = BoardRow & { entry?: CollegeEntry; reqs: ChecklistRow[]; done: number; days: number | null };

export function MyCollegesBoard({ rows, today, toolbar, preview }: { rows: BoardRow[]; today: string; toolbar?: ReactNode; preview?: Record<string, CollegeEntry> }) {
  const t = useT();
  const { lang } = useI18n();
  const live = useMyColleges().entries;
  const entries = preview || live;
  const [fit, setFitFilter] = useState<Fit | "all" | "unsorted">("all");
  const [stage, setStage] = useState<Stage | "all">("all");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const all = useMemo<Shown[]>(
    () =>
      rows.map((r) => {
        const entry = entries[r.id];
        const reqs = r.university ? applicationChecklist(r.university) : [];
        return {
          ...r,
          entry,
          reqs,
          done: reqs.filter((q) => entry?.done?.includes(q.id)).length,
          days: r.nextDeadline ? Math.round((Date.parse(r.nextDeadline.date) - Date.parse(today)) / 864e5) : null,
        };
      }),
    [rows, entries, today],
  );
  const fitOf = (r: Shown) => r.entry?.fit;
  const shown = all.filter((r) => (fit === "all" || (fit === "unsorted" ? !fitOf(r) : fitOf(r) === fit)) && (stage === "all" || stageOf(r.status) === stage));
  const fmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const FIT_ORDER: Record<string, number> = { reach: 0, target: 1, safety: 2, none: 3 };
  const columns: Column<Shown>[] = [
    {
      key: "name",
      header: t("d4.col.university"),
      sort: (r) => r.university?.name || "",
      cell: (r) =>
        r.university ? (
          <div className="dk-cell-id">
            <UniLogo university={r.university} />
            <span>
              <Link href={"/dashboard/university/" + r.university.slug} className="dk-row-link">
                <strong>{r.university.name}</strong>
              </Link>
              <small>
                {[r.university.city, countryName(r.university.country_code)].filter(Boolean).join(", ")}
                <span className="sm:hidden">{" · " + (fitOf(r) ? fitLabel(t, fitOf(r)!) : t("oc.mc.fit.unsorted"))}</span>
              </small>
            </span>
          </div>
        ) : (
          <span className="dk-muted">{t("oc.mc.board.unavailable")}</span>
        ),
    },
    { key: "fit", header: t("d4.col.fit"), hide: "sm", width: "8rem", sort: (r) => FIT_ORDER[fitOf(r) || "none"], cell: (r) => <FitPill fit={fitOf(r)} /> },
    { key: "status", header: t("d4.col.status"), hide: "md", width: "11rem", sort: (r) => STAGES.indexOf(stageOf(r.status)), cell: (r) => <div className="mc-cell-status">{r.statusControl}</div> },
    {
      key: "deadline",
      header: t("d4.col.deadline"),
      width: "9rem",
      sort: (r) => r.nextDeadline?.date || "9999",
      cell: (r) =>
        r.nextDeadline && r.days != null ? (
          <span className="grid justify-items-start gap-0.5">
            <span className="text-[13px] dk-num">{fmt.format(new Date(r.nextDeadline.date + "T00:00:00Z"))}</span>
            <Countdown days={r.days} />
          </span>
        ) : (
          <span className="dk-faint text-[12.5px]">{t("oc.mc.board.none")}</span>
        ),
    },
    {
      key: "ready",
      header: t("d4.col.checklist"),
      hide: "md",
      width: "8.5rem",
      sort: (r) => (r.reqs.length ? r.done / r.reqs.length : 0),
      cell: (r) => <Meter done={r.done} total={r.reqs.length} label={t("oc.mc.req.title")} />,
    },
    {
      key: "more",
      header: <span className="sr-only">{t("oc.mc.board.details")}</span>,
      align: "end",
      width: "3rem",
      cell: (r) =>
        r.university ? (
          <Btn
            icon
            size="sm"
            variant="ghost"
            aria-expanded={open.has(r.id)}
            aria-controls={"dk-detail-" + r.id}
            aria-label={t("d4.mc.row_actions", { name: r.university.name })}
            onClick={() => toggle(r.id)}
          >
            <ChevronDown className={open.has(r.id) ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden="true" />
          </Btn>
        ) : (
          <Btn icon size="sm" variant="ghost" aria-label={t("oc.mc.board.remove")} onClick={r.onRemove}>
            <Trash2 aria-hidden="true" />
          </Btn>
        ),
    },
  ];
  const count = (f: Fit | "unsorted") => all.filter((r) => (f === "unsorted" ? !fitOf(r) : fitOf(r) === f)).length;
  return (
    <Page>
      <PageHeader
        title={t("oc.mc.board.title")}
        description={t("oc.mc.board.sub")}
        actions={
          <Btn variant="primary" href="/dashboard/universities">
            <Plus aria-hidden="true" /> {t("oc.mc.board.add")}
          </Btn>
        }
      />
      {!rows.length ? (
        <div className="dk-panel">
          <EmptyState text={t("oc.mc.board.empty")} action={t("oc.mc.board.explore")} href="/dashboard/universities" />
        </div>
      ) : (
        <section className="dk-section" aria-label={t("oc.mc.board.title")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented
              label={t("d4.mc.fit_filter")}
              value={fit}
              onChange={setFitFilter}
              options={[
                { value: "all", label: t("d4.mc.all"), count: all.length },
                ...FITS.map((f) => ({ value: f, label: fitLabel(t, f), count: count(f) })),
                ...(count("unsorted") ? [{ value: "unsorted" as const, label: t("oc.mc.fit.unsorted"), count: count("unsorted") }] : []),
              ]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select aria-label={t("oc.mc.stage.filter")} value={stage} onChange={(e) => setStage(e.target.value as Stage | "all")}>
                {(["all", ...STAGES] as const).map((st) => (
                  <option key={st} value={st}>
                    {(st === "all" ? t("oc.mc.stage.all") : t(STAGE_KEY[st])) + " · " + (st === "all" ? rows.length : rows.filter((r) => stageOf(r.status) === st).length)}
                  </option>
                ))}
              </Select>
              {toolbar}
            </div>
          </div>
          <DataTable
            label={t("oc.mc.board.title")}
            columns={columns}
            rows={shown}
            rowKey={(r) => r.id}
            initialSort={{ key: "deadline", dir: "asc" }}
            expanded={open}
            detail={(r) => (r.university ? <BoardDetail row={r} entry={r.entry} /> : null)}
            empty={<EmptyState text={t("oc.mc.board.none_stage")} />}
          />
        </section>
      )}
    </Page>
  );
}
