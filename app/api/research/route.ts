import { readJSON } from "@/server/http";
import { usesHostedCatalogue } from "@/lib/catalogue-mode";
import { selectLocalResearch } from "@/lib/research-selection";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  serverConfig,
  serviceClient,
  authenticate,
  sameOrigin,
  serverError,
} from "@/server/config";
import { bundledCatalogue } from "@/server/bundled";
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
  try {
    const parsed = schema.safeParse(await readJSON(request));
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
      const auth = await authenticate(request),
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
      const { data, error } = await service.rpc("consume_rate_limit", {
        key: "ai:" + auth.user.id,
        max_hits: 20,
        window_seconds: 3600,
      });
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
    const interpretation = await interpretQuestion(
      input.question,
      config.openai,
      config.model,
    );
    let total = 0;
    if (usesHostedCatalogue()) {
      if (!config.url || !config.anon)
        return Response.json(
          { error: "The university catalogue is not connected yet." },
          { status: 503 },
        );
      const db = createClient(config.url, config.anon, {
        auth: { persistSession: false },
      });
      let ids = input.ids;
      if (!ids.length) {
        const { data, error } = await db.rpc("explore_universities", {
          filters: interpretation.filters,
          page_number: 1,
        });
        if (error) throw error;
        total = data.total;
        ids = data.ids;
        // Evidence questions about a named university use the same alias-aware catalogue search.
        if (!ids.length && !interpretation.recognized) {
          const { data, error } = await db.rpc("search_universities", {
            search_term: input.question.slice(0, 200),
            result_limit: 5,
          });
          if (error) throw error;
          ids = data.map((u: University) => u.id);
          total = ids.length;
        }
      }
      if (ids.length) {
        const { data, error } = await db
          .from("universities")
          .select(universitySelect)
          .eq("published", true)
          .in("id", ids)
          .limit(24);
        if (error) throw error;
        rows = (data as unknown as University[]).map(normalizeUniversity);
      } else rows = [];
    } else {
      const selected = selectLocalResearch(
        (await bundledCatalogue()).globalCatalogue,
        input,
        interpretation,
      );
      rows = selected.rows;
      total = selected.total;
    }
    if (input.ids.length) total = rows.length;
    const provider = liveAI
      ? new OpenAIProvider(config.openai, config.model)
      : new LocalEvidenceProvider();
    return Response.json(
      {
        ...(await provider.askUniversityQuestion(
          input.question,
          evidenceFor(rows),
        )),
        filters: interpretation.filters,
        unparsed: interpretation.unparsed,
        total,
        matches: rows.map((u) => ({ id: u.id, slug: u.slug, name: u.name })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return serverError("research_request_failed", e);
  }
}
