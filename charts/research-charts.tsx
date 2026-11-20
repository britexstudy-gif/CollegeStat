"use client";
import { useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { historySeries, type HistoryObservation } from "@/lib/chart-series";
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
