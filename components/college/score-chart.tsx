"use client";
import { useEffect, useRef, useState } from "react";
import type { MockAttempt } from "@/lib/exam-score";
import { attemptValue } from "@/lib/prep-plan";
import { useI18n } from "./i18n";

/** One series over time: a 2px line, 9px points with a surface ring, a recessive grid,
 * the latest value labelled, a hover tooltip and a screen-reader table. */
export function ScoreChart({ attempts }: { attempts: MockAttempt[] }) {
  const { t, lang } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const [W, setW] = useState(640);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scaled = attempts.some((a) => a.scaled);
  const band = !scaled && attempts.length > 0 && attempts.every((a) => a.band != null);
  const pts = attempts.map((a, i) => ({ i, v: attemptValue(a), a }));
  const [lo, hi] = scaled ? [200, 800] : band ? [0, 9] : [0, 100];
  const H = 190;
  const P = { l: 40, r: 20, t: 20, b: 28 };
  const x = (i: number) => P.l + (pts.length === 1 ? (W - P.l - P.r) / 2 : (i / (pts.length - 1)) * (W - P.l - P.r));
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const ticks = scaled ? [200, 400, 600, 800] : band ? [0, 3, 6, 9] : [0, 50, 100];
  const unit = scaled || band ? "" : "%";
  const day = (iso: string) => new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(new Date(iso));
  const h = hover === null ? null : pts[hover];
  const last = pts[pts.length - 1];
  return (
    <div className="ct-chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t("ct.chart.label", { n: pts.length })}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={P.l} x2={W - P.r} y1={y(tick)} y2={y(tick)} className="ct-chart-grid" />
            <text x={P.l - 8} y={y(tick) + 4} textAnchor="end" className="ct-chart-tick">
              {tick}
              {unit}
            </text>
          </g>
        ))}
        {pts.length > 1 && <polyline points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} className="ct-chart-line" />}
        {pts.map((p) => (
          <g key={p.i} onMouseEnter={() => setHover(p.i)} onMouseLeave={() => setHover(null)}>
            <circle cx={x(p.i)} cy={y(p.v)} r={14} className="ct-chart-hit" />
            <circle cx={x(p.i)} cy={y(p.v)} r={hover === p.i ? 6 : 4.5} className="ct-chart-dot" />
          </g>
        ))}
        <text x={x(last.i)} y={y(last.v) - 12} textAnchor={pts.length > 1 ? "end" : "middle"} className="ct-chart-last">
          {last.v}
          {unit}
        </text>
        <text x={x(0)} y={H - 6} textAnchor={pts.length > 1 ? "start" : "middle"} className="ct-chart-tick">
          {day(pts[0].a.date)}
        </text>
        {pts.length > 1 && (
          <text x={x(last.i)} y={H - 6} textAnchor="end" className="ct-chart-tick">
            {day(last.a.date)}
          </text>
        )}
      </svg>
      {h && (
        <div className="ct-chart-tip" style={{ left: `${(x(h.i) / W) * 100}%`, top: `${(y(h.v) / H) * 100}%` }}>
          <strong>
            {h.v}
            {unit}
          </strong>
          <span>{h.a.title}</span>
          <span>
            {day(h.a.date)} · {t("ct.chart.correct", { a: h.a.correct, b: h.a.total })}
          </span>
        </div>
      )}
      <table className="sr-only">
        <caption>{t("ct.chart.table")}</caption>
        <tbody>
          {pts.map((p) => (
            <tr key={p.i}>
              <td>{p.a.title}</td>
              <td>{p.v + unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
