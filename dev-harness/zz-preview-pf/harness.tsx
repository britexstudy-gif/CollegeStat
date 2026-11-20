"use client";
// TEMPORARY local preview harness (profile, onboarding, map, AI report, chips). Delete before shipping.
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ExplorerResult } from "@/lib/supabase/catalogue";
import { OnboardingForm } from "@/components/college/onboarding";
import { Personalize } from "@/components/college/onboarding-personalize";
import { PersonalizeCard } from "@/components/college/personalize-report";
import { ChanceProfileProvider } from "@/components/college/admission-chip";
import { answersFrom, type Answers } from "@/components/college/onboarding-steps";
import Directory from "@/pages-ui/directory";
import type { SavedPersonalization } from "@/lib/personalize-ai";

const answers: Answers = {
  ...answersFrom({ countries: [] }, "Timur"),
  name: "Timur",
  home_country: "UZ",
  home_city: "Tashkent",
  school_type: "presidential",
  school_name: "Presidential School Tashkent",
  school_class: "11",
  certificate: "attestat",
  graduation_year: 2027,
  start_year: 2027,
  grade_scale: "five",
  grade: "4.8",
  tests: [
    { id: "ielts", status: "taken", score: "6.5", date: "2026-09" },
    { id: "sat", status: "planned", score: "1450", date: "2027-03" },
  ],
  english_status: "taken",
  english_test: "ielts",
  english_score: "6.5",
  english_date: "2026-09",
  sat_status: "planned",
  sat_test: "sat",
  sat_score: "1450",
  sat_date: "2027-03",
  activity_list: [
    { type: "coding", role: "Founder", org: "School coding club", hours: "6", weeks: "32", grades: ["10", "11"], description: "Started a weekly Python club; 25 members." },
    { type: "volunteering", role: "Tutor", org: "", hours: "3", weeks: "40", grades: ["9", "10", "11"], description: "" },
  ],
  honours: [{ title: "Bronze medal, national maths olympiad", level: "national", grade: "" }],
  subjects: ["Computer Science", "Mathematics"],
  countries: ["DE", "GB", "US", "KR"],
  budget: 15000,
  funding: "partial",
  class_rank: "top5",
  activity_depth: { leadership: { years: "2", hours: "mid" } },
  work_after: "must",
  return_home: "yes",
  study_langs: ["english", "german"],
  loan: "maybe",
};

const report: SavedPersonalization = {
  version: 1,
  created_at: "2026-11-15T09:00:00Z",
  language: "en",
  summary:
    "Your grades are strong and your maths olympiad result stands out. English is the main gap: most of your UK and US choices ask for IELTS 7.0. Germany and Korea give you affordable options within your budget.",
  country_mix: [
    { country: "DE", share: 40, reason: "Low tuition at public universities and strong computer science." },
    { country: "KR", share: 25, reason: "Government scholarships for Central Asian students." },
    { country: "GB", share: 20, reason: "Three-year degrees; needs IELTS 7.0." },
    { country: "US", share: 15, reason: "Aid-giving colleges; SAT helps." },
  ],
  universities: [
    { slug: "technical-university-of-munich", name: "Technical University of Munich", country_code: "DE", tier: "reach", reason: "Top-ranked, competitive for informatics." },
    { slug: "university-of-edinburgh", name: "University of Edinburgh", country_code: "GB", tier: "reach", reason: "IELTS 7.0 needed." },
    { slug: "kaist", name: "KAIST", country_code: "KR", tier: "reach", reason: "Selective; scholarships for international students." },
    { slug: "rwth-aachen-university", name: "RWTH Aachen University", country_code: "DE", tier: "target", reason: "Strong engineering, low fees." },
    { slug: "university-of-leeds", name: "University of Leeds", country_code: "GB", tier: "target", reason: "IELTS 6.5 accepted for many courses." },
    { slug: "hanyang-university", name: "Hanyang University", country_code: "KR", tier: "target", reason: "Good fit for your grades." },
    { slug: "university-of-stuttgart", name: "University of Stuttgart", country_code: "DE", tier: "safety", reason: "High admit rate, within budget." },
    { slug: "arizona-state-university", name: "Arizona State University", country_code: "US", tier: "safety", reason: "Admit rate above 80%." },
    { slug: "kyung-hee-university", name: "Kyung Hee University", country_code: "KR", tier: "safety", reason: "Within budget." },
  ],
  gaps: ["IELTS 6.5 → 7.0 for UK targets", "SAT not taken yet: US options rely on it", "Studienkolleg or one year of university needed for Germany"],
  actions: [
    { title: "Book IELTS for January", detail: "Aim for 7.0 overall.", due: "2026-12-01" },
    { title: "Shortlist German programmes", detail: "Check uni-assist dates.", due: "2026-12-15" },
    { title: "Take the SAT", detail: "March sitting.", due: "2027-03-13" },
    { title: "Draft your personal statement", detail: "Start with the coding club.", due: "2027-01-20" },
    { title: "GKS application", detail: "Korean government scholarship.", due: "2027-02-28" },
  ].sort((a, b) => a.due.localeCompare(b.due)),
};

export default function Harness() {
  const params = useSearchParams();
  const view = params.get("view");
  if (view === "step") return <OnboardingForm save={async () => {}} startAt={params.get("step") || "name"} initial={params.get("empty") ? undefined : answers} />;
  if (view === "plan") return <Personalize answers={answers} onDone={() => {}} />;
  if (view === "report")
    return (
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "96px 16px 48px", display: "grid", gap: 20 }}>
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight">Your profile</h2>
        </section>
        <PersonalizeCard preview={report} />
      </div>
    );
  if (view === "list") return <ListView />;
  return null;
}

function ListView() {
  const [result, setResult] = useState<ExplorerResult | null>(null);
  useEffect(() => {
    fetch("/api/catalog?mode=explore&sort=rank&country=GB")
      .then((r) => r.json() as Promise<ExplorerResult>)
      .then((r) => Array.isArray(r?.universities) && setResult(r))
      .catch(() => {});
  }, []);
  return result ? (
    <ChanceProfileProvider value={{ ielts: 6.5, sat: 1350, budget: 20000 }}>
      <Directory initialQuery="sort=rank&country=GB" initialResult={result} />
    </ChanceProfileProvider>
  ) : null;
}
