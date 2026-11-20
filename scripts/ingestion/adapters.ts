import { observationSchema } from "../../lib/research";
import { z } from "zod";
import scorecardDictionary from "../../data/published/scorecard-field-definitions.json";
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
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
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
      results: z.array(z.record(z.unknown())).max(100),
      metadata: z.object({ total: z.number().int().nonnegative() }),
    })
    .parse(payload);
  if (response.metadata.total > response.results.length)
    throw new Error("feed_must_be_partitioned_no_silent_truncation");
  const seen = new Set<string>();
  const observations = response.results.flatMap((row) => {
    if (!Number.isInteger(row.id) || Number(row.id) <= 0)
      throw new Error("invalid_scorecard_identity");
    if (seen.has(String(row.id)))
      throw new Error("duplicate_scorecard_identity");
    seen.add(String(row.id));
    const id = identifiers.get(String(row.id));
    if (!id) throw new Error("unmapped_institution");
    const mappings = [
      ["admissions.admission_rate.overall", "admission", "%", 100],
      ["student.size", "enrollment", "students", 1],
      ["completion.completion_rate_4yr_150nt", "graduation_rate", "%", 100],
      [
        "completion.completion_rate_less_than_4yr_150nt",
        "graduation_rate_short_programmes",
        "%",
        100,
      ],
      ["cost.tuition.in_state", "tuition_in_state", "USD", 1],
      ["cost.tuition.out_of_state", "tuition_out_of_state", "USD", 1],
      ["cost.avg_net_price.public", "average_net_price_public", "USD", 1],
      ["cost.avg_net_price.private", "average_net_price_private", "USD", 1],
      ["aid.pell_grant_rate", "pell_grant_rate", "%", 100],
      [
        "admissions.sat_scores.25th_percentile.critical_reading",
        "sat_reading_lower_quartile",
        "SAT points",
        1,
      ],
      [
        "admissions.sat_scores.75th_percentile.critical_reading",
        "sat_reading_upper_quartile",
        "SAT points",
        1,
      ],
      [
        "admissions.sat_scores.25th_percentile.math",
        "sat_math_lower_quartile",
        "SAT points",
        1,
      ],
      [
        "admissions.sat_scores.75th_percentile.math",
        "sat_math_upper_quartile",
        "SAT points",
        1,
      ],
      [
        "admissions.act_scores.25th_percentile.cumulative",
        "act_lower_quartile",
        "ACT points",
        1,
      ],
      [
        "admissions.act_scores.75th_percentile.cumulative",
        "act_upper_quartile",
        "ACT points",
        1,
      ],
    ] as const;
    return mappings.flatMap(([field, metric, unit, scale]) => {
      const raw = row[`${year}.${field}`];
      if (
        raw === null ||
        raw === undefined ||
        raw === "PrivacySuppressed" ||
        raw === "NULL"
      )
        return [];
      if (
        typeof raw !== "number" ||
        !Number.isFinite(raw) ||
        raw < 0 ||
        (unit === "%" && raw > 1)
      )
        throw new Error("invalid_scorecard_value");
      if (unit === "SAT points" && (raw < 200 || raw > 800))
        throw new Error("invalid_sat_section_score");
      if (unit === "ACT points" && (raw < 1 || raw > 36))
        throw new Error("invalid_act_score");
      const dictionary = scorecardDictionary.definitions as Record<
        string,
        {
          label: string;
          variable: string;
          notes: string | null;
          cohorts_by_file: Record<string, string>;
        }
      >;
      const definition = dictionary[field.slice(field.indexOf(".") + 1)];
      const population =
        definition?.cohorts_by_file[
          `MERGED_${year}-${String(year + 1).slice(-2)} datafile`
        ];
      if (!definition || !population)
        throw new Error("scorecard_cohort_definition_unavailable");
      return [
        observationSchema.parse({
          university_id: id,
          metric,
          year,
          value: Math.round(raw * scale * 10000) / 10000,
          unit,
          source_url: `https://collegescorecard.ed.gov/school/?${row.id}`,
          notes: `College Scorecard ${year}; ${definition.label}. ${population}. Percentile scores describe reported submitters, not entry requirements. Net-price and Pell figures do not establish international eligibility.`,
          evidence: {
            scope: "College Scorecard institutional reporting",
            population,
            reporting_period: population.slice(0, 100),
            source_record_id: String(row.id),
            raw_field: `${year}.${field}`,
            dictionary_url: scorecardDictionary.source.url,
            license_note: "US government public-use data",
          },
        }),
      ];
    });
  });
  // The worker accepts at most 500 facts; require smaller partitions explicitly.
  if (observations.length > 500) throw new Error("observation_partition_limit");
  return observations;
}
