"use client";
// TEMPORARY local preview harness for the dashboard home, profile, plans and paywall. Delete before shipping.
import { HomeViewV5 } from "@/components/college/home-v5";
import { HomeViewV6 } from "@/components/college/home-v6";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CollegeContext, useCollege } from "@/components/college/provider";
import { OnePrepShell } from "@/components/college/workspace-oneprep-shell";
import { type CollegeRow, type HomeStep } from "@/components/college/workspace-oneprep-overview";
import { ProfilePage } from "@/components/college/profile-overview";
import { ProfileSettings } from "@/components/college/profile-settings";
import { PlansPage, PlansView } from "@/components/college/plans-page";
import { PaywallStep } from "@/components/college/onboarding-personalize";
import { AccountScope } from "@/lib/account-owner";
import { normalizeUniversity } from "@/lib/domain";
import { MyCollegesBoard, STATUS_VALUES } from "@/components/college/my-colleges";
import { Choice } from "@/components/college/primitives";
import { PlanCalendar } from "@/components/college/plan-calendar";
import { PlanBoard } from "@/components/college/plan-board";
import { AccountSettings } from "@/components/college/account-settings";
import { AdmissionsPage } from "@/components/college/admissions-page";
import { ApplicationPractice } from "@/components/college/application-practice/application-practice";
import { emptyState, type PracticeState } from "@/components/college/application-practice/store";
import { ReportV2 } from "@/components/college/report-v2";
import { OnboardingForm } from "@/components/college/onboarding";
import { AssistantChat } from "@/app/dashboard/assistant/assistant-chat";
import { WritingTool } from "@/components/college/writing-tool";
import type { OnePrepSection } from "@/components/college/workspace-oneprep-shell";
import "@/components/college/student-writing.css";

const today = "2026-11-16";
const uni = (id: string, name: string, slug: string, cc: string, website: string) => ({ id, name, slug, country_code: cc, website, logo_url: slug === "toronto" ? "/logos/toronto-wordmark.svg" : null }) as never;
const rows: CollegeRow[] = [
  { id: "1", name: "McGill University", href: "#", university: uni("b48ecdd6-9331-5ee8-a4ad-7f5b046d5356", "McGill University", "mcgill-university-b48ecdd6", "CA", "https://mcgill.ca"), chance: "reach", fit: "reach", status: "Applying", apply: { name: "OUAC", url: "https://ouac.on.ca" }, deadline: "2027-01-15", ready: { done: 2, total: 6 } },
  { id: "2", name: "University College London", href: "#", university: uni("4b7862dc-7567-5f81-af58-c01144412a88", "University College London", "ucl", "GB", "https://ucl.ac.uk"), chance: "reach", apply: { name: "UCAS", url: "https://ucas.com" }, deadline: "2027-01-14", ready: { done: 1, total: 5 } },
  { id: "3", name: "Technical University of Munich", href: "#", university: uni("44444444-4444-4444-8444-444444444444", "Technical University of Munich", "tum", "DE", "https://tum.de"), chance: "target", fit: "target", status: "Researching", apply: { name: "uni-assist", url: "https://uni-assist.de" }, deadline: "2027-01-31", ready: { done: 4, total: 6 } },
  { id: "4", name: "KAIST", href: "#", university: uni("bb32340f-54ba-5885-82ba-4ae645d93930", "KAIST", "kaist", "KR", "https://kaist.ac.kr"), chance: "unknown", fit: "target", deadline: "2026-11-27", ready: { done: 2, total: 4 } },
  { id: "5", name: "Nazarbayev University", href: "#", university: uni("69434102-e5f5-5311-9294-2f101f81906f", "Nazarbayev University", "nu", "KZ", "https://nu.edu.kz"), chance: "likely", deadline: "2027-03-01", ready: { done: 5, total: 5 } },
];
const steps: HomeStep[] = [
  { id: "profile", done: true, href: "#" },
  { id: "list", done: true, href: "#" },
  { id: "sorted", done: false, href: "#" },
  { id: "report", done: true, href: "#" },
  { id: "essay", done: false, href: "#" },
  { id: "deadline", done: true, href: "#" },
];
const tasks = [
  { id: "a", title: "Book the IELTS exam", done: false, due_at: "2026-11-19" },
  { id: "b", title: "Ask a teacher for a recommendation", done: false, due_at: "2026-11-14" },
  { id: "c", title: "Draft the personal statement outline", done: false, due_at: "2026-11-21" },
] as never[];
const prefs = {
  intake: {
    completed_at: "2026-11-10",
    start_year: 2027,
    graduation_year: 2027,
    details: {
      home_country: "UZ",
      home_city: "Tashkent",
      school_type: "specialised",
      school_name: "Lyceum No. 1",
      school_class: "11",
      certificate: "attestat",
      grade_scale: "five",
      grade_value: "4.8",
      tests: [
        { id: "ielts", status: "taken", score: "6.5", date: "2026-09" },
        { id: "sat", status: "planned", score: "1450", date: "2027-03" },
      ],
      subjects: ["Computer Science"],
      activity_list: [
        { type: "coding", role: "Founder", org: "School coding club", hours: "4", weeks: "30", grades: [], description: "" },
        { type: "volunteering", role: "Tutor", org: "Mahalla library", hours: "2", weeks: "20", grades: [], description: "" },
      ],
      honours: [{ title: "Bronze medal, national maths olympiad", level: "national", grade: "10", medal: "bronze" }],
      funding: "partial",
    },
  },
  plan: { waitlist_at: "2026-11-12" },
  countries: ["DE", "GB", "CA", "KR"],
  budget: 15000,
  ai_personalize: {
    version: 1,
    created_at: "2026-11-15T09:00:00Z",
    language: "en",
    summary: "Your grades are strong and your maths olympiad result stands out. English is the main gap: most UK choices ask for IELTS 7.0. Germany and Korea give affordable options within your budget.",
    country_mix: [],
    universities: [
      { slug: "technical-university-of-munich", name: "Technical University of Munich", country_code: "DE", tier: "target", reason: "Tuition-free and strong in CS; your maths fits." },
      { slug: "university-of-toronto", name: "University of Toronto", country_code: "CA", tier: "reach", reason: "Big scholarship pool for international students." },
      { slug: "seoul-national-university", name: "Seoul National University", country_code: "KR", tier: "reach", reason: "GKS covers tuition and living costs." },
      { slug: "rwth-aachen-university", name: "RWTH Aachen University", country_code: "DE", tier: "target", reason: "Engineering focus, low fees, English tracks." },
      { slug: "university-of-manchester", name: "University of Manchester", country_code: "GB", tier: "target", reason: "Accepts the national certificate with a foundation year." },
      { slug: "sejong-university", name: "Sejong University", country_code: "KR", tier: "safety", reason: "Good merit discounts and an easy English route." },
    ],
    gaps: ["IELTS below 7.0 for UK choices", "No recommendation letters yet"],
    actions: [
      { title: "Retake IELTS for 7.0", detail: "", due: "2027-01-10" },
      { title: "Shortlist two German programmes", detail: "", due: "2026-12-01" },
    ],
  },
};

function MockProvider({ children, signedIn = true, empty = false }: { children: React.ReactNode; signedIn?: boolean; empty?: boolean }) {
  const [scope] = useState(() => {
    const a = new AccountScope();
    a.changeOwner(signedIn ? "00000000-0000-4000-8000-000000000001" : null);
    return a;
  });
  const value = useMemo(
    () =>
      ({
        universities: [],
        scholarships: [],
        mode: "reference",
        loading: false,
        error: "",
        refresh: async () => {},
        user: signedIn ? { id: "00000000-0000-4000-8000-000000000001", email: "timur@example.com" } : null,
        profile: signedIn ? { id: "p1", display_name: "Timur Rakhimov", preferences: empty ? { intake: { completed_at: "x" } } : prefs } : null,
        authReady: true,
        configured: true,
        openAuth: () => {},
        saved: empty ? [] : ["1", "2", "3", "4", "5"],
        savedScholarships: [],
        toggleSaved: async () => true,
        compare: [],
        toggleCompare: () => {},
        setCompare: () => {},
        persistCompare: async () => {},
        busy: false,
        signOut: async () => {},
        refreshAccount: async () => {},
        accountScope: scope,
      }) as never,
    [scope, signedIn, empty],
  );
  return <CollegeContext.Provider value={value}>{children}</CollegeContext.Provider>;
}

function Home({ empty, v5, v6 }: { empty?: boolean; v5?: boolean; v6?: boolean }) {
  const View = v5 ? HomeViewV5 : HomeViewV6;
  useCollege();
  const [done, setDone] = useState<string[]>([]);
  return (
    <View
      displayName="Timur"
      today={today}
      dataReady
      tasks={empty ? [] : tasks.map((x: { id: string }) => ({ ...(x as object), done: done.includes(x.id) }) as never)}
      upcoming={empty ? [] : [{ id: "x", label: "Scholarship", name: "Chevening deadline", date: "2027-02-03", href: "#" }]}
      colleges={empty ? [] : rows}
      gaps={empty ? [{ id: "empty" }, { id: "english" }] : [{ id: "soon", name: "KAIST", days: 11, href: "#" }, { id: "english_low", n: 2 }, { id: "unsorted", n: 2 }]}
      steps={empty ? steps.map((s) => ({ ...s, done: s.id === "profile" })) : steps}
      report={empty ? null : { summary: prefs.ai_personalize.summary, created_at: prefs.ai_personalize.created_at, actions: prefs.ai_personalize.actions }}
      streak={empty ? 0 : 4}
      activeToday={!empty}
      week={["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"].map((day, i) => ({ day, xp: !empty && i === 0 ? 20 : 0, future: i > 0, today: i === 0 }))}
      essays={empty ? 0 : 2}
      updates={
        empty
          ? []
          : [
              { key: "a", name: "University College London", href: "#", kind: "requirements", date: "2026-11-12" },
              { key: "b", name: "Technical University of Munich", href: "#", kind: "deadline", date: "2026-11-09", detail: "Winter semester application" },
              { key: "c", name: "McGill University", href: "#", kind: "admissions", date: "2026-10-28", detail: "2025" },
            ]
      }
      plan={empty ? "free" : "plus"}
      onCompleteTask={(id, d) => setDone((x) => (d ? [...x, id] : x.filter((y) => y !== id)))}
      onTab={() => {}}
    />
  );
}

const fullUni = (id: string, name: string, slug: string, cc: string, city: string) =>
  normalizeUniversity({ id, name, slug, country_code: cc, city, website: null, logo_url: null } as never) as never;
function Colleges() {
  const list: [string, string, string, string, string, string, string | null][] = [
    ["1", "University of Toronto", "toronto", "CA", "Toronto", "Applying", "2027-01-15"],
    ["2", "University College London", "ucl", "GB", "London", "Researching", "2027-01-14"],
    ["3", "Technical University of Munich", "tum", "DE", "Munich", "Considering", "2027-01-31"],
    ["4", "KAIST", "kaist", "KR", "Daejeon", "Submitted", "2026-11-27"],
    ["5", "Nazarbayev University", "nu", "KZ", "Astana", "Researching", null],
  ];
  return (
    <MyCollegesBoard
      today={today}
      preview={{ "1": { fit: "reach", done: ["form"] }, "3": { fit: "target" }, "4": { fit: "target" }, "5": { fit: "safety" } }}
      rows={list.map(([id, name, slug, cc, city, status, date]) => ({
        id,
        status,
        university: fullUni(id, name, slug, cc, city),
        nextDeadline: date ? { date, own: true } : null,
        details: null,
        statusControl: <Choice label={"Status for " + name} value={status} onChange={() => {}} options={STATUS_VALUES.map((value) => ({ value, label: value }))} />,
        onRemove: () => {},
      }))}
    />
  );
}
function Plan() {
  return (
    <PlanBoard
      universities={new Map()}
      tasks={[...(tasks as never[]), { id: "d", title: "Collect transcripts", done: true, due_at: "2026-11-10" }, { id: "e", title: "Ask about a fee waiver", done: false, due_at: null }] as never}
      deadlines={[{ id: "x", label: "Saved scholarship", name: "Chevening", date: "2027-02-03", href: "#" }, { id: "y", label: "University", name: "KAIST", date: "2026-11-27", href: "#" }]}
      today={today}
      onCreate={() => {}}
      onUpdate={() => {}}
      onDelete={() => {}}
    />
  );
}

function View() {
  const params = useSearchParams();
  const view = params.get("view") || "home";
  if (view === "pricing")
    return (
      <MockProvider signedIn={false}>
        <PlansView />
      </MockProvider>
    );
  if (view === "paywall")
    return (
      <MockProvider empty>
        <PaywallStep onDone={() => {}} />
      </MockProvider>
    );
  const practiceUnis = [
    { id: "a", name: "Dartmouth College", country_code: "US", city: "Hanover", website: "http://www.dartmouth.edu/", slug: "" },
    { id: "b", name: "University of Oxford", country_code: "GB", city: "Oxford", website: "https://www.ox.ac.uk", slug: "" },
  ];
  const body =
    view === "welcome" ? (
      <OnboardingForm save={async () => {}} startAt={params.get("step") || undefined} />
    ) : view === "profile2" ? (
      <ProfileSettings />
    ) : view === "profile" ? (
      <ProfilePage previewColleges={rows as never} />
    ) : view === "plans" ? (
      <PlansPage />
    ) : view === "colleges" ? (
      <Colleges />
    ) : view === "plan" ? (
      <Plan />
    ) : view === "settings" ? (
      <AccountSettings />
    ) : view === "chances" ? (
      <AdmissionsPage />
    ) : view === "forms" ? (
      <ApplicationPractice initial={{ ...emptyState(), universities: practiceUnis } as unknown as PracticeState} />
    ) : view === "report" ? (
      <ReportV2
        preview={{
          today,
          tasks: tasks as never,
          home: {
            colleges: rows,
            gaps: [],
            steps,
            report: null,
            streak: 4,
            activeToday: true,
            week: ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"].map((day, i) => ({ day, xp: [30, 0, 0, 0, 0, 0, 0][i], future: i > 0, today: i === 0 })),
            essays: 2,
            updates: [],
            plan: "plus",
          },
        }}
      />
    ) : view === "ai" ? (
      <AssistantChat connected />
    ) : view === "desk" ? (
      <div className="student-studio">
        <WritingTool owner="preview-owner" accountScope={new AccountScope()} active addTask={async () => true} universities={practiceUnis as never} />
      </div>
    ) : (
      <Home empty={view === "home-empty"} v5={view === "home-v5"} v6={view === "home-v6"} />
    );
  const tab: OnePrepSection = view === "colleges" ? "Universities" : view === "plan" ? "Checklist" : view === "desk" ? "Writing" : "Overview";
  return (
    <MockProvider empty={view === "home-empty"}>
      <OnePrepShell tab={tab} onTab={() => {}} counts={view === "home-empty" ? {} : { Checklist: 3, Universities: 5 }} displayName="Timur">
        {body}
      </OnePrepShell>
    </MockProvider>
  );
}

export default function Harness() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}
