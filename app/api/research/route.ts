import { abortable } from "@/lib/abortable";
import { readJSON } from "@/server/http";
import { usesHostedCatalogue } from "@/lib/catalogue-mode";
import {
  researchNameQuery,
  selectLocalResearch,
} from "@/lib/research-selection";
import { z } from "zod";
import { publicDatabase } from "@/server/hosted-catalogue";
import {
  serverConfig,
  serviceClient,
  authenticate,
  sameOrigin,
  serverError,
} from "@/server/config";
import { universitySelect } from "@/lib/supabase/catalogue";
import { normalizeUniversity, University } from "@/lib/domain";
import {
  evidenceFor,
  interpretQuestion,
  LocalEvidenceProvider,
  OpenAIProvider,
} from "@/services/ai-provider";
const schema = z.object({
  question: z.string().trim().min(2).max(1000),
  ids: z.array(z.string().uuid()).max(5).default([]),
});
const localLimits = new Map<string, { hits: number; reset: number }>();
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 10000)
    return new Response(null, { status: 413 });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45000)]);
  const bounded = <T>(operation: PromiseLike<T>) =>
    abortable(Promise.resolve(operation), signal);
  try {
    const parsed = schema.safeParse(await abortable(readJSON(request), signal));
    if (!parsed.success)
      return Response.json(
        { error: "Enter a question and up to five universities." },
        { status: 400 },
      );
    const input = parsed.data,
      config = serverConfig();
    let rows: University[] = [];
    const liveAI = !!(config.openai && config.model);
    if (liveAI) {
      const auth = await abortable(authenticate(request), signal),
        service = serviceClient();
      if (!auth)
        return Response.json(
          { error: "Sign in to use connected AI research." },
          { status: 401 },
        );
      if (!service)
        return Response.json(
          { error: "Research rate limiting is not configured." },
          { status: 503 },
        );
      const { data, error } = await bounded(
        service
          .rpc("consume_rate_limit", {
            key: "ai:" + auth.user.id,
            max_hits: 20,
            window_seconds: 3600,
          })
          .abortSignal(signal),
      );
      if (error || !data)
        return Response.json(
          { error: "Research limit reached. Please try again later." },
          { status: 429 },
        );
    } else {
      const key = request.headers.get("cf-connecting-ip") || "local";
      const now = Date.now(),
        bucket = localLimits.get(key);
      if (bucket && bucket.reset > now && bucket.hits >= 30)
        return Response.json(
          { error: "Please wait a minute before asking again." },
          { status: 429 },
        );
      if (localLimits.size >= 1000 && !localLimits.has(key)) {
        for (const [k, v] of localLimits)
          if (v.reset <= now) localLimits.delete(k);
        if (localLimits.size >= 1000)
          return Response.json(
            { error: "Research is busy. Please retry shortly." },
            { status: 429, headers: { "Retry-After": "60" } },
          );
      }
      localLimits.set(key, {
        hits: bucket && bucket.reset > now ? bucket.hits + 1 : 1,
        reset: bucket && bucket.reset > now ? bucket.reset : now + 60000,
      });
      if (localLimits.size > 1000)
        for (const [k, v] of localLimits)
          if (v.reset < now) localLimits.delete(k);
    }
    const interpretation = await bounded(
      interpretQuestion(input.question, config.openai, config.model, signal),
    );
    let total = 0;
    if (usesHostedCatalogue()) {
      if (!config.url || !config.anon)
        return Response.json(
          { error: "The university catalogue is not connected yet." },
          { status: 503 },
        );
      const db = publicDatabase();
      let ids = input.ids;
      if (!ids.length && interpretation.recognized) {
        const { data, error } = await bounded(
          db
            .rpc("explore_universities", {
              filters: interpretation.filters,
              page_number: 1,
            })
            .abortSignal(signal),
        );
        if (error) throw error;
        total = data.total;
        ids = data.ids;
      } else if (!ids.length) {
        // A named question is an identity lookup, not a request for global
        // metrics over every university. Constraints never use this branch.
        const { data, error } = await bounded(
          db
            .rpc("search_universities", {
              search_term: researchNameQuery(input.question),
              result_limit: 5,
            })
            .abortSignal(signal),
        );
        if (error) throw error;
        ids = data.map((u: University) => u.id);
        total = ids.length;
      }
      if (ids.length) {
        const { data, error } = await bounded(
          db
            .from("universities")
            .select(universitySelect)
            .eq("published", true)
            .in("id", ids)
            .limit(24)
            .abortSignal(signal),
        );
        if (error) throw error;
        rows = (data as unknown as University[]).map(normalizeUniversity);
        if (!input.ids.length && !interpretation.recognized) {
          const named = selectLocalResearch(rows, input, interpretation);
          rows = named.rows;
          total = named.total;
        }
      } else rows = [];
    } else {
      const store = await bounded(import("@/server/catalogue-store"));
      const selected = selectLocalResearch(
        await bounded(store.catalogueList()),
        input,
        interpretation,
      );
      // List rows omit research profiles; answer from the full records.
      rows = await bounded(
        store.universitiesByIds(selected.rows.map((u) => u.id)),
      );
      total = selected.total;
    }
    if (input.ids.length) total = rows.length;
    const provider = liveAI
      ? new OpenAIProvider(config.openai, config.model, signal)
      : new LocalEvidenceProvider();
    return Response.json(
      {
        ...(await bounded(
          provider.askUniversityQuestion(input.question, evidenceFor(rows)),
        )),
        filters: interpretation.filters,
        unparsed: interpretation.unparsed,
        total,
        matches: rows.map((u) => ({ id: u.id, slug: u.slug, name: u.name })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    if (signal.aborted)
      return Response.json(
        { error: "Research took too long or was cancelled. Please try again." },
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    return serverError("research_request_failed", e);
  }
}
