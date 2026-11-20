"use client";
import { Page } from "./dash-ui";
import { ApplySim } from "./apply-sim";

/** Imkoniyatlar: apply to one university in its real portal's style, then open a practice decision. */
export function AdmissionsPage() {
  return (
    <Page className="chances-page">
      <ApplySim />
    </Page>
  );
}
