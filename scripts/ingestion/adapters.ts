import { observationSchema } from "../../lib/research";
import { z } from "zod";
export const feedSchema = z.object({
  id: z.string().uuid(),
  source_id: z.string().uuid(),
  url: z.string().url(),
  adapter: z.enum(["collegestat-json", "scorecard"]),
});
export function feedURL(raw: string, allowedHosts: string[]) {
  const u = new URL(raw);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    !allowedHosts.includes(u.hostname) ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)
  )
    throw new Error("unapproved_feed_host");
  return u;
}
export function normalizeFeed(
  adapter: string,
  payload: unknown,
  sourceURL: string,
  identifiers: Map<string, string>,
) {
  if (adapter === "collegestat-json")
    return z.array(observationSchema).min(1).max(500).parse(payload);
  if (adapter !== "scorecard") throw new Error("unknown_adapter");
  const url = new URL(sourceURL);
  if (
    url.hostname !== "api.data.gov" ||
    url.pathname !== "/ed/collegescorecard/v1/schools"
  )
    throw new Error("invalid_scorecard_endpoint");
  // Require an explicit year. "latest" can mix reporting years within one response.
  const year = Number(url.searchParams.get("year"));
  if (!Number.isInteger(year) || year < 1900 || year > 2100)
    throw new Error("explicit_reporting_year_required");
  const response = z
    .object({
      results: z.array(z.record(z.string(), z.unknown())).max(100),
      metadata: z.object({ total: z.number().int().nonnegative() }),
    })
    .parse(payload);
  if (response.metadata.total > response.results.length)
    throw new Error("feed_must_be_partitioned_no_silent_truncation");
  return response.results.flatMap((row) => {
    const id = identifiers.get(String(row.id));
    if (!id) throw new Error("unmapped_institution");
    const mappings = [
      ["admissions.admission_rate.overall", "admission", "%", 100],
      ["student.size", "enrollment", "students", 1],
      ["completion.completion_rate_4yr_150nt", "graduation_rate", "%", 100],
    ] as const;
    return mappings.flatMap(([field, metric, unit, scale]) => {
      const raw = row[`${year}.${field}`];
      if (raw === null || raw === undefined) return [];
      if (typeof raw !== "number") throw new Error("invalid_scorecard_value");
      return [
        observationSchema.parse({
          university_id: id,
          metric,
          year,
          value: Math.round(raw * scale * 10000) / 10000,
          unit,
          source_url: `https://collegescorecard.ed.gov/school/?${row.id}`,
          notes: `College Scorecard ${year}; field ${field}. Retrieved through the official API. Population definitions: https://collegescorecard.ed.gov/data/documentation/`,
        }),
      ];
    });
  });
}
