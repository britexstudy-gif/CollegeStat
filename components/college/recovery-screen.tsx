/* eslint-disable @next/next/no-img-element -- Locally generated editorial illustration. */
"use client";
import Link from "next/link";
import { ArrowRight, Home, Search, RotateCcw, Compass } from "lucide-react";
export function RecoveryScreen({ missing = false, retry }: { missing?: boolean; retry?: () => void }) {
  return <div className={"research-page recovery-page" + (missing ? " recovery-illustrated" : "")}><section className="recovery-card">
    <div className="recovery-icon"><Compass size={34}/></div><span className="eyebrow">{missing ? "PAGE NOT FOUND · 404" : "SOMETHING WENT WRONG"}</span>
    <h1>{missing ? "Let’s find your next step." : "This page couldn’t load."}</h1>
    <p>{missing ? "This link may have changed, or the university may not be listed yet. Search the directory or return to your shortlist." : "Your saved research stays in your account. Try loading this page again, or explore another section."}</p>
    <form action="/universities" method="get" className="recovery-search"><Search size={19} aria-hidden="true"/><input name="q" aria-label="Find a university" placeholder="University, country or subject"/><button type="submit" aria-label="Search universities"><ArrowRight size={20}/></button></form>
    <div className="control-row">{retry && <button className="button button-primary" onClick={retry}><RotateCcw size={16}/>Try again</button>}
      <Link href="/" className="button button-secondary"><Home size={16}/>Home</Link><Link href="/scholarships" className="text-link">Explore scholarships <ArrowRight size={16}/></Link></div>
    <p className="caption">Missing an institution? <Link href="/support">Tell us through Support.</Link></p>
  </section>{missing && <figure className="recovery-art"><img src="/images/status/not-found-collage.webp" alt="" width={1100} height={733} /><figcaption>A new route is always possible.</figcaption></figure>}</div>;
}
