import { abortable } from "@/lib/abortable";
import { essayReview, essayReviewInput, essayReviewJSONSchema, essayReviewSystem, fitEssayReview } from "@/lib/essay-review";
import { languageName } from "@/lib/i18n/languages";
import { readJSON, HttpError } from "./http";
import { AIConnectionError } from "@/services/openrouter-provider";

export type EssayReviewDependencies = {
  sameOrigin: (request: Request) => boolean;
  authenticate: (request: Request, signal: AbortSignal) => Promise<{ owner: string; consumeLimit: () => Promise<boolean | "plan"> } | null>;
  configured: () => boolean;
  generate: (system: string, input: unknown, schema: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
};

const headers = { "Cache-Control": "private, no-store" };
const reply = (status: number, body: unknown) => Response.json(body, { status, headers });

/** Writing desk review: sign-in, consent and the shared student AI quota are
 * checked before the draft is sent. The draft is not stored. */
export async function handleEssayReview(request: Request, deps: EssayReviewDependencies) {
  if (!deps.sameOrigin(request)) return reply(403, { error: "Use CollegeStat to send this request." });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(55000)]);
  try {
    const auth = await abortable(deps.authenticate(request, signal), signal);
    if (!auth) return reply(401, { error: "Sign in to get AI feedback." });
    const parsed = essayReviewInput.safeParse(await abortable(readJSON(request, 40000), signal));
    if (!parsed.success) return reply(400, { error: "Write at least a short paragraph (80+ characters, up to 12,000) before asking for a review." });
    if (!deps.configured()) return reply(503, { error: "AI is not connected yet. Your text is kept." });
    const allowed = await abortable(auth.consumeLimit(), signal);
    if (allowed === "plan")
      return reply(429, { error: "You’ve used this month’s AI essay reviews on your plan. Your text is kept. See plans at /pricing.", code: "plan_limit" });
    if (!allowed) return reply(429, { error: "You have reached your AI limit for now. Please try again later." });
    const input = parsed.data;
    const raw = await abortable(
      deps.generate(
        essayReviewSystem(input.language === "en" ? null : languageName(input.language)),
        { essay_type: input.essay_type, prompt: input.prompt, limit: input.limit, university: input.university, essay: input.text },
        essayReviewJSONSchema,
        signal,
      ),
      signal,
    );
    const review = essayReview.parse(fitEssayReview(raw, input.text));
    return reply(200, { review });
  } catch (error) {
    if (error instanceof HttpError || error instanceof AIConnectionError) return reply(error.status, { error: error.message });
    return reply(503, {
      error: signal.aborted ? "AI took too long or was cancelled. Your text is kept." : "This review could not be checked. Your text is kept; please retry.",
    });
  }
}
