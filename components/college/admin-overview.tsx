import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock,
  Database,
  FileCheck2,
  GraduationCap,
  Images,
  Link2,
  MessageSquare,
  Search,
  ShieldCheck,
  Trophy,
  Upload,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { STAFF_PATH } from "@/lib/staff-route";

const sectionHref = (name: string) => `${STAFF_PATH}/${name.toLowerCase()}`;

/** Presentation only: authorization and live reads stay in the staff page. */
export function AdminOverview({
  counts,
  loading,
  updatedAt,
}: {
  counts: Record<string, number>;
  loading: boolean;
  updatedAt: Date | null;
}) {
  const count = (key: string) =>
    loading ? "…" : (counts[key]?.toLocaleString() ?? "—");
  const countLabel = (key: string, suffix: string) =>
    loading
      ? "Loading…"
      : counts[key] === undefined
        ? "Count unavailable"
        : `${counts[key].toLocaleString()} ${suffix}`;

  return (
    <>
      <div className="admin-overview-intro">
        <span className="admin-live-label" role="status">
          <Database size={14} aria-hidden="true" /> Hosted catalogue
          <span>·</span>
          {loading
            ? "Refreshing…"
            : updatedAt
              ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Counts unavailable"}
        </span>
        <Link className="sb-btn sb-btn-primary" href={sectionHref("Review")}>
          <ClipboardCheck size={15} aria-hidden="true" /> Review evidence
        </Link>
      </div>
      <div
        className="admin-summary-grid"
        role="group"
        aria-label="Catalogue at a glance"
        aria-busy={loading}
      >
        {(
          [
            [
              "Universities",
              "universities",
              "Institution records",
              GraduationCap,
            ],
            ["Scholarships", "scholarships", "Funding opportunities", Wallet],
            ["Review", "pending_reviews", "Awaiting review", ClipboardCheck],
            ["Sources", "data_sources", "Registered sources", Database],
          ] as const
        ).map(([section, key, caption, Icon]) => (
          <Link
            className="admin-summary-card"
            href={sectionHref(section)}
            key={key}
          >
            <span className="admin-summary-label">
              <Icon size={17} aria-hidden="true" />
              {section === "Review" ? "Pending reviews" : section}
              <ArrowUpRight size={14} aria-hidden="true" />
            </span>
            <strong
              aria-label={
                counts[key] === undefined && !loading
                  ? "Count unavailable"
                  : undefined
              }
            >
              {count(key)}
            </strong>
            <small>
              {counts[key] === undefined && !loading
                ? "Count unavailable"
                : caption}
            </small>
          </Link>
        ))}
      </div>
      <div className="admin-operations-grid">
        <section
          className="admin-panel admin-attention"
          aria-labelledby="staff-queue-title"
        >
          <div className="admin-panel-heading">
            <div>
              <h2 id="staff-queue-title">Needs attention</h2>
              <p>Your next steps for a reliable catalogue.</p>
            </div>
            <Link
              href={sectionHref("Coverage")}
              aria-label="Inspect university coverage"
            >
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
          {(
            [
              [
                "Review",
                "Review staged evidence",
                "Confirm the original source, year and student population.",
                "pending_reviews",
                "awaiting review",
                ClipboardCheck,
              ],
              [
                "Coverage",
                "Complete university profiles",
                "Inspect missing subjects, admissions, costs and campus media.",
                "data_quality_checks",
                "quality warnings",
                FileCheck2,
              ],
              [
                "Inbox",
                "Messages & issue reports",
                "Read student questions and resolve reported catalogue issues.",
                null,
                "Open inbox",
                MessageSquare,
              ],
              [
                "Stale",
                "Refresh older information",
                "Recheck time-sensitive evidence against the original publisher.",
                null,
                "Check freshness",
                Clock,
              ],
            ] as const
          ).map(([section, title, description, key, label, Icon]) => (
            <Link
              className="admin-task-row"
              href={sectionHref(section)}
              key={section}
            >
              <span className="admin-task-icon">
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="admin-task-copy">
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <span className="admin-task-count">
                {key ? countLabel(key, label) : label}
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </section>
        <section
          className="admin-panel admin-profile-tools"
          aria-labelledby="staff-profile-tools-title"
        >
          <div className="admin-panel-heading">
            <div>
              <h2 id="staff-profile-tools-title">University workspace</h2>
              <p>Everything behind a useful profile.</p>
            </div>
            <GraduationCap size={20} aria-hidden="true" />
          </div>
          <div className="admin-tool-grid">
            {(
              [
                ["Universities", "Identity & logos", GraduationCap],
                ["Programs", "Subjects & degrees", BookOpen],
                ["Requirements", "Entry requirements", FileCheck2],
                ["Deadlines", "Admissions dates", CalendarDays],
                ["Aid", "Costs & funding", Wallet],
                ["Rankings", "Rankings & editions", Trophy],
                ["Faculty", "People & faculty", Users],
                ["Media", "Photos & videos", Images],
              ] as const
            ).map(([section, label, Icon]) => (
              <Link href={sectionHref(section)} key={section}>
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
                <ArrowUpRight size={12} aria-hidden="true" />
              </Link>
            ))}
          </div>
          <Link className="admin-panel-footer" href={sectionHref("Coverage")}>
            <Search size={15} aria-hidden="true" /> Inspect a university{" "}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>
      </div>
      <div className="admin-lower-grid">
        <section className="admin-panel" aria-labelledby="staff-pipeline-title">
          <div className="admin-panel-heading">
            <div>
              <h2 id="staff-pipeline-title">From source to profile</h2>
              <p>Every published fact starts with evidence.</p>
            </div>
            <ShieldCheck size={19} aria-hidden="true" />
          </div>
          <nav className="admin-pipeline" aria-label="Publication workflow">
            {(
              [
                [
                  "Sources",
                  "Original source",
                  "Keep the publisher and URL",
                  Link2,
                ],
                [
                  "Imports",
                  "Stage observations",
                  "Attach the year and scope",
                  Upload,
                ],
                [
                  "Review",
                  "Review & publish",
                  "Resolve issues before release",
                  Check,
                ],
              ] as const
            ).map(([section, title, description, Icon], index) => (
              <Link href={sectionHref(section)} key={section}>
                <span className="admin-pipeline-icon">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <small>0{index + 1}</small>
                <strong>{title}</strong>
                <span>{description}</span>
              </Link>
            ))}
          </nav>
        </section>
        <section className="admin-panel" aria-labelledby="staff-activity-title">
          <div className="admin-panel-heading">
            <div>
              <h2 id="staff-activity-title">Recorded activity</h2>
              <p>Accounts and audit events in the database.</p>
            </div>
          </div>
          <div className="admin-activity-list">
            {(
              [
                ["Users", "profiles", "Registered accounts", Users],
                ["Users", "recent_signups", "New accounts · 7 days", UserPlus],
                [
                  "Reports",
                  "recent_changes",
                  "Audit events · 7 days",
                  Activity,
                ],
              ] as const
            ).map(([section, key, label, Icon]) => (
              <Link href={sectionHref(section)} key={key}>
                <Icon size={15} aria-hidden="true" />
                <span>{label}</span>
                <strong
                  title={
                    counts[key] === undefined ? "Count unavailable" : undefined
                  }
                >
                  {count(key)}
                </strong>
              </Link>
            ))}
          </div>
          <p className="admin-activity-note">
            These counts do not indicate visits or online presence.
          </p>
        </section>
      </div>
    </>
  );
}
