import { redirect } from "next/navigation";
import { CertificatesHome } from "@/components/test-prep/overview";
import { FEATURES } from "@/lib/features";
export const metadata = { title: "Test prep" };
export default function CertificatesPage() {
  if (!FEATURES.testPrep) redirect("/dashboard");
  return <CertificatesHome />;
}
