import { redirect } from "next/navigation";

/** The research Q&A page was replaced by the AI assistant; keep old links working. */
export default async function Page() {
  redirect("/dashboard/assistant");
}
