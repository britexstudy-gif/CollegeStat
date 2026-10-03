"use client";
import Image from "next/image";
import { useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  FileCheck2,
  FileText,
  Globe2,
  GraduationCap,
  Wallet,
} from "lucide-react";
import type { University } from "@/lib/domain";
import type { ApplicationRoute } from "@/lib/application-routes";
import { applicationLinks } from "@/lib/application-routes";
import { UniversityLogo } from "./primitives";

export function ApplicationPlatformBadge({
  route,
  university,
}: {
  route?: ApplicationRoute;
  university?: University;
}) {
  const [failed, setFailed] = useState(false);
  const asset =
    route?.platform === "common-app"
      ? "common-app"
      : route?.platform === "ucas"
        ? "ucas"
        : undefined;
  if (route?.platform === "university" && university)
    return (
      <span className="platform-mark">
        <UniversityLogo university={university} />
      </span>
    );
  return (
    <span
      className={
        "platform-mark" + (asset && !failed ? " platform-" + asset : "")
      }
      aria-hidden="true"
    >
      {asset && !failed ? (
        <Image
          src={"/logos/applications/" + asset + ".svg"}
          alt=""
          width={asset === "common-app" ? 163 : 130}
          height={asset === "common-app" ? 65 : 40}
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <FileText size={26} />
      )}
    </span>
  );
}

const resourceIcons = {
  Admissions: GraduationCap,
  "Entry requirements": FileCheck2,
  "Program directory": BookOpen,
  "Application portal": FileText,
  "Funding & scholarships": Wallet,
  "University website": Globe2,
};
export function OfficialApplicationLinks({
  university,
}: {
  university: University;
}) {
  return (
    <nav
      className="application-link-grid"
      aria-label="Official application resources"
    >
      {applicationLinks(university).map((link) => {
        const Icon =
          resourceIcons[link.name as keyof typeof resourceIcons] || FileText;
        return (
          <a key={link.name} href={link.url} target="_blank" rel="noreferrer">
            <Icon size={19} aria-hidden="true" />
            <span>{link.name}</span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        );
      })}
    </nav>
  );
}
