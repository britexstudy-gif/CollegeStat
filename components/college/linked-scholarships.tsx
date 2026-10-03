import Link from "next/link";
import { ArrowUpRight, CalendarDays, GraduationCap } from "lucide-react";
import type { University } from "@/lib/domain";
import { SaveButton } from "./save-button";
import { scholarshipDeadline } from "@/lib/scholarship-discovery";
export function LinkedScholarships({ university }: { university: University }) {
  const awards = university.university_scholarships.flatMap(l => l.scholarships ? [l.scholarships] : []);
  if (!awards.length) return null;
  return <section className="linked-scholarships"><header className="section-title-row"><div><span className="eyebrow">UNIVERSITY SCHOLARSHIPS</span><h2>Funding connected to this university.</h2></div><Link href={"/scholarships?university=" + university.id} className="text-link">Browse awards <ArrowUpRight size={15}/></Link></header>
    <div className="linked-award-grid">{awards.map(a => <article key={a.id}><GraduationCap size={22}/><h3>{a.name}</h3><p>{a.description}</p><p className="caption"><CalendarDays size={14}/> {a.deadline || "Confirm deadline with provider"} · {a.level} · {scholarshipDeadline(a, new Date().toISOString().slice(0,10)) === "closed" ? "Past cycle" : "Review current cycle"}</p>
      <div className="control-row"><a className="button button-primary" href={a.application_url || undefined} target="_blank" rel="noreferrer">Eligibility & application <ArrowUpRight size={15}/></a><SaveButton id={a.id} scholarship/></div>
    </article>)}</div></section>;
}
