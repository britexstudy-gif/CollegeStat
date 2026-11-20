import { redirect } from "next/navigation";
import { FEATURES } from "@/lib/features";
export default function LegacyCertificatesPage() {
  redirect(FEATURES.testPrep ? "/dashboard/certificates" : "/dashboard");
}
