"use client";
// TEMPORARY local preview harness for the writing desk and simulators (ws). Delete before shipping.
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OnePrepShell } from "@/components/college/workspace-oneprep-shell";
import { WritingTool } from "@/components/college/writing-tool";
import { ApplicationPractice } from "@/components/college/application-practice/application-practice";
import { emptyState, type PracticeState } from "@/components/college/application-practice/store";
import { AdmissionsPage } from "@/components/college/admissions-page";
import { AccountScope } from "@/lib/account-owner";
import type { PlatformUniversity } from "@/lib/application-platforms";
import "@/components/college/student-writing.css";

const U: Record<string, PlatformUniversity> = {
  dartmouth: { id: "0a2ceb2f-9bd6-5ddf-bdfd-593d7ddf1056", name: "Dartmouth College", country_code: "US", city: "Hanover", website: "http://www.dartmouth.edu/" },
  cwru: { id: "078c204f-52fa-5af2-94ca-1f9f24faa7d2", name: "Case Western Reserve University", country_code: "US", city: "Cleveland", website: "http://www.case.edu/" },
  oxford: { id: "33333333-3333-4333-8333-333333333333", name: "University of Oxford", country_code: "GB", city: "Oxford", website: "https://www.ox.ac.uk" },
  imperial: { id: "5ad45ea9-e51c-59e4-9ef7-6d3768be673c", name: "Imperial College London", country_code: "GB", city: "London", website: "http://www.imperial.ac.uk/" },
  edinburgh: { id: "f2f2a71c-abeb-5dc7-b18b-aa8b00611b0a", name: "University of Edinburgh", country_code: "GB", city: "Edinburgh", website: "http://www.ed.ac.uk/" },
  tum: { id: "44444444-4444-4444-8444-444444444444", name: "Technical University of Munich", country_code: "DE", city: "Munich", website: "https://www.tum.de" },
  snu: { id: "6a9e2556-fc5f-56a2-bca0-9364f099818c", name: "Seoul National University", country_code: "KR", city: "Seoul", website: "http://www.snu.ac.kr/" },
  toronto: { id: "55555555-5555-4555-8555-555555555555", name: "University of Toronto", country_code: "CA", city: "Toronto, Ontario", website: "https://www.utoronto.ca" },
};
const SCENES: Record<string, string[]> = {
  common: ["dartmouth", "cwru"],
  ucas: ["oxford", "imperial", "edinburgh"],
  assist: ["tum"],
  direct: ["snu"],
  mixed: ["dartmouth", "oxford", "tum", "snu", "toronto"],
};
function useUnis(scene: string) {
  return (SCENES[scene] || SCENES.common).map((k) => U[k]);
}
function View() {
  const params = useSearchParams();
  const view = params.get("view") || "desk";
  const scene = params.get("scene") || (view === "desk" ? "mixed" : "common");
  const unis = useUnis(scene);
  const [scope] = useState(() => new AccountScope());
  const body =
    view === "sim" ? (
      <ApplicationPractice initial={{ ...emptyState(), universities: unis.map((u) => ({ ...u, slug: "", city: u.city ?? null, website: u.website ?? null })) } as PracticeState} />
    ) : view === "admit" ? (
      <AdmissionsPage />
    ) : (
      <div className="student-studio">
        <WritingTool owner="preview-owner" accountScope={scope} active addTask={async () => true} universities={unis} />
      </div>
    );
  return (
    <OnePrepShell tab={view === "desk" ? "Writing" : "Overview"} onTab={() => {}} counts={{}} displayName="Timur">
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
