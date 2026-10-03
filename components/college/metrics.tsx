"use client";
import Link from "next/link";
import { Info, ExternalLink, ShieldCheck } from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { University, Sourced, currency, dateLabel } from "@/lib/domain";
import {
  MetricKey,
  metricDefinitions,
  valueOf,
  completeness,
  fitScore,
  Preferences,
} from "@/lib/research";
export function SourceDrawer({
  record,
  label,
  children,
}: {
  record?: Sourced | null;
  label: string;
  children: React.ReactNode;
}) {
  const source = record?.data_sources;
  const confidence = record?.confidence || "unassessed";
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className="source-trigger"
          aria-label={"View source for " + label}
        >
          {children}
        </button>
      </SheetTrigger>
      <SheetContent className="source-sheet" side="right">
        <div className="eyebrow">EVIDENCE & PROVENANCE</div>
        <SheetTitle>{label}</SheetTitle>
        <SheetDescription>
          {source
            ? "Trace this figure to its original publication."
            : "We have not found a verified source for this metric."}
        </SheetDescription>
        <span className={"confidence " + confidence}>
          <ShieldCheck size={14} />
          {source
            ? confidence === "unassessed"
              ? "Confidence not assessed"
              : confidence[0].toUpperCase() +
                confidence.slice(1) +
                " confidence"
            : "No published figure"}
          {record?.verification_status === "outdated"
            ? " · review freshness"
            : ""}
        </span>
        <dl>
          {[
            ["Organization", source?.organization],
            ["Source", source?.name],
            ["Data year", record?.year],
            ["Retrieved", dateLabel(source?.retrieved_at)],
            ["Verified", dateLabel(record?.verified_at)],
            ["Status", record?.verification_status?.replaceAll("_", " ")],
            ["License / reuse", source?.license_notes],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v || "—"}</dd>
            </div>
          ))}
        </dl>
        <p>
          {record?.notes ||
            "Confidence describes the evidence, not your likelihood of admission. Check the data year and population before comparing."}
        </p>
        {source?.url && (
          <a
            className="button button-primary"
            href={record?.source_url || source.url}
            target="_blank"
            rel="noreferrer"
          >
            Open original source
            <ExternalLink size={14} />
          </a>
        )}
        <Link className="text-link" href="/methodology">
          How we evaluate data
        </Link>
      </SheetContent>
    </Sheet>
  );
}
export function Metric({
  university: u,
  metricKey,
  showYear = true,
}: {
  university: University;
  metricKey: MetricKey;
  showYear?: boolean;
}) {
  const d = metricDefinitions.find((m) => m.key === metricKey)!,
    v = valueOf(u, metricKey);
  return (
    <SourceDrawer record={v.record} label={d.label}>
      <div className="university-stat">
        <span>
          {d.label}
          <Info size={11} />
        </span>
        <strong className={v.value == null ? "unavailable" : ""}>
          {formatMetric(u, metricKey)}
        </strong>
        {v.value != null && d.unit === "%" && (
          <div className="mini-bar">
            <i style={{ width: Math.max(0, Math.min(100, v.value)) + "%" }} />
          </div>
        )}
        <small>
          {v.value == null
            ? "No published figure"
            : showYear
              ? v.record?.year || "Year unspecified"
              : ""}
        </small>
      </div>
    </SourceDrawer>
  );
}
export function formatMetric(u: University, key: MetricKey) {
  const d = metricDefinitions.find((m) => m.key === key)!,
    v = valueOf(u, key);
  return v.value == null
    ? "—"
    : d.unit === "currency"
      ? v.currency
        ? currency(v.value, v.currency)
        : v.value.toLocaleString() + " (currency unspecified)"
      : v.value.toLocaleString() +
        (d.unit === "%" ? "%" : d.unit === ":1" ? ":1" : "");
}
export function Coverage({ university: u }: { university: University }) {
  const c = completeness(u);
  return (
    <div
      className="data-coverage"
      title="CollegeStat calculated indicator: populated metrics among ten research fields. Not a university quality score."
    >
      <span>Data coverage</span>
      <div>
        <i style={{ width: c.score + "%" }} />
      </div>
      <span>
        {c.present}/{c.total}
      </span>
    </div>
  );
}
export function FitPanel({
  university,
  preferences,
}: {
  university: University;
  preferences: Preferences;
}) {
  const f = fitScore(university, preferences);
  return (
    <section className="panel">
      <div className="split-heading">
        <h2>CollegeStat Fit</h2>
        <strong className="number">
          {f.score ?? "—"}
          {f.score != null ? " / 100" : ""}
        </strong>
      </div>
      <p className="caption">
        Calculated preference alignment, not admission probability. Missing
        dimensions are excluded. Coverage: {f.coverage}.
      </p>
      {f.components.map((c) => (
        <div key={c.key} style={{ marginTop: 20 }}>
          <div className="split-heading" style={{ marginBottom: 7 }}>
            <span>{c.label}</span>
            <strong>{c.value ?? "—"}</strong>
          </div>
          <div className="mini-bar">
            <i style={{ width: (c.value ?? 0) + "%" }} />
          </div>
          <p className="caption" style={{ marginTop: 6 }}>
            {c.value == null
              ? "Add preferences or wait for sourced data."
              : c.reason}
          </p>
        </div>
      ))}
    </section>
  );
}
