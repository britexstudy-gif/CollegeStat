"use client";
import type { TaskChart } from "@/lib/test-prep/types";

/** The visual for an IELTS Writing Task 1 prompt: grouped bars, lines or a table,
 * drawn in plain SVG with exam-paper styling. */
export function TaskChartView({ chart }: { chart: TaskChart }) {
  if (chart.type === "table")
    return (
      <figure className="tp-chart">
        <figcaption>{chart.title}</figcaption>
        <table className="tp-chart-table">
          <thead>
            <tr>
              <th scope="col" />
              {chart.series.map((s) => (
                <th key={s.name} scope="col">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.categories.map((c, i) => (
              <tr key={c}>
                <th scope="row">{c}</th>
                {chart.series.map((s) => (
                  <td key={s.name}>{s.values[i]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <small>{chart.unit}</small>
      </figure>
    );

  const W = 560,
    H = 300,
    P = { l: 44, r: 16, t: 16, b: 48 };
  const max = Math.ceil(Math.max(...chart.series.flatMap((s) => s.values)) / 10) * 10 || 10;
  const ticks = Array.from({ length: 6 }, (_, i) => Math.round((max / 5) * i));
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  const band = (W - P.l - P.r) / chart.categories.length;
  const cx = (i: number) => P.l + band * i + band / 2;
  const n = chart.series.length;
  const bw = Math.min(26, (band * 0.7) / n);
  return (
    <figure className="tp-chart">
      <figcaption>{chart.title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chart.title}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={P.l} x2={W - P.r} y1={y(tk)} y2={y(tk)} className="tp-chart-grid" />
            <text x={P.l - 8} y={y(tk) + 4} textAnchor="end" className="tp-chart-tick">
              {tk}
            </text>
          </g>
        ))}
        {chart.categories.map((c, i) => (
          <text key={c} x={cx(i)} y={H - P.b + 18} textAnchor="middle" className="tp-chart-tick">
            {c}
          </text>
        ))}
        {chart.type === "bar"
          ? chart.series.map((s, si) =>
              s.values.map((v, i) => (
                <rect key={si + "-" + i} x={cx(i) - (bw * n) / 2 + si * bw + 1} y={y(v)} width={bw - 2} height={y(0) - y(v)} rx={2} className={"tp-s" + si}>
                  <title>{`${s.name}, ${chart.categories[i]}: ${v}`}</title>
                </rect>
              )),
            )
          : chart.series.map((s, si) => (
              <g key={si} className={"tp-s" + si}>
                <polyline fill="none" strokeWidth={2} points={s.values.map((v, i) => `${cx(i)},${y(v)}`).join(" ")} />
                {s.values.map((v, i) => (
                  <circle key={i} cx={cx(i)} cy={y(v)} r={3.5}>
                    <title>{`${s.name}, ${chart.categories[i]}: ${v}`}</title>
                  </circle>
                ))}
              </g>
            ))}
      </svg>
      <div className="tp-legend">
        {chart.series.map((s, si) => (
          <span key={s.name}>
            <i className={"tp-s" + si} /> {s.name}
          </span>
        ))}
        <small>{chart.unit}</small>
      </div>
    </figure>
  );
}
