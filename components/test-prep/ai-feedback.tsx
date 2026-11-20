"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ShiningText } from "@/components/ui/shining-text";
import { getSupabase } from "@/lib/supabase/client";
import { studentAIReply, type StudentAIResult } from "@/lib/student-ai";
import { recordActivity } from "@/lib/progress-store";
import { useCollege } from "@/components/college/provider";
import { useI18n, useT } from "@/components/college/i18n";

type Cert = "ielts" | "toefl" | "duolingo";

/** What the AI is asked to judge, per exam. Official descriptors are named so
 * feedback follows them; the server rules forbid issuing an official score. */
const CRITERIA: Record<Cert, { writing: string; speaking: string }> = {
  ielts: {
    writing: "the four public IELTS Writing criteria: Task Achievement/Response, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy",
    speaking: "the four public IELTS Speaking criteria: Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, Pronunciation (judge only what a transcript can show)",
  },
  toefl: {
    writing: "the public TOEFL iBT writing expectations: task completion, development of ideas, organisation, appropriate tone, and language accuracy",
    speaking: "the public TOEFL iBT speaking expectations: relevance, development, accuracy and accurate repetition (judge only what a transcript can show)",
  },
  duolingo: {
    writing: "the Duolingo English Test writing subscores: content, coherence, vocabulary and grammar",
    speaking: "the Duolingo English Test speaking expectations: content, fluency and vocabulary (judge only what a transcript can show)",
  },
};

export function buildFeedbackRequest(exam: Cert, mode: "writing" | "speaking", task: string, prompt: string, response: string, words: number) {
  return [
    `Practice task: ${task} (${exam.toUpperCase()}, ${mode}).`,
    `Give feedback against ${CRITERIA[exam][mode]}. Start the summary with one line per criterion, then name the single most useful change. Be specific and quote short phrases from the response. Do not rewrite the whole answer.`,
    `Task prompt:\n${prompt}`,
    `Student response (${words} words):\n${response}`,
  ]
    .join("\n\n")
    .slice(0, 8000);
}

async function ask(exam: Cert, text: string, language: string, fallback: string): Promise<StudentAIResult> {
  const session = await getSupabase()?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("auth");
  const res = await fetch("/api/student-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ mode: "certificate_practice", certificate: exam, text, consent: true, language }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const f = z.object({ error: z.string() }).safeParse(data);
    throw new Error(f.success ? f.data.error : fallback);
  }
  void recordActivity("ai", "prep:" + Date.now().toString(36));
  return studentAIReply.parse(data).result;
}

/** "Get AI feedback" for a written or spoken answer. */
export function AiFeedback({ exam, request, onResult, disabled }: { exam: Cert; request: () => string; onResult?: (summary: string) => void; disabled?: boolean }) {
  const t = useT();
  const { lang } = useI18n();
  const college = useCollege();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [result, setResult] = useState<StudentAIResult | null>(null);
  const [error, setError] = useState("");
  const run = async () => {
    setState("busy");
    setError("");
    try {
      const r = await ask(exam, request(), lang, t("pr.ai.error"));
      setResult(r);
      setState("done");
      onResult?.(r.summary);
    } catch (e) {
      setError(e instanceof Error && e.message === "auth" ? t("pr.ai.signin") : e instanceof Error ? e.message : t("pr.ai.error"));
      setState("error");
    }
  };
  return (
    <section className="tp-ai" aria-live="polite">
      <header>
        <h3>
          <Sparkles size={15} aria-hidden="true" /> {t("pr.ai.title")}
        </h3>
        {state !== "busy" && (
          <Button size="sm" variant={state === "done" ? "outline" : "default"} disabled={disabled} onClick={run}>
            {state === "done" ? t("pr.ai.again") : t("pr.ai.get")}
          </Button>
        )}
      </header>
      {state === "idle" && <p className="tp-quiet">{t("pr.ai.hint")}</p>}
      {state === "busy" && <ShiningText text={t("pr.ai.busy")} />}
      {state === "error" && (
        <p className={"tp-quiet" + (college?.user ? " tp-err" : "")}>
          {error}{" "}
          {!college?.user && (
            <button type="button" className="tp-link" onClick={() => college?.openAuth()}>
              {t("pr.ai.signin_cta")}
            </button>
          )}
        </p>
      )}
      {result && state !== "busy" && (
        <div className="tp-ai-body">
          {result.summary.split(/\n+/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {result.strengths.length > 0 && (
            <>
              <h4>{t("pr.ai.strengths")}</h4>
              <ul>
                {result.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {result.next_steps.length > 0 && (
            <>
              <h4>{t("pr.ai.next")}</h4>
              <ul>
                {result.next_steps.map((s, i) => (
                  <li key={i}>
                    <strong>{s.title}.</strong> {s.detail}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="tp-fine">{t("pr.ai.note")}</p>
        </div>
      )}
    </section>
  );
}
