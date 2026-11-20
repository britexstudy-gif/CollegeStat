import { z } from "zod";
import { abortable } from "@/lib/abortable";
import {
  AI_ENDPOINTS,
  logProviderFailure,
  readBoundedText,
  type ChatConnection,
} from "@/services/openrouter-provider";

const replyLanguage = (language?: string) =>
  language && language !== "English"
    ? `\nWrite your replies in ${language}. Keep university names, exam names and URLs unchanged.`
    : "";

/** The essay brainstorm coach (writing desk): a short interview with no tools.
 * The agentic counsellor with tools lives in server/ai-agent.ts. */

type Message = { role: "system" | "user" | "assistant"; content: string };

export const BRAINSTORM_SYSTEM = (context: string) => `You are a writing coach helping a student brainstorm an application essay. ${context}
Work in two phases.
1) Interview: ask ONE short, specific question at a time about the student's real experiences (a moment, what they did, what changed, why it matters for their goal). Ask at most 5 questions in total. Build on their previous answers.
2) Outline: when you have enough (or the student asks), reply with a line "OUTLINE:" followed by 4-6 bullet points ("- ") that organise THEIR OWN details into an essay structure (hook moment, context, actions, reflection, connection to goal). Use only facts they gave you.
Never write full paragraphs or sentences of the essay for them. Never invent experiences. Keep every message under 80 words.`;

const AGENT_CALL_TIMEOUT_MS = 25000;
const replyMessage = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().max(30000).nullish(),
        }),
      }),
    )
    .min(1),
});

/** Tries each connection in order (DeepSeek, then Groq keys). Every attempt has
 * its own deadline so one hanging provider cannot use the whole request budget,
 * bodies are size-capped, and only fixed user-safe messages are ever thrown:
 * never fetch causes, provider bodies or JSON parser snippets. */
async function chat(
  connections: ChatConnection[],
  messages: Message[],
  signal: AbortSignal,
  transport: typeof fetch = fetch,
) {
  let last = new Error("The AI could not answer. Please retry.");
  for (const connection of connections) {
    if (signal.aborted) break;
    const provider = connection.url === AI_ENDPOINTS.deepseek ? "deepseek" : "groq";
    const attempt = AbortSignal.any([signal, AbortSignal.timeout(AGENT_CALL_TIMEOUT_MS)]);
    try {
      const res = await abortable(
        transport(connection.url, {
          method: "POST",
          signal: attempt,
          headers: { Authorization: "Bearer " + connection.key, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: connection.model,
            messages,
            temperature: 0.3,
            max_tokens: 1400,
            ...connection.extra,
          }),
        }),
        attempt,
      );
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        logProviderFailure(provider, res.status);
        last = new Error(
          res.status === 429 ? "The AI is busy. Please try again in a minute." : "The AI could not answer. Please retry.",
        );
        continue;
      }
      const message = replyMessage.parse(JSON.parse(await readBoundedText(res, attempt, 200000))).choices[0].message;
      return message.content ?? "";
    } catch {
      logProviderFailure(provider, attempt.aborted ? "timeout" : "invalid_response");
      last = new Error(
        attempt.aborted ? "The AI took too long to answer. Please retry." : "The AI could not answer. Please retry.",
      );
    }
  }
  throw last;
}

export async function runAgent(input: {
  connections: ChatConnection[];
  /** Language name for replies, e.g. "Russian". Defaults to English. */
  language?: string;
  history: { role: "user" | "assistant"; content: string }[];
  signal: AbortSignal;
  /** Essay context: type, limit and prompt. */
  brainstorm: string;
  /** Injected in tests; defaults to the global fetch. */
  transport?: typeof fetch;
}) {
  const messages: Message[] = [
    { role: "system", content: BRAINSTORM_SYSTEM(input.brainstorm) + replyLanguage(input.language) },
    ...input.history.slice(-12),
  ];
  const reply = await chat(input.connections, messages, input.signal, input.transport);
  return { reply: reply.trim() };
}
