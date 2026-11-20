import type { SupabaseClient } from "@supabase/supabase-js";
import { abortable } from "@/lib/abortable";
import { usesHostedCatalogue } from "@/lib/catalogue-mode";
import { filterURL, readFilters, type Filters } from "@/lib/research";
import type { University } from "@/lib/domain";
import { connectedAIJSON, type AIConfig } from "@/services/openrouter-provider";
import { ESSAY_FEEDBACK_SCHEMA, type TaskRow, type ToolDeps } from "./ai-tools";

/** Production data for the counsellor's tools: the hosted catalogue
 * (explore_universities RPC) when configured, else the bundled one; the
 * bundled scholarships; the student's own preferences read with their session. */
export function assistantToolData(input: {
  config: AIConfig;
  /** Reads the student's preferences; null = no profile. */
  preferences: (signal: AbortSignal) => Promise<unknown>;
  /** Reads the student's plan tasks; absent = the plan tools say it is unavailable. */
  tasks?: (signal: AbortSignal) => Promise<TaskRow[]>;
}): ToolDeps {
  return {
    async explore(filters: Partial<Filters>, signal) {
      const params = new URLSearchParams("mode=explore&" + filterURL(filters));
      if (!usesHostedCatalogue())
        return (await abortable((await import("./explorer")).exploreCatalogue(params), signal)).universities as University[];
      const parsed = readFilters(params);
      const rows = (await abortable((await import("./hosted-catalogue")).hostedExplore(parsed), signal)).universities as University[];
      if (rows.length || !parsed.field) return rows;
      // The installed explore_universities() ignores publisher subject lists
      // (see hostedSearch); answer from the bundled catalogue where it exists.
      try {
        const { bundledFilterSearch } = await import("./bundled-search");
        return await abortable(bundledFilterSearch(parsed), signal);
      } catch {
        return rows;
      }
    },
    async search(query, signal) {
      // Name matches ranked by relevance, as the bundled search API does.
      const bundled = async () =>
        abortable((await import("./bundled-search")).bundledFilterSearch(readFilters(new URLSearchParams({ q: query }))), signal);
      if (!usesHostedCatalogue()) return bundled();
      try {
        return await abortable((await import("./hosted-catalogue")).hostedSearch(query), signal);
      } catch (error) {
        // A Worker has no bundled catalogue; the failure then stands.
        return bundled().catch(() => Promise.reject(error));
      }
    },
    async university(slug, signal) {
      const u = await abortable((await import("./university")).publicUniversity(slug), signal);
      // Cards show the same resolved site icon as the catalogue lists.
      return u ? (await import("./auto-logos")).withAutoLogo(u) : null;
    },
    async scholarships() {
      return (await import("@/lib/scholarships-load")).allScholarships;
    },
    preferences: input.preferences,
    tasks: input.tasks,
    webLookup: (question, signal) => webLookup(input.config, question, signal),
    essayFeedback: ({ text, prompt, language }, signal) =>
      connectedAIJSON(input.config, {
        name: "essay_feedback",
        system: `You review a student's application essay draft. Give honest, specific feedback grounded in their text: up to 3 strengths, up to 4 improvements (issue + concrete suggestion, quoting a few words of their text), how well it answers the prompt, and a one-sentence summary. Never rewrite sentences for them or invent experiences. Write in ${language}.`,
        input: { prompt: prompt || "(no prompt given)", essay: text },
        schema: ESSAY_FEEDBACK_SCHEMA,
        maxTokens: 900,
        signal,
      }),
  };
}

/** The signed-in student's preferences only (no name, no email). */
export const readPreferences = (db: SupabaseClient, owner: string) => async (signal: AbortSignal) => {
  const { data, error } = await db.from("profiles").select("preferences").eq("id", owner).abortSignal(signal).maybeSingle();
  return error ? null : (data?.preferences ?? null);
};

/** The signed-in student's plan: the same `user_checklist` rows the Plan page shows (RLS: own rows only). */
export const readTasks = (db: SupabaseClient, owner: string) => async (signal: AbortSignal): Promise<TaskRow[]> => {
  const { data, error } = await db
    .from("user_checklist")
    .select("id,title,done,due_at")
    .eq("user_id", owner)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(120)
    .abortSignal(signal);
  if (error) throw error;
  return (data ?? []) as TaskRow[];
};

/* Live lookup on official sites: Groq's compound model searches the web itself. Sources on
 * rankings sites, portals, forums or Wikipedia are dropped; no official source, no answer. */
const DEBUG = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
const NOT_OFFICIAL = /(wikipedia|topuniversities|timeshighereducation|studyportals|bachelorsportal|mastersportal|shiksha|collegedunia|usnews|niche\.com|prepscholar|collegevine|reddit|quora|medium\.com|leverageedu|yocket|unipage|applyboard|forbes|bestcolleges|educations\.com|idp\.com)/i;
const LOOKUP_SYSTEM =
  "Search the web and answer for an international first-year bachelor's applicant. Use ONLY the university's own website, a government site or a national application service (UCAS, Common App, uni-assist...). Never rankings sites, portals, forums, agencies or Wikipedia. Reply in English with at most 6 short lines of facts, each ending with its source URL in parentheses. If no official page states it, reply exactly: NOT FOUND";

/** Groq's compound model (built-in search) first, then OpenRouter's web plugin. */
let groqSearchOff = false; // set when the account has no access to the search model
async function webLookup(config: AIConfig, question: string, signal: AbortSignal) {
  const attempts: { url: string; key: string; body: Record<string, unknown> }[] = [];
  if (config.groqKeys[0] && !groqSearchOff)
    attempts.push({ url: "https://api.groq.com/openai/v1/chat/completions", key: config.groqKeys[0], body: { model: "groq/compound-mini" } });
  if (config.openrouter)
    attempts.push({
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: config.openrouter,
      body: { model: config.deepseek ? "deepseek/deepseek-chat" : config.openrouterModel, plugins: [{ id: "web", max_results: 4 }] },
    });
  for (const at of attempts) {
    const res = await abortable(
      fetch(at.url, {
        method: "POST",
        signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
        headers: { Authorization: "Bearer " + at.key, "Content-Type": "application/json" },
        body: JSON.stringify({ ...at.body, max_tokens: 500, messages: [{ role: "system", content: LOOKUP_SYSTEM }, { role: "user", content: question }] }),
      }),
      signal,
    ).catch(() => null);
    if (!res) continue;
    const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } } | null;
    if (!res.ok) {
      if (at.url.includes("groq") && (res.status === 404 || res.status === 403)) groqSearchOff = true;
      console.warn("[web_lookup] provider status", res.status, (data?.error?.message || "").slice(0, 160));
      continue;
    }
    const answer = (data?.choices?.[0]?.message?.content || "").trim().slice(0, 1500);
    if (DEBUG) console.warn("[web_lookup] answer", answer.slice(0, 300));
    if (!answer || /^NOT FOUND/i.test(answer)) return null;
    const sources = [...new Set((answer.match(/https:\/\/[^\s)\]]+/g) || []).map((u) => u.replace(/[.,;]+$/, "")))].filter((u) => !NOT_OFFICIAL.test(u)).slice(0, 6);
    if (!sources.length) return null;
    return { answer, sources };
  }
  return null;
}
