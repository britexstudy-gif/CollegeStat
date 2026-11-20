import { consumePlanQuota } from "@/server/plan-quota";
import { abortable } from "@/lib/abortable";
import { authenticate, sameOrigin, serverConfig } from "@/server/config";
import { aiConnected, connectedAIJSON } from "@/services/openrouter-provider";
import { handleEssayReview } from "@/server/essay-review-handler";

export async function POST(request: Request) {
  const config = serverConfig();
  return handleEssayReview(request, {
    sameOrigin,
    authenticate: async (request, signal) => {
      const auth = await abortable(authenticate(request), signal);
      if (!auth?.user?.id) return null;
      return {
        owner: auth.user.id,
        // The same per-account AI quota as the other student AI tools.
        consumeLimit: async () => {
          if (!(await consumePlanQuota(auth.db, auth.user.id, "essayReview", signal)).ok) return "plan";
          const { data, error } = await auth.db.rpc("consume_student_ai_limit").abortSignal(signal);
          return !error && data === true;
        },
      };
    },
    configured: () => aiConnected(config),
    generate: (system, input, schema, signal) =>
      connectedAIJSON(config, { system, input, schema, name: "essay_review", maxTokens: 2600, signal }),
  });
}
