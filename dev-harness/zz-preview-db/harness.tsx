"use client";
// TEMPORARY local preview harness for the dashboard (db). Delete before shipping.
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OnePrepShell } from "@/components/college/workspace-oneprep-shell";
import { AgentChat } from "@/components/college/agent-chat";
import { ReportView } from "@/components/college/personal-report";
import { ScholarshipsDirectory } from "@/components/college/scholarships-directory";
import { PlansPage } from "@/components/college/plans-page";
import { PeoplePage } from "@/components/college/people-page";
import { CertificatesHome, CertificateFolder } from "@/components/college/certificates-library";
import { examBySlug } from "@/lib/certificates";
import type { PersonalPlan } from "@/components/college/onboarding-plan";

const today = "2026-11-14";
const uni = (id: string, name: string, slug: string, cc: string) =>
  ({ id, name, slug, country_code: cc, website: null, logo_url: null }) as never;
const tracker = [
  { id: "1", status: "Applying", deadline: "2027-01-15", university: uni("1", "University of Toronto", "university-of-toronto", "CA") },
  { id: "2", status: "Researching", deadline: "2027-01-31", university: uni("2", "Technical University of Munich", "tum", "DE") },
  { id: "3", status: "Considering", deadline: null, university: uni("3", "KAIST", "kaist", "KR") },
];
const tasks = [
  { id: "a", title: "Book the IELTS exam", done: false, due_at: "2026-11-17" },
  { id: "b", title: "Ask a teacher for a recommendation", done: false, due_at: "2026-11-12" },
  { id: "c", title: "Draft the personal statement outline", done: false, due_at: null },
];
const plan: PersonalPlan = {
  version: 1,
  created_at: "2026-11-10T10:00:00Z",
  universities: [
    { id: "1", slug: "university-of-toronto", name: "University of Toronto", country_code: "CA", city: "Toronto", tier: "reach", rank: { provider: "qs", rank: 25 }, acceptance: 43, tuition_usd: 45000 },
    { id: "2", slug: "tum", name: "Technical University of Munich", country_code: "DE", city: "Munich", tier: "match", rank: { provider: "qs", rank: 28 }, tuition_usd: 3000 },
    { id: "3", slug: "kaist", name: "KAIST", country_code: "KR", city: "Daejeon", tier: "safety", acceptance: 60 },
  ],
  tests: [{ kind: "english", status: "planned", test: "ielts", target: 7, date: "2027-02-10" }],
  timeline: [
    { date: "2027-01-15", kind: "deadline", title: "University of Toronto deadline", href: "/dashboard/university/university-of-toronto" },
    { date: "2027-02-10", kind: "english", title: "IELTS exam" },
  ],
  scholarships: [{ slug: "chevening", name: "Chevening", country: "United Kingdom", funding: "full", deadline: "2027-02-03", provider: null }],
};

function View() {
  const params = useSearchParams();
  const [view] = useState(() => params.get("view") || "home");
  const [, setN] = useState(0);
  const base = {
    displayName: "Timur",
    today,
    onCompleteTask: () => setN((n) => n + 1),
    onTab: () => {},
  };
  const body =
    view === "home-empty" ? (
      <p>Home preview moved to /zz-d2</p>
    ) : view === "assistant" ? (
      <AgentChat connected />
    ) : view === "report" ? (
      <ReportView plan={plan} name="Timur Rakhimov" />
    ) : view === "plans" ? (
      <PlansPage />
    ) : view === "people" ? (
      <PeoplePage />
    ) : view === "tests" ? (
      <CertificatesHome />
    ) : view.startsWith("test-") ? (
      <CertificateFolder
        exam={examBySlug(view.slice(5))!}
        schools={[
          { id: "1", name: "University of Toronto", slug: "university-of-toronto", country: "Canada", minimum: 6.5, varies: false, source: "https://future.utoronto.ca/english-language-requirements" },
          { id: "2", name: "Technical University of Munich", slug: "tum", country: "Germany", minimum: 6.5, varies: true, source: "https://www.tum.de" },
        ]}
      />
    ) : view === "sch" ? (
      <ScholarshipsDirectory />
    ) : (
      <p>Home preview moved to /zz-d2</p>
    );
  return (
    <OnePrepShell tab="Overview" onTab={() => {}} counts={{ Checklist: 3 }} displayName="Timur">
      {body}
    </OnePrepShell>
  );
}
export default function Harness() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}
