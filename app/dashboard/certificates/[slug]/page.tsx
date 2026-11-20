import { redirect } from "next/navigation";
import { FEATURES } from "@/lib/features";
import Folder from "./folder";

export default async function CertificateFolderPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!FEATURES.testPrep) redirect("/dashboard");
  const { slug } = await params;
  return <Folder slug={slug} />;
}
