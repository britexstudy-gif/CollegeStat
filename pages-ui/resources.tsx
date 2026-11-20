"use client";

import "@/app/resource-library-oct11.css";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, BookOpen } from "lucide-react";
import {
  AdmissionPlanner,
  type AdmissionPlannerSection,
} from "@/components/college/admission-planner";

/** Application planning is a tool; external articles open at their publishers. */
export default function Resources({
  section = "destinations",
  universitySlug = "",
}: {
  section?: AdmissionPlannerSection;
  universitySlug?: string;
}) {
  const inWorkspace = /^\/dashboard(?:\/|$)/.test(usePathname());
  const articlesHref = inWorkspace ? "/dashboard/library/articles" : "/articles";
  return (
    <div className="research-page resources-page lib-oct11 resources-focused-oct12">
      <header className="resource-hero">
        <div>
          <p className="section-caption">Resources</p>
          <h1>Plan your next step.</h1>
          <p>
            Check qualifications by destination, rehearse an application or open
            official study resources. Choose the tool you need below.
          </p>
          <Link href={articlesHref} className="text-link resource-articles-link">
            <BookOpen size={17} aria-hidden="true" />
            Read university articles <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </header>
      <AdmissionPlanner initialSection={section} universitySlug={universitySlug} />
    </div>
  );
}
