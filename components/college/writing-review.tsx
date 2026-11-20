"use client";
import { CircleHelp, Lightbulb, ListOrdered, MessageSquareText, RefreshCw, ScanText, ThumbsUp, Route, UserRound, Wrench } from "lucide-react";
import { z } from "zod";
import { ShiningText } from "@/components/ui/shining-text";
import { getSupabase } from "@/lib/supabase/client";
import { recordActivity } from "@/lib/progress-store";
import { essayReview, REVIEW_CRITERIA, type CommentKind, type EssayReview, type ReviewComment } from "@/lib/essay-review";
import type { Lang } from "@/lib/i18n/languages";
import type { MessageKey } from "@/lib/i18n/messages";
import { useT } from "./i18n";
import { CRIT_ICON } from "./writing-desk";
import "./writing-review.css";

export type StoredReview = { at: string; text: string; result: EssayReview };
export type AnchoredComment = ReviewComment & { index: number; range: { start: number; end: number } | null; area: number };

/** Sends the draft to /api/essay-review. Nothing is stored on the server. */
export async function requestEssayReview(
  input: { text: string; essay_type: string; prompt: string; limit: string; university: string; language: Lang },
  fallback: string,
): Promise<EssayReview> {
  const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new Error(fallback);
  const res = await fetch("/api/essay-review", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ ...input, consent: true }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const f = z.object({ error: z.string() }).safeParse(data);
    throw new Error(f.success ? f.data.error : fallback);
  }
  void recordActivity("ai", "essay-review:" + Date.now().toString(36));
  return essayReview.parse((data as { review: unknown }).review);
}

const KIND_ICON: Record<CommentKind, typeof ThumbsUp> = { praise: ThumbsUp, question: CircleHelp, suggestion: Lightbulb, fix: Wrench };

/** The criterion's icon in a small tinted tile. */
function CritIcon({ id }: { id: keyof typeof CRIT_ICON }) {
  const Icon = CRIT_ICON[id];
  return (
    <span className={"wr-crit-icon is-" + id} aria-hidden="true">
      <Icon size={12} strokeWidth={2} />
    </span>
  );
}

/** The feedback panel: score, six criteria, the reader's view, the next
 * revision and margin comments tied to the text. */
export function EssayReviewPanel({
  stored,
  comments,
  active,
  onPick,
  onRun,
  busy,
  error,
  ready,
  changed,
}: {
  stored: StoredReview | null;
  comments: AnchoredComment[];
  active: number | null;
  onPick: (c: AnchoredComment) => void;
  onRun: () => void;
  busy: boolean;
  error: string;
  /** Long enough to review. */
  ready: boolean;
  /** The draft changed since this review. */
  changed: boolean;
}) {
  const t = useT();
  const r = stored?.result;
  const open = comments.filter((c) => c.range);
  const gone = comments.length - open.length;
  // The model orders comments by importance; the three first non-praise ones still in the text.
  const fixes = [...open].filter((c) => c.kind !== "praise").sort((x, y) => x.index - y.index).slice(0, 3);
  return (
    <section className="wt-card wr" aria-labelledby="wr-title">
      <header>
        <h3 id="wr-title">
          <ScanText size={15} aria-hidden="true" /> {t("ws.review.title")}
        </h3>
        {stored && !busy && (
          <span>{new Date(stored.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
        )}
      </header>

      {busy ? (
        <div className="wr-busy" role="status">
          <ShiningText as="p" text={t("ws.review.busy")} className="wt-coach-think" />
          <div className="wr-skel" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
      ) : !r ? (
        <div className="wr-intro">
          <p>{t("ws.review.intro")}</p>
          <ul>
            {REVIEW_CRITERIA.map((c) => {
              const Icon = CRIT_ICON[c];
              return (
                <li key={c}>
                  <span className="wr-crit-icon" aria-hidden="true">
                    <Icon size={13} strokeWidth={1.9} />
                  </span>
                  {t(("ws.crit." + c) as MessageKey)}
                </li>
              );
            })}
          </ul>
          <button type="button" className="wt-btn wr-run" disabled={!ready} onClick={onRun}>
            <ScanText size={15} aria-hidden="true" /> {ready ? t("ws.review.run") : t("ws.review.short")}
          </button>
          <small className="wt-muted">{t("ws.review.note")}</small>
        </div>
      ) : (
        <div className="wr-body">
          <div className="wr-score">
            <div className={"wr-ring is-" + r.band} aria-hidden="true">
              <b>{r.score}</b>
              <small>/10</small>
            </div>
            <div>
              <strong>{t(("ws.band." + r.band) as MessageKey)}</strong>
              <p>{r.summary}</p>
            </div>
          </div>

          {changed && (
            <p className="wr-changed">
              {t("ws.review.changed")}{" "}
              <button type="button" className="wt-link" onClick={onRun} disabled={!ready}>
                {t("ws.review.again")}
              </button>
            </p>
          )}

          {fixes.length > 0 && (
            <div className="wr-block wr-fixes">
              <h4>
                <ListOrdered size={14} aria-hidden="true" /> {t("wn9.fixes")}
              </h4>
              <p className="wt-muted">{t("wn9.fixes.sub")}</p>
              <ol>
                {fixes.map((c) => (
                  <li key={c.index}>
                    <button type="button" onClick={() => onPick(c)}>
                      <span className="wr-kind">
                        <CritIcon id={c.criterion} /> {t(("ws.crit." + c.criterion) as MessageKey)}
                      </span>
                      <q>{c.quote.length > 110 ? c.quote.slice(0, 108) + "…" : c.quote}</q>
                      <span>{c.comment}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <ul className="wr-criteria" aria-label={t("ws.review.criteria")}>
            {r.criteria.map((c) => (
              <li key={c.id}>
                <details>
                  <summary>
                    <span className="wr-crit-name">
                      <CritIcon id={c.id} /> {t(("ws.crit." + c.id) as MessageKey)}
                    </span>
                    <span className="wr-bar" aria-hidden="true">
                      <i className={"is-" + c.band} style={{ width: c.score * 10 + "%" }} />
                    </span>
                    <b>{c.score}</b>
                  </summary>
                  <p>{c.note}</p>
                </details>
              </li>
            ))}
          </ul>

          {r.prompt_fit && (
            <div className="wr-block">
              <h4>{t("ws.review.fit")}</h4>
              <p>{r.prompt_fit}</p>
            </div>
          )}

          <div className="wr-block wr-officer">
            <h4>
              <UserRound size={14} aria-hidden="true" /> {t("ws.review.officer")}
            </h4>
            <p>{r.officer}</p>
          </div>

          {r.strengths.length > 0 && (
            <div className="wr-block">
              <h4>{t("ws.review.strengths")}</h4>
              <ul>
                {r.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="wr-block wr-next">
            <h4>
              <Route size={14} aria-hidden="true" /> {t("ws.review.next")}
            </h4>
            <strong>{r.next_revision.focus}</strong>
            <ol>
              {r.next_revision.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>

          {comments.length > 0 && (
            <div className="wr-block">
              <h4>
                <MessageSquareText size={14} aria-hidden="true" /> {t("ws.review.comments", { n: open.length })}
              </h4>
              <ul className="wr-comments">
                {comments.map((c) => {
                  const Icon = KIND_ICON[c.kind];
                  return (
                    <li key={c.index}>
                      <button
                        type="button"
                        className={"k-" + c.kind + (active === c.index ? " is-on" : "") + (c.range ? "" : " is-gone")}
                        onClick={() => onPick(c)}
                        aria-pressed={active === c.index}
                        disabled={!c.range}
                      >
                        <span className="wr-kind">
                          <CritIcon id={c.criterion} /> {t(("ws.crit." + c.criterion) as MessageKey)}
                          <span className="wr-kind-tag">
                            <Icon size={11} aria-hidden="true" /> {t(("ws.kind." + c.kind) as MessageKey)}
                          </span>
                        </span>
                        <q>{c.quote.length > 110 ? c.quote.slice(0, 108) + "…" : c.quote}</q>
                        <span className="wr-text">{c.comment}</span>
                        {!c.range && <small>{t("ws.review.gone")}</small>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {gone > 0 && <small className="wt-muted">{t("ws.review.gone.n", { n: gone })}</small>}
            </div>
          )}

          <button type="button" className="wt-btn wr-again" onClick={onRun} disabled={!ready}>
            <RefreshCw size={14} aria-hidden="true" /> {t("ws.review.again")}
          </button>
          <small className="wt-muted">{t("ws.review.note")}</small>
        </div>
      )}
      {error && (
        <p className="wt-notice is-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
