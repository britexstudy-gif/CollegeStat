"use client";
import Link from "next/link";
import { countryName, dateLabel } from "@/lib/domain";
import { ArrowUpRight, GraduationCap } from "lucide-react";
import { useCollege } from "./provider";
import { filterScholarships } from "@/lib/scholarship-discovery";
export function HomeScholarships() {
  const s = useCollege();
  const awards = filterScholarships(s.scholarships, { query:"", funding:"all", level:"all", includeClosed:false, today:new Date().toISOString().slice(0,10) }).slice(0,3);
  if (!awards.length) return null;
  return <section className="home-awards"><header className="section-title-row"><div><span className="section-caption">FUND YOUR NEXT STEP</span><h2>Scholarships to explore.</h2><p className="caption">Start with eligibility, then plan around the official dates.</p></div><Link className="text-link" href="/scholarships">All scholarships <ArrowUpRight size={16}/></Link></header>
    <div className="linked-award-grid">{awards.map(a => <article key={a.id}><GraduationCap size={23}/><span className="caption">{a.level}{a.country_code ? " · " + countryName(a.country_code) : ""}</span><h3>{a.name}</h3><p className="caption">Deadline {a.deadline ? dateLabel(a.deadline) : "not yet published"}</p><Link className="text-link" href={"/scholarships/" + a.slug}>Eligibility & application <ArrowUpRight size={15}/></Link></article>)}</div>
  </section>;
}
