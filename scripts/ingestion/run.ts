// Run once from a trusted scheduler. No credential or source payload is logged.
import { createClient } from "@supabase/supabase-js";
import { request } from "node:https";
import { lookup } from "node:dns/promises";
import { feedURL, feedSchema, normalizeFeed } from "./adapters";
const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url?.startsWith("https://") || !key)
  throw new Error("Server Supabase credentials required");
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const hosts = (process.env.INGEST_ALLOWED_HOSTS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error("database_operation_failed");
  return data;
}
async function fetchJSON(url: URL) {
  // Pin a public IPv4 address to the TLS request, preventing DNS rebinding to internal services.
  const addresses = await lookup(url.hostname, { family: 4, all: true });
  const safe = addresses.filter(({ address }) => {
    const [a, b] = address.split(".").map(Number);
    return (
      a !== 0 &&
      a !== 10 &&
      a !== 127 &&
      a < 224 &&
      a !== 169 &&
      a !== 192 &&
      !(a === 172 && b >= 16 && b <= 31) &&
      !(a === 100 && b >= 64 && b <= 127) &&
      a !== 198
    );
  });
  if (!safe.length || safe.length !== addresses.length)
    throw new Error("nonpublic_feed_address");
  return new Promise<unknown>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        lookup: (_host, _opts, cb) => cb(null, safe[0].address, 4),
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error("feed_http_failure"));
          return;
        }
        if (!res.headers["content-type"]?.includes("json")) {
          res.resume();
          reject(new Error("feed_content_type"));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2000000) {
            req.destroy(new Error("feed_too_large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("feed_invalid_json"));
          }
        });
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("feed_timeout")),
      20000,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end();
  });
}
await rpc("enqueue_due_feeds");
for (let i = 0; i < 10; i++) {
  const job = await rpc("claim_ingestion_job");
  if (!job?.id) break;
  try {
    const { data, error } = await db
      .from("ingestion_feeds")
      .select("*")
      .eq("id", job.feed_id)
      .single();
    if (error) throw new Error("feed_unavailable");
    const feed = feedSchema.parse(data);
    const target = feedURL(feed.url, hosts);
    const ids = new Map<string, string>();
    if (feed.adapter === "scorecard") {
      if (
        target.hostname !== "api.data.gov" ||
        target.pathname !== "/ed/collegescorecard/v1/schools"
      )
        throw new Error("invalid_scorecard_endpoint");
      if (!process.env.SCORECARD_API_KEY)
        throw new Error("scorecard_key_missing");
      const year = target.searchParams.get("year");
      if (!year || !/^\d{4}$/.test(year))
        throw new Error("explicit_reporting_year_required");
      target.searchParams.delete("year");
      target.searchParams.set("api_key", process.env.SCORECARD_API_KEY);
      target.searchParams.set(
        "fields",
        `id,${year}.admissions.admission_rate.overall,${year}.student.size,${year}.completion.completion_rate_4yr_150nt`,
      );
      target.searchParams.set("per_page", "100");
      const ipeds = (target.searchParams.get("id") || "").split(",");
      if (
        !ipeds.length ||
        ipeds.length > 100 ||
        ipeds.some((v) => !/^\d+$/.test(v))
      )
        throw new Error("explicit_institution_ids_required");
      const { data: links, error } = await db
        .from("external_identifiers")
        .select("external_id,university_id")
        .eq("system", "ipeds")
        .in("external_id", ipeds);
      if (error) throw new Error("identifier_lookup_failed");
      for (const link of links || [])
        ids.set(link.external_id, link.university_id);
    }
    const rows = normalizeFeed(
      feed.adapter,
      await fetchJSON(target),
      feed.url,
      ids,
    );
    if (!rows.length) throw new Error("no_observations");
    const result = await rpc("stage_observations", {
      source: feed.source_id,
      rows,
      job_id: job.id,
      token: job.lease_token,
    });
    console.log(
      JSON.stringify({
        event: "ingestion_staged",
        job_id: job.id,
        accepted: result.accepted,
        duplicates: result.duplicates,
      }),
    );
  } catch (error) {
    const code =
      error instanceof Error && /^[a-z_]+$/.test(error.message)
        ? error.message
        : "ingestion_failed";
    await rpc("fail_ingestion_job", {
      job_id: job.id,
      token: job.lease_token,
      code,
    });
    console.error(
      JSON.stringify({
        event: "ingestion_retry_scheduled",
        job_id: job.id,
        code,
      }),
    );
  }
}
