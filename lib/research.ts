import { universityRanks, rankingPublishers } from "./ranking-highlights";
import { matchesSearch } from "./search-text";
import { z } from "zod";
import {
  University,
  Sourced,
  admission,
  tuition,
  metric,
  countryName,
  countries as countryNames,
  languageMinimum,
} from "./domain";
export const filterSchema = z.object({
  q: z.string().max(200).default(""),
  /** One ISO code, or several joined by commas (UZ,KZ). */
  country: z.string().max(40).regex(/^([A-Za-z]{2})(,[A-Za-z]{2})*$/).or(z.literal("")).default(""),
  region: z.string().max(80).default(""),
  city: z.string().max(80).default(""),
  field: z.string().max(100).default(""),
  degree: z.string().max(80).default(""),
  language: z.string().max(60).default(""),
  type: z.string().max(60).default(""),
  cost_max: z.coerce.number().min(0).max(1000000).optional(),
  admission_min: z.coerce.number().min(0).max(100).optional(),
  admission_max: z.coerce.number().min(0).max(100).optional(),
  ielts_max: z.coerce.number().min(0).max(9).optional(),
  intl_min: z.coerce.number().min(0).max(100).optional(),
  graduation_min: z.coerce.number().min(0).max(100).optional(),
  aid: z.enum(["yes", ""]).default(""),
  scholarships: z.enum(["yes", ""]).default(""),
  sort: z
    .enum(["rank", "rank_desc", "rank_the", "rank_arwu", "tuition", "tuition_desc", "admission", "admission_desc", "international", "international_asc"])
    .default("rank"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export type Filters = z.infer<typeof filterSchema>;
export const defaultFilters = filterSchema.parse({});
export function readFilters(params: URLSearchParams): Filters {
  const values: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(filterSchema.shape)) {
    const raw = params.get(key);
    const input = key === "sort" && raw === "name" ? "rank" : key === "country" ? raw?.toUpperCase() : raw;
    const parsed = schema.safeParse(input === null || input === "" ? undefined : input);
    if (parsed.success) values[key] = parsed.data;
  }
  const filters = filterSchema.parse(values);
  if (filters.admission_min != null && filters.admission_max != null && filters.admission_min > filters.admission_max)
    [filters.admission_min, filters.admission_max] = [filters.admission_max, filters.admission_min];
  return filters;
}
export function filterURL(filters: Partial<Filters>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters))
    if (v !== undefined && v !== "" && v !== defaultFilters[k as keyof Filters])
      p.set(k, String(v));
  return p.toString();
}
export function parseResearchQuery(text: string): {
  filters: Filters;
  recognized: boolean;
  unparsed: string;
} {
  let rest = text.toLowerCase();
  const f: Partial<Filters> = {};
  const countryAliases: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(countryNames).map(([code, name]) => [
        name.toLowerCase(),
        code,
      ]),
    ),
    usa: "US",
    uk: "GB",
    "u.s.": "US",
    "u.k.": "GB",
    korea: "KR",
  };
  for (const [name, code] of Object.entries(countryAliases).sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp("(?<![a-z])" + escaped + "(?![a-z])", "g");
    if (pattern.test(rest) && (!f.country || f.country === code)) {
      f.country = code;
      rest = rest.replace(pattern, " ");
    }
  }
  for (const r of [
    "Europe",
    "Asia",
    "North America",
    "South America",
    "Africa",
    "Oceania",
  ])
    if (rest.includes(r.toLowerCase())) {
      f.region = r;
      rest = rest.replace(r.toLowerCase(), "");
    }
  const ielts = rest.match(
    /ielts\s*(?:of\s*|<=?\s*|under\s*|below\s*|maximum\s*)?(\d(?:\.\d)?)\s*(?:or (?:lower|less)|or below|maximum)?/,
  );
  if (ielts && Number(ielts[1]) <= 9) {
    f.ielts_max = Number(ielts[1]);
    rest = rest.replace(ielts[0], "");
  }
  if (/\bscholarships?\b/.test(rest)) {
    f.scholarships = "yes";
    rest = rest.replace(/\bscholarships?\b/, "");
  }
  if (/\bmasters?\b/.test(rest)) {
    f.degree = "Master";
    rest = rest.replace(/\bmasters?\b/, "");
  }
  const acceptance =
    rest.match(
      /(?:acceptance|admission)(?: rate)?\s*(under|below|over|above|<=|>=|<|>)\s*(\d+(?:\.\d+)?)%?/,
    ) ||
    rest.match(
      /(under|below|over|above|<=|>=|<|>)\s*(\d+(?:\.\d+)?)%?\s*(?:acceptance|admission)(?: rate)?/,
    );
  if (acceptance && Number(acceptance[2]) <= 100) {
    if (["under", "below", "<=", "<"].includes(acceptance[1]))
      f.admission_max = Number(acceptance[2]);
    else f.admission_min = Number(acceptance[2]);
    rest = rest.replace(acceptance[0], "");
  }
  const cost = rest.match(
    /(?:under|below|less than|<)\s*\$?([\d,]+(?:\.\d+)?)(k)?(?![\d.%])/,
  );
  if (cost) {
    const amount = Number(cost[1].replaceAll(",", "")) * (cost[2] ? 1000 : 1);
    if (
      amount <= 1000000 &&
      !/€|£|\beur\b|\bgbp\b|\beuros?\b|\bpounds?\b/.test(text.toLowerCase())
    )
      f.cost_max = amount;
    if (f.cost_max !== undefined) rest = rest.replace(cost[0], "");
  }
  const rate = rest.match(
    /(?:>|over|above)\s*(\d+)%?\s*(?:admission|acceptance)/,
  );
  if (rate) {
    if (Number(rate[1]) <= 100) f.admission_min = Number(rate[1]);
    if (f.admission_min !== undefined) rest = rest.replace(rate[0], "");
  }
  if (/\b(cs|computer science)\b/.test(rest)) {
    f.field = "Computer Science";
    rest = rest.replace(/\b(cs|computer science)\b/, "");
  }
  if (/\bai\b|artificial intelligence/.test(rest)) {
    f.field = "Artificial Intelligence";
    rest = rest.replace(/\bai\b|artificial intelligence/, "");
  }
  if (rest.includes("engineering")) {
    f.field = "Engineering";
    rest = rest.replace("engineering", "");
  }
  if (rest.includes("english")) {
    f.language = "English";
    rest = rest.replace(/english[- ]?(taught)?/, "");
  }
  if (rest.includes("bachelor")) {
    f.degree = "Bachelor";
    rest = rest.replace(/bachelors?/, "");
  }
  if (rest.includes("financial aid") || rest.includes("high aid")) {
    f.aid = "yes";
    rest = rest.replace(/financial aid|high aid/, "");
  }
  if (/munich|munchen/.test(rest)) {
    f.city = "Munich";
    rest = rest.replace(/munich|munchen/, "");
  }
  if (/\b(phd|doctorate|doctoral)\b/.test(rest)) {
    f.degree = "Doctorate";
    rest = rest.replace(/\b(phd|doctorate|doctoral)\b/, "");
  }
  for (const subject of [
    "Medicine",
    "Business",
    "Economics",
    "Psychology",
    "Law",
    "Biology",
    "Mathematics",
    "Physics",
    "Chemistry",
    "Nursing",
    "Architecture",
  ]) {
    const pattern = new RegExp("\\b" + subject.toLowerCase() + "\\b");
    if (!f.field && pattern.test(rest)) {
      f.field = subject;
      rest = rest.replace(pattern, "");
    }
  }
  const recognized = Object.keys(f).length > 0;
  const remaining = rest
    .replace(
      /\b(universities|university|schools|colleges|programs|courses|in|with|and|good|top|strong|near|for|find|me|show|the|a|an|please)\b/g,
      " ",
    )
    .replace(/[,;.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    filters: filterSchema.parse({
      ...f,
      q: recognized ? remaining.slice(0, 200) : text.slice(0, 200),
    }),
    recognized,
    unparsed: recognized
      ? rest
          .replace(
            /\b(universities|university|schools|programs|in|with|and|good|top|strong|near|for)\b/g,
            "",
          )
          .replace(/\s+/g, " ")
          .trim()
      : "",
  };
}
export type MetricKey =
  | "tuition_in_state"
  | "tuition_out_of_state"
  | "fees_out_of_state"
  | "admission"
  | "tuition"
  | "aid_recipients"
  | "average_grant"
  | "need_met"
  | "enrollment"
  | "international_students"
  | "student_faculty_ratio"
  | "graduation_rate"
  | "employment_rate";
export const metricDefinitions: {
  key: MetricKey;
  label: string;
  unit: string;
  group: string;
}[] = [
  {
    key: "tuition_in_state",
    label: "Undergraduate tuition · in state",
    unit: "currency",
    group: "Costs",
  },
  {
    key: "tuition_out_of_state",
    label: "Undergraduate tuition · out of state",
    unit: "currency",
    group: "Costs",
  },
  {
    key: "fees_out_of_state",
    label: "Required fees · out of state",
    unit: "currency",
    group: "Costs",
  },
  { key: "admission", label: "Admission rate", unit: "%", group: "Admissions" },
  {
    key: "tuition",
    label: "Annual tuition · international",
    unit: "currency",
    group: "Costs",
  },
  {
    key: "aid_recipients",
    label: "Aid recipients",
    unit: "%",
    group: "Financial aid",
  },
  {
    key: "average_grant",
    label: "Average grant",
    unit: "currency",
    group: "Financial aid",
  },
  {
    key: "need_met",
    label: "Average need met",
    unit: "%",
    group: "Financial aid",
  },
  {
    key: "enrollment",
    label: "Enrollment",
    unit: "students",
    group: "Students",
  },
  {
    key: "international_students",
    label: "International students",
    unit: "%",
    group: "Students",
  },
  {
    key: "student_faculty_ratio",
    label: "Students per faculty",
    unit: ":1",
    group: "Academics",
  },
  {
    key: "graduation_rate",
    label: "Graduation rate",
    unit: "%",
    group: "Outcomes",
  },
  {
    key: "employment_rate",
    label: "Employment rate",
    unit: "%",
    group: "Outcomes",
  },
];
export function valueOf(
  u: University,
  key: MetricKey,
): { value: number | null; record?: Sourced; currency?: string } {
  const importedMetric =
    key === "admission"
      ? "acceptance_rate"
      : key === "enrollment"
        ? "enrollment_12_month"
        : [
              "tuition_in_state",
              "tuition_out_of_state",
              "fees_out_of_state",
            ].includes(key)
          ? key
          : null;
  const latestImported = importedMetric
    ? u.imported_records
        ?.filter(
          (r) =>
            r.metric === importedMetric &&
            typeof r.value === "number" &&
            r.reporting_year != null &&
            r.verification_status === "verified" &&
            r.publication_status === "published",
        )
        .sort((a, b) => b.reporting_year! - a.reporting_year!)[0]
    : undefined;
  const existing = key === "admission" ? admission(u) : metric(u, key);
  if (
    latestImported &&
    (!existing || latestImported.reporting_year! > (existing.year || 0))
  ) {
    return {
      value: Number(latestImported.value),
      ...(latestImported.unit === "USD" ? { currency: "USD" } : {}),
      record: {
        id: latestImported.id,
        year: latestImported.reporting_year,
        source_id: null,
        verification_status: "verified",
        verified_at: latestImported.last_verified_at,
        notes: [
          latestImported.period,
          latestImported.cohort,
          latestImported.notes,
        ]
          .filter(Boolean)
          .join(" · "),
        data_sources: {
          id: latestImported.source,
          name: latestImported.source_name,
          url: latestImported.source_url,
          organization: null,
          source_type: "government",
          license_notes: latestImported.license_note,
          retrieved_at: latestImported.retrieved_at,
        },
      },
    };
  }
  if (key === "admission") {
    const a = admission(u);
    if (a?.acceptance_rate != null)
      return { value: a.acceptance_rate, record: a };
  }
  if (key === "tuition") {
    const c = tuition(u);
    if (c) return { value: c.amount, record: c, currency: c.currency };
  }
  const d = metric(u, key);
  if (key === "international_students" && !d && u.publisher_students?.international_percent != null) {
    const students = u.publisher_students;
    return { value: students.international_percent, record: {
      id: u.id + ":publisher-students", year: null, source_id: null,
      verification_status: "verified", verified_at: null,
      notes: `International student percentage reported in THE ${students.edition}. The census year is not specified.`,
      source_url: students.source_url,
    } };
  }
  return {
    value: d?.value ?? null,
    record: d,
    currency: d?.unit?.match(/^[A-Z]{3}$/) ? d.unit : undefined,
  };
}
export const median = (values: (number | null | undefined)[]) => {
  const v = values
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b);
  return v.length
    ? (v[Math.floor((v.length - 1) / 2)] + v[Math.ceil((v.length - 1) / 2)]) / 2
    : null;
};
export function completeness(u: University) {
  const present = metricDefinitions.filter(
    (m) => valueOf(u, m.key).value != null,
  ).length;
  return {
    score: Math.round((100 * present) / metricDefinitions.length),
    present,
    total: metricDefinitions.length,
  };
}
export function filterUniversities(rows: University[], f: Filters) {
  return rows
    .filter((u) => {
      const a = valueOf(u, "admission").value,
        c = valueOf(u, "tuition"),
        intl = valueOf(u, "international_students").value,
        grad = valueOf(u, "graduation_rate").value;
      return (
        matchesSearch(f.q, [
          u.name,
          u.short_name,
          u.city,
          countryName(u.country_code),
          u.region,
          ...(u.aliases || []),
        ]) &&
        (!f.country || f.country.split(",").includes(u.country_code)) &&
        (!f.region || u.region === f.region) &&
        (!f.city || u.city?.toLowerCase().includes(f.city.toLowerCase())) &&
        (!f.type || u.university_type === f.type) &&
        (!(f.field || f.degree || f.language) ||
          (!f.degree &&
            !f.language &&
            !!f.field &&
            !!u.publisher_students?.subjects?.some((subject) =>
              subject.toLowerCase().includes(f.field.toLowerCase()),
            )) ||
          u.university_programs.some(
            ({ programs: p }) =>
              (!f.field ||
                (p.subject + " " + p.name)
                  .toLowerCase()
                  .includes(f.field.toLowerCase())) &&
              (!f.degree || p.degree_level === f.degree) &&
              (!f.language || p.language === f.language),
          ) ||
          (!f.language &&
            !!u.reported_programs?.some(
              (p) =>
                (!f.field ||
                  p.name.toLowerCase().includes(f.field.toLowerCase())) &&
                (!f.degree || p.level === f.degree),
            ))) &&
        (!f.scholarships ||
          u.university_scholarships.some(
            (link) =>
              link.scholarships?.published &&
              link.scholarships.verification_status === "verified",
          )) &&
        (f.cost_max == null ||
          (c.currency === "USD" && c.value != null && c.value <= f.cost_max)) &&
        (f.admission_min == null || (a != null && a >= f.admission_min)) &&
        (f.admission_max == null || (a != null && a <= f.admission_max)) &&
        (f.ielts_max == null ||
          (languageMinimum(u, "IELTS") != null &&
            languageMinimum(u, "IELTS")! <= f.ielts_max)) &&
        (f.intl_min == null || (intl != null && intl >= f.intl_min)) &&
        (f.graduation_min == null ||
          (grad != null && grad >= f.graduation_min)) &&
        (!f.aid ||
          (valueOf(u, "aid_recipients").value != null &&
            valueOf(u, "aid_recipients").value! > 0))
      );
    })
    .sort((a, b) => {
      const byName = () => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
      if (f.sort === "rank" || f.sort === "rank_desc" || f.sort === "rank_the" || f.sort === "rank_arwu") {
        // Compare one named publisher and edition; never blend ranking systems.
        const provider = f.sort === "rank_the" ? "the" : f.sort === "rank_arwu" ? "arwu" : "qs";
        const year = rankingPublishers[provider].year;
        const ar = universityRanks(a).find(r => r.provider === provider && r.year === year)?.rank;
        const br = universityRanks(b).find(r => r.provider === provider && r.year === year)?.rank;
        if (ar == null || br == null) return ar == null && br == null ? byName() : ar == null ? 1 : -1;
        return (ar - br) * (f.sort === "rank_desc" ? -1 : 1) || byName();
      }
      const key = f.sort.startsWith("admission") ? "admission" : f.sort.startsWith("international") ? "international_students" : "tuition";
      const av = valueOf(a, key), bv = valueOf(b, key);
      const an = key === "tuition" && av.currency !== "USD" ? null : av.value;
      const bn = key === "tuition" && bv.currency !== "USD" ? null : bv.value;
      if (an == null || bn == null) return an == null && bn == null ? byName() : an == null ? 1 : -1;
      return (an - bn) * (["tuition_desc", "admission_desc", "international"].includes(f.sort) ? -1 : 1) || byName();
    });
}
export type Preferences = {
  countries?: string[];
  field?: string;
  budget?: number;
  currency?: string;
  degree?: string;
  aid?: boolean;
  weights?: Record<string, number>;
};
export function fitScore(u: University, p: Preferences) {
  const c = valueOf(u, "tuition");
  const components = [
    {
      key: "location",
      label: "Location",
      value: p.countries?.length
        ? p.countries.includes(u.country_code)
          ? 100
          : 0
        : null,
      reason: "Matches your selected countries.",
    },
    {
      key: "program",
      label: "Program",
      value:
        p.field && u.university_programs.length
          ? u.university_programs.some((v) =>
              (v.programs.name + " " + v.programs.subject)
                .toLowerCase()
                .includes(p.field!.toLowerCase()),
            )
            ? 100
            : 0
          : null,
      reason:
        "Matches a published program; missing program lists are excluded.",
    },
    {
      key: "budget",
      label: "Budget",
      value:
        p.budget && c.value != null && c.currency === (p.currency || "USD")
          ? Math.round(Math.min(100, (p.budget / Math.max(c.value, 1)) * 100))
          : null,
      reason:
        "Annual international tuition relative to your budget, in the same currency.",
    },
    {
      key: "aid",
      label: "Aid",
      value: p.aid ? valueOf(u, "aid_recipients").value : null,
      reason: "Reported percentage receiving aid, not your eligibility.",
    },
  ];
  const usable = components.filter(
    (c) => c.value != null && (p.weights?.[c.key] ?? 1) > 0,
  );
  const denominator = usable.reduce((a, c) => a + (p.weights?.[c.key] ?? 1), 0);
  return {
    score: denominator
      ? Math.round(
          usable.reduce((a, c) => a + c.value! * (p.weights?.[c.key] ?? 1), 0) /
            denominator,
        )
      : null,
    components,
    coverage: usable.length + "/" + components.length,
  };
}
export type ExchangeRate = {
  base_currency: string;
  quote_currency: string;
  rate: number;
  observed_at: string;
  data_sources?: { name: string; url: string };
};
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: ExchangeRate[],
) {
  if (from === to) return { amount, estimated: false, rate: null };
  const r = rates
    .filter(
      (r) => r.base_currency === from && r.quote_currency === to && r.rate > 0,
    )
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0];
  return r ? { amount: amount * r.rate, estimated: true, rate: r } : null;
}
export const observationSchema = z
  .object({
    university_id: z.string().uuid(),
    metric: z.string().regex(/^[a-z_]+$/),
    year: z.coerce.number().int().min(1900).max(2100),
    value: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() !== ""
          ? Number(value)
          : value,
      z.number().finite().max(1e12),
    ),
    unit: z.string().max(20),
    source_url: z
      .string()
      .url()
      .refine((v) => v.startsWith("https://")),
    notes: z.string().max(2000).optional(),
    evidence: z.object({
      scope: z.string().max(500).optional(),
      population: z.string().max(1000).optional(),
      reporting_period: z.string().max(100).optional(),
      publication_year: z.number().int().min(1900).max(2100).nullable().optional(),
      retrieved_at: z.string().datetime({offset:true}).optional(),
      source_record_id: z.string().max(200).optional(),
      raw_field: z.string().max(200).optional(),
      dictionary_url: z.string().url().startsWith("https://").optional(),
      license_note: z.string().max(500).optional(),
    }).optional(),
  })
  .superRefine((v, c) => {
    if (v.unit === "%" && (v.value < 0 || v.value > 100))
      c.addIssue({
        code: "custom",
        message: "Percentages must be between 0 and 100",
      });
    if (v.value < 0)
      c.addIssue({
        code: "custom",
        message: "Negative values need review and cannot be imported",
      });
    if (v.metric.includes("rank") && v.value <= 0)
      c.addIssue({ code: "custom", message: "Rank must be positive" });
  });
export function qualityWarnings(value: number, previous: number | null) {
  return previous != null &&
    previous > 0 &&
    Math.abs(value - previous) / previous > 0.5
    ? ["Value changed by more than 50%; review the source and units."]
    : [];
}
