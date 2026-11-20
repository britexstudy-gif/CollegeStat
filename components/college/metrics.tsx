"use client";
import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Sourced, dateLabel } from "@/lib/domain";
import { originalSourceURL, SourceEvidenceDetails } from "./primitives";
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
  const sourceURL = originalSourceURL(record);
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
          {sourceURL
            ? "Trace this figure to its original publication."
            : "We have not found a verified source for this metric."}
        </SheetDescription>
        <span className={"confidence " + confidence}>
          <ShieldCheck size={14} />
          {sourceURL
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
            ["Verified", dateLabel(record?.verified_at)],
            ["Status", record?.verification_status?.replaceAll("_", " ")],
            ["License / reuse", source?.license_notes],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v || "—"}</dd>
            </div>
          ))}
          <SourceEvidenceDetails record={record} />
        </dl>
        <p>
          {record?.notes ||
            "Confidence describes the evidence, not your likelihood of admission. Check the data year and population before comparing."}
        </p>
        {sourceURL && (
          <a
            className="button button-primary"
            href={sourceURL}
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
