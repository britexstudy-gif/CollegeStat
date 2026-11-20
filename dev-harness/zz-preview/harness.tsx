"use client";
// TEMPORARY local preview harness. Delete before shipping.
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { WritingTool } from "@/components/college/writing-tool";
import { Personalize } from "@/components/college/onboarding-personalize";
import { OnboardingForm } from "@/components/college/onboarding";
import { useEffect } from "react";
import { AccountScope } from "@/lib/account-owner";
import { ApplicationPractice } from "@/components/college/application-practice/application-practice";
import { emptyState, type PracticeState } from "@/components/college/application-practice/store";
import "@/components/college/workspace-modern.css";
import "@/components/college/onboarding.css";
const SIM_SCENES: Record<string, string[]> = {
  common: ["Dartmouth College", "Case Western Reserve University"],
  ucas: ["University of Oxford", "Imperial College London", "University of Edinburgh"],
  assist: ["Technical University of Munich"],
  mixed: ["Dartmouth College", "University of Oxford", "Technical University of Munich", "Seoul National University", "University of Toronto"],
};
function SimScene({ scene }: { scene: string }) {
  const [state, setState] = useState<PracticeState | null>(null);
  useEffect(() => {
    Promise.all((SIM_SCENES[scene] || SIM_SCENES.common).map((q) => fetch("/api/catalog?mode=search&q=" + encodeURIComponent(q)).then((r) => r.json() as Promise<Record<string, string>[]>)))
      .then((rows) => setState({ ...emptyState(), universities: rows.map((r) => r[0]).filter(Boolean).map((u) => ({ id: u.id, name: u.name, slug: u.slug, country_code: u.country_code, city: u.city, website: u.website })) }))
      .catch(() => {});
  }, [scene]);
  return state ? <div style={{ paddingTop: 72 }}><ApplicationPractice initial={state} /></div> : null;
}
export default function Harness() {
  const [scope] = useState(() => new AccountScope());
  const params = useSearchParams();
  const view = params.get("view");
  // Question flow without an account: answers are not saved anywhere.
  if (view === "sim") return <SimScene scene={params.get("scene") || "common"} />;
  if (view === "questions") return <OnboardingForm save={async () => {}} />;
  if (view === "plan")
    return (
      <Personalize
        answers={{ name: "Timur Rakhimov", home_country: "UZ", home_city: "Tashkent", school_type: "presidential", school_name: "", exam_score: "", tests: [], activity_list: [], honours: [], certificate: "ib", graduation_year: 2027, grade_scale: "ib", grade: "38", subjects: ["Computer Science", "Mathematics"], countries: ["DE", "GB", "US", "KR"], priorities: ["cost", "ranking"], budget: 15000, funding: "partial", english_status: "taken", english_test: "ielts", english_score: "7", english_date: "2026-12", sat_status: "planned", sat_test: "sat", sat_score: "1450", sat_date: "2027-03", activities: ["coding"], languages: ["uz", "ru", "en"], start_year: 2027, apply_count: "4-7", support: ["essays"], }}
        onDone={() => alert("done")}
      />
    );
  return (
    <div style={{ padding: "110px 24px 24px", minHeight: "100vh" }}>
      <WritingTool owner="preview-owner" accountScope={scope} active addTask={async () => true} />
    </div>
  );
}
