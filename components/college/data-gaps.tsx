"use client";
/* Shown on a university page when key sections have no data yet: a small illustration, what is
 * still missing, the official site and a way to ask us to add it. Nothing is hidden or invented. */
import Link from "next/link";
import { ArrowUpRight, MessageSquarePlus } from "lucide-react";
import { useT } from "./i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import "./data-gaps.css";

const CORE = ["costs", "programmes", "apply", "rankings", "outcomes"] as const;

function Illustration() {
  return (
    <svg className="dg-art" viewBox="0 0 160 120" aria-hidden="true">
      <rect x="18" y="16" width="96" height="78" rx="12" className="dg-paper" />
      <rect x="32" y="32" width="52" height="7" rx="3.5" className="dg-line" />
      <rect x="32" y="47" width="68" height="6" rx="3" className="dg-dash" />
      <rect x="32" y="60" width="40" height="6" rx="3" className="dg-dash" />
      <rect x="32" y="73" width="56" height="6" rx="3" className="dg-dash" />
      <circle cx="112" cy="78" r="22" className="dg-lens" />
      <circle cx="112" cy="78" r="13" className="dg-glass" />
      <path d="M128 94l14 14" className="dg-handle" />
      <circle cx="40" cy="104" r="3" className="dg-dot" />
      <circle cx="140" cy="28" r="4" className="dg-dot dg-dot--2" />
    </svg>
  );
}

export function DataGaps({ name, website, present }: { name: string; website?: string | null; present: readonly string[] }) {
  const t = useT();
  const missing = CORE.filter((id) => !present.includes(id));
  if (missing.length < 2) return null;
  return (
    <section className="dg" aria-labelledby="dg-title">
      <Illustration />
      <div className="dg-body">
        <h2 id="dg-title">{t("dg.title", { name })}</h2>
        <p>{t("dg.text")}</p>
        <ul>
          {missing.map((id) => (
            <li key={id}>{t(("up.nav." + id) as MessageKey)}</li>
          ))}
        </ul>
        <div className="dg-actions">
          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer" className="dg-btn">
              {t("dg.official")} <ArrowUpRight aria-hidden="true" />
            </a>
          )}
          <Link href="/support" className="dg-btn is-ghost">
            <MessageSquarePlus aria-hidden="true" /> {t("dg.ask")}
          </Link>
        </div>
      </div>
    </section>
  );
}
