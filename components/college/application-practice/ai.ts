/** Feedback request for the practice forms. Same endpoint and answer shape as
 * the writing desk's check: the AI gives questions and suggestions, never a
 * rewrite of the essay. */
import { getSupabase } from "@/lib/supabase/client";
import { studentAIReply, type StudentAIResult } from "@/lib/student-ai";
import type { Lang } from "@/lib/i18n/languages";

export async function askFeedback(mode: "essay_feedback" | "application_review", text: string, language: Lang, fallback: string): Promise<StudentAIResult> {
  const session = await getSupabase()?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error(fallback);
  const res = await fetch("/api/student-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ mode, text: text.slice(0, 8000), consent: true, language }),
  });
  const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : fallback);
  return studentAIReply.parse(data).result;
}
