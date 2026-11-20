import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminTool } from "@/lib/admin-mcp";
import { parseTool } from "@/lib/admin-mcp";
import {
  adminToolMessages,
  AdminResultError,
  parseAdminToolResult,
} from "@/lib/admin-tool-results";
import { HttpError } from "./http";
const pattern = (v: string) => "%" + v.replace(/[\\%_]/g, "\\$&") + "%";
export async function runAdminTool(
  db: SupabaseClient,
  name: AdminTool,
  input: unknown,
  allowStaging = false,
) {
  const args = parseTool(name, input) as Record<string, unknown>;
  let result;
  if (name === "university_coverage")
    result = await db.rpc("admin_university_coverage", {
      target: args.university_id,
    });
  else if (name === "stage_observations") {
    if (!allowStaging) throw new HttpError(403, adminToolMessages.mfa);
    result = await db.rpc("stage_observations", {
      source: args.source_id,
      rows: args.rows,
    });
  } else if (name === "review_queue")
    result = await db
      .from("source_records")
      .select(
        "id,university_id,source_id,metric,year,normalized_value,unit,status,source_url,retrieved_at,notes,raw_value,data_sources(name,organization,url,source_type,retrieved_at,published_at,trust_level,license_notes)",
      )
      .eq("status", args.status)
      .order("retrieved_at", { ascending: false })
      .limit(Number(args.limit));
  else if (name === "list_sources")
    result = await db
      .from("data_sources")
      .select(
        "id,name,organization,url,source_type,retrieved_at,published_at,trust_level,license_notes",
      )
      .ilike("name", pattern(String(args.query)))
      .order("name")
      .limit(Number(args.limit));
  else
    result = await db
      .rpc("search_universities", {
        search_term: args.query,
        result_limit: args.limit,
      })
      .select("id,name,slug,country_code,city,website,published,logo_url")
      .limit(Number(args.limit));
  if (result.error) throw new HttpError(503, adminToolMessages.unavailable);
  const data =
    name === "review_queue" && Array.isArray(result.data)
      ? result.data.map((value: Record<string, unknown>) => {
          const { raw_value, ...row } = value;
          const raw =
            raw_value &&
            typeof raw_value === "object" &&
            !Array.isArray(raw_value)
              ? (raw_value as Record<string, unknown>)
              : null;
          // Only normalized scope/provenance fields leave this runner, never the raw import blob.
          return { ...row, evidence: raw?.evidence ?? null };
        })
      : result.data;
  try {
    // The assistant uses this runner directly, so enforce the same contracts there too.
    return parseAdminToolResult(name, data);
  } catch (error) {
    if (error instanceof AdminResultError)
      throw new HttpError(503, error.message);
    throw error;
  }
}
