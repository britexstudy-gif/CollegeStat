"use client";
import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { University } from "@/lib/domain";
import { historySeries, type HistoryObservation } from "@/lib/chart-series";
import { valueOf } from "@/lib/research";
export function HistoryChart({
  records,
  title,
  unit,
  reversed = false,
}: {
  records: HistoryObservation[];
  title: string;
  unit: string;
  reversed?: boolean;
}) {
  const [scope, setScope] = useState("");
  const groups = historySeries(records);
  const group = groups.find(g => g.scope === scope) || groups[0];
  const rows = group?.points || [];
  const last = rows.at(-1);
  const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits:3 }) + unit;
  return (
    <figure className="history-chart">
      <header><div><h3>{title}</h3><p className="caption">{group?.scope || "Reported observations"} · {unit}</p></div>{last && <div className="chart-stat"><strong>{format(last.value!)}</strong><small>Latest reported · {last.year}</small></div>}</header>
      {groups.length > 1 && <label className="chart-scope">Population <select value={group!.scope} onChange={e => setScope(e.target.value)}>{groups.map(g => <option key={g.scope}>{g.scope}</option>)}</select></label>}
      {rows.length < 2 ? <div className="chart-empty"><p>{rows.length === 1 ? "One sourced year is available. A trend will appear when another year for the same population is recorded." : "Comparable historical observations are not yet available. Use the source records for individual figures."}</p></div> : <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top:15, right:16, bottom:4, left:4 }} accessibilityLayer>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="year"
              axisLine={false} tickLine={false} minTickGap={22}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <YAxis
              reversed={reversed}
              axisLine={false} tickLine={false} width={52}
              domain={unit === "%" ? [0,100] : ["auto","auto"]}
              tickFormatter={value => Number(value).toLocaleString(undefined,{ notation:"compact" })}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            />
            <Tooltip
              formatter={value => [format(Number(value)),title]}
              labelFormatter={year => "Reported " + year}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 18,
                boxShadow:"0 8px 32px #203b631a",
                padding:14,
              }}
            />
            <Line
              type="linear"
              dataKey="value"
              stroke="var(--primary)"
              strokeWidth={3}
              dot={{ r:4, fill:"var(--card)", strokeWidth:2 }}
              activeDot={{ r:6, stroke:"var(--card)", strokeWidth:3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>}
      {!!group?.observations.length && <details>
        <summary className="caption">View values and sources</summary>
        <table className="research-table">
          <tbody>
            {group.observations.map((r) => (
              <tr key={r.id}>
                <td>{r.year}</td>
                <td>
                  {r.value}
                  {unit}
                </td>
                <td>
                  {r.data_sources ? (
                    <a
                      className="text-link"
                      href={r.source_url || r.data_sources.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.data_sources.name}
                    </a>
                  ) : (
                    "Source unavailable"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>}
    </figure>
  );
}
export function TuitionScatter({
  universities,
}: {
  universities: University[];
}) {
  const data = universities.flatMap((u) => {
    const c = valueOf(u, "tuition"),
      a = valueOf(u, "admission"),
      n = valueOf(u, "enrollment");
    return c.currency === "USD" &&
      c.value != null &&
      a.value != null &&
      n.value != null
      ? [
          {
            name: u.name,
            tuition: c.value,
            admission: a.value,
            enrollment: n.value,
          },
        ]
      : [];
  });
  return (
    <section className="panel scatter-figure">
      <h2>Cost meets selectivity.</h2>
      <p className="caption">
        {data.length > 1
          ? "Annual international tuition (USD) × admission rate (%) · Bubble area: enrollment. Current loaded research set; cycles may differ."
          : "Annual international tuition, admission rate, and enrollment from the current loaded research set. Reporting cycles may differ."}
      </p>
      {data.length ? (
        <>
          {data.length === 1 ? (
            <div className="chart-single">
              <div>
                <span className="chart-single-label">ONE COMPLETE RECORD</span>
                <h3>{data[0].name}</h3>
                <p>
                  A comparison chart will appear when another university has
                  sourced tuition, admission rate, and enrollment figures.
                </p>
              </div>
              <dl>
                <div><dt>Annual tuition</dt><dd>{data[0].tuition.toLocaleString()} USD</dd></div>
                <div><dt>Admission rate</dt><dd>{data[0].admission}%</dd></div>
                <div><dt>Enrollment</dt><dd>{data[0].enrollment.toLocaleString()}</dd></div>
              </dl>
            </div>
          ) : (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top:16,right:16,bottom:8,left:4 }} accessibilityLayer>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 6" vertical={false} />
                  <XAxis
                    type="number"
                    dataKey="tuition"
                    name="Tuition"
                    unit=" USD"
                    axisLine={false} tickLine={false}
                    tickFormatter={value => "$" + Number(value).toLocaleString(undefined,{ notation:"compact" })}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="admission"
                    name="Admission"
                    unit="%"
                    axisLine={false} tickLine={false} domain={[0,100]}
                    tick={{ fontSize: 10 }}
                  />
                  <ZAxis
                    type="number"
                    dataKey="enrollment"
                    range={[60, 400]}
                    name="Enrollment"
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius:18,
                      boxShadow:"0 8px 32px #203b631a",
                    }}
                  />
                  <Scatter
                    data={data}
                    fill="var(--primary)"
                    fillOpacity={.72}
                    isAnimationActive={false}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
          <details>
            <summary className="caption">Accessible data table</summary>
            <table className="research-table">
              <tbody>
                {data.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{r.tuition} USD</td>
                    <td>{r.admission}%</td>
                    <td>{r.enrollment} students</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        <div className="chart-empty">
          <strong>Three figures make a meaningful point.</strong>
          <p>
            This chart includes a university only when tuition in USD, admission
            rate, and enrollment are all reported. No complete records in this
            research set yet.
          </p>
        </div>
      )}
    </section>
  );
}
