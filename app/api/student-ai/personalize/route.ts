import { consumePlanQuota } from "@/server/plan-quota";
import { abortable } from "@/lib/abortable";
import { authenticate, sameOrigin, serverConfig } from "@/server/config";
import { aiConnected, connectedAIJSON } from "@/services/openrouter-provider";
import { handlePersonalize } from "@/server/personalize-handler";
import { usesHostedCatalogue } from "@/lib/catalogue-mode";
import { readFilters } from "@/lib/research";
import type { University } from "@/lib/domain";

/** Up to 8 records per dream country: the top of the ranking plus less selective
 * universities, so the model can fill every tier from real catalogue rows. */
async function candidates(countries: string[], signal: AbortSignal) {
  const explore = async (query: string) => {
    const params = new URLSearchParams(query);
    const result = usesHostedCatalogue()
      ? await (await import("@/server/hosted-catalogue")).hostedExplore(readFilters(params))
      : await (await import("@/server/explorer")).exploreCatalogue(params);
    return result.universities as University[];
  };
  const bands = ["mode=explore&sort=rank", "mode=explore&sort=rank&admission_min=40"];
  const list = countries.length ? countries.slice(0, 5) : [""];
  const per = countries.length ? 4 : 10;
  const groups = await abortable(
    Promise.all(
      list.flatMap((c) => bands.map((b) => explore(b + (c ? "&country=" + encodeURIComponent(c) : "")).then((r) => r.slice(0, per)).catch(() => [] as University[]))),
    ),
    signal,
  );
  const seen = new Set<string>();
  return groups.flat().filter((u) => !seen.has(u.slug) && !!seen.add(u.slug));
}

export async function POST(request: Request) {
  const config = serverConfig();
  return handlePersonalize(request, {
    sameOrigin,
    authenticate: async (request, signal) => {
      const auth = await abortable(authenticate(request), signal);
      if (!auth?.user?.id) return null;
      return {
        owner: auth.user.id,
        // The same per-account AI quota as the other student AI tools.
        consumeLimit: async () => {
          if (!(await consumePlanQuota(auth.db, auth.user.id, "ai", signal)).ok) return false;
          const { data, error } = await auth.db.rpc("consume_student_ai_limit").abortSignal(signal);
          return !error && data === true;
        },
      };
    },
    configured: () => aiConnected(config),
    candidates,
    generate: (system, input, schema, signal) =>
      connectedAIJSON(config, { system, input, schema, name: "student_personalize", maxTokens: 1800, signal }),
  });
}
