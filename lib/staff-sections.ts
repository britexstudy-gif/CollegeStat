import {
  Activity,
  BookOpen,
  CalendarDays,
  CircleDashed,
  ClipboardCheck,
  Clock,
  Database,
  FileCheck2,
  Fingerprint,
  FlaskConical,
  GraduationCap,
  Images,
  LayoutDashboard,
  Link2,
  MessageSquare,
  PlugZap,
  Radio,
  ScrollText,
  Settings,
  ShieldCheck,
  Trophy,
  Upload,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { STAFF_PATH } from "./staff-route";

/** Single source of truth for the staff console's sections: navigation area,
 * sidebar category, display label, icon, backing table and page description.
 * lib/staff-route.ts keeps the lightweight slug allowlist used by routing;
 * tests/staff-sections.test.ts keeps the two in sync. */
export type StaffArea = "Overview" | "Catalogue" | "Review" | "Operations";
export type StaffSection = {
  name: string;
  area: StaffArea;
  icon: LucideIcon;
  /** Sidebar sub-heading; also matched by the section filter. */
  category?: string;
  label?: string;
  table?: string;
  description?: string;
};

export const STAFF_SECTIONS: readonly StaffSection[] = [
  {
    name: "Overview",
    area: "Overview",
    icon: LayoutDashboard,
    description:
      "Manage university profiles, review incoming evidence and keep information current.",
  },
  {
    name: "Activity",
    area: "Overview",
    icon: Activity,
    label: "Activity & people",
    description:
      "Account growth, recorded database changes and the people directory. Visit analytics are not connected.",
  },
  {
    name: "Coverage",
    area: "Overview",
    icon: CircleDashed,
    description:
      "Find an institution and check where its source-backed evidence needs attention.",
  },
  {
    name: "Review",
    area: "Review",
    icon: ClipboardCheck,
    table: "source_records",
    description:
      "Check staged evidence before deciding whether it is ready for publication.",
  },
  {
    name: "Inbox",
    area: "Review",
    icon: MessageSquare,
    label: "Messages & issue reports",
    description:
      "Review support messages and student issue reports, then track their resolution.",
  },
  {
    name: "Candidates",
    area: "Review",
    icon: UserPlus,
    label: "New institutions",
    table: "institution_candidates",
    description:
      "Reconcile proposed institutions against the existing catalogue before creating another identity.",
  },
  {
    name: "Stale",
    area: "Review",
    icon: Clock,
    label: "Outdated evidence",
    table: "stale_evidence",
    description:
      "Find evidence that needs a fresh source check. An old observation remains part of its reporting history.",
  },
  {
    name: "Universities",
    area: "Catalogue",
    icon: GraduationCap,
    category: "Institution profiles",
    table: "universities",
    description:
      "Manage institution identity, location and publication status.",
  },
  {
    name: "Media",
    area: "Catalogue",
    icon: Images,
    category: "Institution profiles",
    table: "media",
    description:
      "Manage campus photographs and media with source attribution and reuse rights.",
  },
  {
    name: "Programs",
    area: "Catalogue",
    icon: BookOpen,
    category: "Admissions & study",
    table: "programs",
    description:
      "Inspect degree records and their connections to universities. Confirm current offering evidence before publishing.",
  },
  {
    name: "Requirements",
    area: "Catalogue",
    icon: FileCheck2,
    category: "Admissions & study",
    table: "requirements",
    description:
      "Keep entry requirements attached to their official source, applicant scope and reporting year.",
  },
  {
    name: "Deadlines",
    area: "Catalogue",
    icon: CalendarDays,
    category: "Admissions & study",
    table: "deadlines",
    description:
      "Manage application dates with the correct intake, round and applicant population.",
  },
  {
    name: "Scholarships",
    area: "Catalogue",
    icon: Wallet,
    category: "Costs & funding",
    table: "scholarships",
    description:
      "Manage sourced awards, eligibility, amounts and dates. Connect an award to institutions in Award connections.",
  },
  {
    name: "Connections",
    area: "Catalogue",
    icon: Link2,
    category: "Costs & funding",
    label: "Award connections",
    table: "university_scholarships",
    description:
      "Attach an existing scholarship to a university using their record IDs, without duplicating its award details. Edit the award in Scholarships; each connection appears on the university’s funding page.",
  },
  {
    name: "Aid",
    area: "Catalogue",
    icon: Wallet,
    category: "Costs & funding",
    label: "Financial aid",
    table: "financial_aid",
    description:
      "Review financial aid records with their source, reporting period and student population.",
  },
  {
    name: "Rankings",
    area: "Catalogue",
    icon: Trophy,
    category: "Rankings & research",
    table: "ranking_providers",
    description:
      "Inspect publishers, editions and entries separately. Preserve the publisher’s rank labels and methodology.",
  },
  {
    name: "Departments",
    area: "Catalogue",
    icon: Users,
    category: "Rankings & research",
    table: "departments",
    description:
      "Manage academic departments and their institution connections.",
  },
  {
    name: "Faculty",
    area: "Catalogue",
    icon: Users,
    category: "Rankings & research",
    table: "professors",
    description:
      "Manage faculty records with institution links and supporting sources.",
  },
  {
    name: "Research",
    area: "Catalogue",
    icon: FlaskConical,
    category: "Rankings & research",
    table: "research",
    description: "Inspect research records and their institution connections.",
  },
  {
    name: "Sources",
    area: "Operations",
    icon: Database,
    category: "Sources & pipelines",
    table: "data_sources",
    description:
      "Inspect the original publisher, URL and source metadata used to support catalogue facts.",
  },
  {
    name: "Imports",
    area: "Operations",
    icon: Upload,
    category: "Sources & pipelines",
    table: "data_imports",
    description:
      "Validate and stage sourced observations, then inspect each publication decision in Review.",
  },
  {
    name: "Feeds",
    area: "Operations",
    icon: Radio,
    category: "Sources & pipelines",
    label: "Scheduled feeds",
    table: "ingestion_feeds",
    description:
      "Inspect configured ingestion feeds and their source connections.",
  },
  {
    name: "Jobs",
    area: "Operations",
    icon: Activity,
    category: "Sources & pipelines",
    label: "Ingestion jobs",
    table: "ingestion_jobs",
    description:
      "Monitor ingestion attempts, inspect errors and retry failed jobs deliberately.",
  },
  {
    name: "Identifiers",
    area: "Operations",
    icon: Fingerprint,
    category: "Sources & pipelines",
    label: "Institution IDs",
    table: "external_identifiers",
    description:
      "Inspect the external identifiers used to reconcile institutions across sources.",
  },
  {
    name: "Mcp",
    area: "Operations",
    icon: PlugZap,
    category: "Sources & pipelines",
    label: "AI & MCP",
    description:
      "Search the catalogue, inspect evidence and stage observations for review.",
  },
  {
    name: "Structure",
    area: "Operations",
    icon: Database,
    category: "Sources & pipelines",
    label: "Database structure",
    description:
      "Preview columns, relationships and policy metadata from the database. This is a read-only staff tool, not a SQL editor.",
  },
  {
    name: "Users",
    area: "Operations",
    icon: Users,
    category: "Accounts & administration",
    table: "profiles",
    description:
      "Inspect registered profiles. An account count does not measure visits or active users.",
  },
  {
    name: "Reports",
    area: "Operations",
    icon: ScrollText,
    category: "Accounts & administration",
    label: "Audit history",
    table: "audit_logs",
    description:
      "Inspect recorded database changes and review decisions in the audit history.",
  },
  {
    name: "Settings",
    area: "Operations",
    icon: Settings,
    category: "Accounts & administration",
    description:
      "Review operational configuration and where provider settings are managed.",
  },
  {
    name: "Security",
    area: "Operations",
    icon: ShieldCheck,
    category: "Accounts & administration",
    description: "Manage your authenticator and verified staff session.",
  },
];

/** Primary rail: each area opens on its first section. */
export const STAFF_AREAS: readonly {
  area: StaffArea;
  entry: string;
  icon: LucideIcon;
}[] = [
  { area: "Overview", entry: "Overview", icon: LayoutDashboard },
  { area: "Catalogue", entry: "Universities", icon: Database },
  { area: "Review", entry: "Review", icon: ClipboardCheck },
  { area: "Operations", entry: "Sources", icon: Settings },
];

const byName = new Map(
  STAFF_SECTIONS.map((section) => [section.name, section]),
);

export const staffSection = (name: string) => byName.get(name);
export const staffSectionLabel = (name: string) =>
  byName.get(name)?.label ?? name;
export const staffSectionIcon = (name: string) =>
  byName.get(name)?.icon ?? Database;
export const staffSectionTable = (name: string) => byName.get(name)?.table;
export const staffSectionArea = (name: string): StaffArea =>
  byName.get(name)?.area ?? "Overview";
export const staffSectionHref = (name: string) =>
  name === "Overview" ? STAFF_PATH : STAFF_PATH + "/" + name.toLowerCase();
