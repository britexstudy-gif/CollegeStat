"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { parseResearchQuery, filterURL } from "@/lib/research";
import { useCollege } from "@/components/college/provider";
import { LandingPage } from "@/components/college/landing-v4";
// Hero search and page frame; every section's styles live in landing-v4.css.
import "@/app/startup-landing.css";

export default function Landing() {
  const s = useCollege();
  const router = useRouter();
  useEffect(() => {
    if (s.authReady && s.user) router.replace("/dashboard");
  }, [s.authReady, s.user, router]);
  const search = (text: string) => {
    const parsed = parseResearchQuery(text);
    const params = new URLSearchParams(filterURL(parsed.filters));
    if (parsed.unparsed) params.set("unresolved", parsed.unparsed);
    router.push("/universities?" + params.toString());
  };
  return <LandingPage onSearch={search} signedIn={!!s.user} />;
}
