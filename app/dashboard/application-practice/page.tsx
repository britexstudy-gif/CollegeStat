import { Suspense } from "react";
import { ApplicationPractice } from "@/components/college/application-practice/application-practice";
export const metadata = { title: "Application forms" };
export default function ApplicationPracticePage() {
  return (
    <Suspense fallback={null}>
      <ApplicationPractice />
    </Suspense>
  );
}
