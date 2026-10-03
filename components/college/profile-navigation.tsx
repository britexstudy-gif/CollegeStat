"use client";
import { useLiquidGlass } from "./use-liquid-glass";
import {
  BookOpen,
  Building2,
  FileText,
  FlaskConical,
  GraduationCap,
  LayoutDashboard,
  Trophy,
  Wallet,
  Images,
  type LucideIcon,
} from "lucide-react";
import {
  profileNavigation,
  type ProfileSection,
} from "@/lib/profile-navigation";
const icons: Record<ProfileSection, LucideIcon> = {
  Overview: LayoutDashboard,
  Admissions: FileText,
  Academics: GraduationCap,
  Costs: Wallet,
  Rankings: Trophy,
  Research: FlaskConical,
  Campus: Building2,
  Gallery: Images,
  Sources: BookOpen,
};
export function ProfileNavigation({
  selected,
  onSelect,
}: {
  selected: ProfileSection;
  onSelect: (section: ProfileSection) => void;
}) {
  const glass = useLiquidGlass<HTMLButtonElement>();
  return (
    <nav className="profile-glass-tabs" role="tablist" aria-label="University sections">
      {profileNavigation.map((section, index) => {
        const Icon = icons[section.id];
        return <button key={section.id} id={"section-" + section.id} type="button"
          ref={selected === section.id ? glass : undefined} data-glass={selected === section.id ? "rim" : undefined}
          role="tab" aria-selected={selected === section.id} aria-controls="university-panel"
          tabIndex={selected === section.id ? 0 : -1}
          onClick={() => onSelect(section.id)}
          onKeyDown={(event) => {
            const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            const next = direction ? (index + direction + profileNavigation.length) % profileNavigation.length
              : event.key === "Home" ? 0 : event.key === "End" ? profileNavigation.length - 1 : null;
            if (next === null) return;
            event.preventDefault();
            onSelect(profileNavigation[next].id);
            const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]");
            buttons?.[next]?.focus();
            buttons?.[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
          }}>
          <Icon size={17} aria-hidden="true" /><span>{section.label}</span>
        </button>;
      })}
    </nav>
  );
}
