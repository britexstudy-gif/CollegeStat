import { consumePlanQuota } from "@/server/plan-quota";
import { z } from "zod";
import { authenticate, sameOrigin, serverConfig } from "@/server/config";
import { runAgent } from "@/server/agent";
import { chatConnections } from "@/services/openrouter-provider";
import { readJSON } from "@/server/http";
import { LANG_CODES, languageName } from "@/lib/i18n/languages";

const body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(6000) }))
    .min(1)
    .max(24),
  brainstorm: z.string().trim().min(1).max(1200),
  language: z.enum(LANG_CODES).optional(),
});

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { error: "Request blocked." });
  const config = serverConfig();
  const connections = chatConnections(config);
  if (!connections.length) return json(503, { error: "AI is not connected yet." });
  const auth = await authenticate(request);
  if (!auth?.user?.id) return json(401, { error: "Sign in to use the AI coach." });
  // Byte-capped read: 24 messages x 6,000 characters of multi-byte text fits,
  // an unbounded body does not reach the parser.
  const parsed = body.safeParse(await readJSON(request, 450000).catch(() => null));
  if (!parsed.success) return json(400, { error: "Write a message first." });
  const last = parsed.data.messages[parsed.data.messages.length - 1];
  if (last.role !== "user") return json(400, { error: "Write a message first." });
  if (!(await consumePlanQuota(auth.db, auth.user.id, "ai")).ok)
    return json(429, { error: "You’ve used today’s AI messages on your plan. See /pricing for more." });
  const { data: allowed, error: limitError } = await auth.db.rpc("consume_student_ai_limit");
  if (limitError || allowed !== true)
    return json(429, { error: "You’ve reached your AI limit for now. Please try again later." });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(55000)]);
  try {
    const result = await runAgent({
      connections,
      language: languageName(parsed.data.language),
      history: parsed.data.messages,
      signal,
      brainstorm: parsed.data.brainstorm,
    });
    return json(200, result);
  } catch (error) {
    return json(503, { error: error instanceof Error ? error.message : "The AI could not answer. Please retry." });
  }
}
