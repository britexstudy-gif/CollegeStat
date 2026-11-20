import { z } from "zod";

// These are catalogue previews, not a cursor-paginated or complete dataset export.
const ADMIN_RESULT_LIMIT = 25;
export const ADMIN_RESULT_MAX_BYTES = 64 * 1024;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = (max: number) => z.string().max(max);
const id = z.string().uuid();
const https = z
  .string()
  .url()
  .startsWith("https://")
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Catalogue URLs must not include credentials");
const timestamp = text(80).datetime({ offset: true });
const number = z.number().finite();
const sourceType = z.enum([
  "official",
  "government",
  "accreditation",
  "ranking",
  "secondary",
  "scholarship",
]);
const trust = z.enum(["high", "medium", "low"]);
const university = z.object({
  id,
  name: text(500),
  slug: text(300).regex(/^[a-z0-9-]+$/),
  country_code: text(2).regex(/^[A-Z]{2}$/),
  website: https.nullable(),
  logo_url: https.nullable(),
});
const evidence = z.object({
  scope: text(500).optional(),
  population: text(1000).optional(),
  reporting_period: text(100).optional(),
  publication_year: z.number().int().min(1900).max(2100).nullable().optional(),
  retrieved_at: timestamp.optional(),
  source_record_id: text(200).optional(),
  raw_field: text(200).optional(),
  dictionary_url: https.optional(),
  license_note: text(500).optional(),
});
const source = z.object({
  name: text(500),
  organization: text(500).nullable(),
  url: https,
  source_type: sourceType,
  retrieved_at: timestamp.nullable(),
  published_at: timestamp.nullable(),
  trust_level: trust,
  license_notes: text(4000).nullable(),
});
const requirement = z.object({
  id,
  label: text(1000),
  kind: z.enum(["SAT", "ACT", "IELTS", "TOEFL", "document", "other"]),
  minimum: number.nullable(),
  maximum: number.nullable(),
  student_category: text(500),
  required: z.boolean().nullable(),
  year: z.number().int().min(1900).max(2100).nullable(),
  source_url: https.nullable(),
  verified_at: timestamp.nullable(),
  notes: text(4000).nullable(),
});
const adminResultSchemas = {
  search_universities: z
    .array(
      university.extend({
        city: text(500).nullable(),
        published: z.literal(true),
      }),
    )
    .max(ADMIN_RESULT_LIMIT),
  university_coverage: z
    .object({
      university: university.extend({ updated_at: timestamp }),
      categories: z
        .array(
          z.object({
            key: z.enum([
              "identity",
              "programs",
              "requirements",
              "deadlines",
              "costs",
              "admissions",
              "rankings",
              "media",
            ]),
            label: text(100),
            count,
          }),
        )
        .length(8),
      requirement_evidence: z.array(requirement).max(ADMIN_RESULT_LIMIT),
      requirement_evidence_total: count,
      requirement_evidence_truncated: z.boolean(),
      pending: count,
      conflicts: count,
      last_requirement_check: timestamp.nullable(),
      oldest_requirement_check: timestamp.nullable(),
    })
    .superRefine((value, ctx) => {
      if (
        value.requirement_evidence_total < value.requirement_evidence.length ||
        value.requirement_evidence_truncated !==
          value.requirement_evidence_total > value.requirement_evidence.length
      )
        ctx.addIssue({
          code: "custom",
          message: "Inconsistent evidence preview",
        });
    }),
  list_sources: z.array(source.extend({ id })).max(ADMIN_RESULT_LIMIT),
  review_queue: z
    .array(
      z.object({
        id,
        university_id: id.nullable(),
        source_id: id,
        metric: text(300),
        year: z.number().int().min(1900).max(2100),
        normalized_value: number.nullable(),
        unit: text(100).nullable(),
        status: z.enum(["pending", "conflicting"]),
        source_url: https,
        retrieved_at: timestamp,
        notes: text(4000).nullable(),
        evidence: evidence.nullable(),
        data_sources: source.nullable(),
      }),
    )
    .max(ADMIN_RESULT_LIMIT),
  stage_observations: z
    .object({
      import_id: id,
      accepted: count.max(ADMIN_RESULT_LIMIT),
      rejected: z.literal(0),
      duplicates: count.max(ADMIN_RESULT_LIMIT),
      warnings: z.array(text(1000)).max(10),
    })
    .superRefine((value, ctx) => {
      if (value.accepted + value.duplicates > ADMIN_RESULT_LIMIT)
        ctx.addIssue({
          code: "custom",
          message: "Staging count exceeds batch",
        });
    }),
};
export type AdminResultTool = keyof typeof adminResultSchemas;
export type AdminToolResult<T extends AdminResultTool> = z.infer<
  (typeof adminResultSchemas)[T]
>;

const nullable = (schema: Record<string, unknown>) => ({
  anyOf: [schema, { type: "null" }],
});
const string = (maxLength: number) => ({ type: "string", maxLength });
const uuid = { type: "string", format: "uuid" };
const url = {
  ...string(2048),
  format: "uri",
  pattern: "^https://(?![^/?#]*@)",
};
const date = { ...string(80), format: "date-time" };
const integer = {
  type: "integer",
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
};
const year = { type: "integer", minimum: 1900, maximum: 2100 };
const numeric = { type: "number" };
const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const array = (
  items: Record<string, unknown>,
  maxItems = ADMIN_RESULT_LIMIT,
) => ({ type: "array", items, maxItems });
const sourceFields = {
  name: string(500),
  organization: nullable(string(500)),
  url,
  source_type: { type: "string", enum: sourceType.options },
  retrieved_at: nullable(date),
  published_at: nullable(date),
  trust_level: { type: "string", enum: trust.options },
  license_notes: nullable(string(4000)),
};
const universityFields = {
  id: uuid,
  name: string(500),
  slug: { ...string(300), pattern: "^[a-z0-9-]+$" },
  country_code: { ...string(2), pattern: "^[A-Z]{2}$" },
  website: nullable(url),
  logo_url: nullable(url),
};
const evidenceFields = {
  scope: string(500),
  population: string(1000),
  reporting_period: string(100),
  publication_year: nullable(year),
  retrieved_at: date,
  source_record_id: string(200),
  raw_field: string(200),
  dictionary_url: url,
  license_note: string(500),
};
// The outer `data` property preserves the installed workbench and client contract.
export const adminOutputSchemas: Record<
  AdminResultTool,
  Record<string, unknown>
> = {
  search_universities: object({
    data: array(
      object({
        ...universityFields,
        city: nullable(string(500)),
        published: { type: "boolean", const: true },
      }),
    ),
  }),
  university_coverage: object({
    data: object({
      university: object({ ...universityFields, updated_at: date }),
      categories: {
        ...array(
          object({
            key: {
              type: "string",
              enum: [
                "identity",
                "programs",
                "requirements",
                "deadlines",
                "costs",
                "admissions",
                "rankings",
                "media",
              ],
            },
            label: string(100),
            count: integer,
          }),
          8,
        ),
        minItems: 8,
      },
      requirement_evidence: array(
        object({
          id: uuid,
          label: string(1000),
          kind: { type: "string", enum: requirement.shape.kind.options },
          minimum: nullable(numeric),
          maximum: nullable(numeric),
          student_category: string(500),
          required: nullable({ type: "boolean" }),
          year: nullable(year),
          source_url: nullable(url),
          verified_at: nullable(date),
          notes: nullable(string(4000)),
        }),
      ),
      requirement_evidence_total: integer,
      requirement_evidence_truncated: { type: "boolean" },
      pending: integer,
      conflicts: integer,
      last_requirement_check: nullable(date),
      oldest_requirement_check: nullable(date),
    }),
  }),
  list_sources: object({ data: array(object({ ...sourceFields, id: uuid })) }),
  review_queue: object({
    data: array(
      object({
        id: uuid,
        university_id: nullable(uuid),
        source_id: uuid,
        metric: string(300),
        year,
        normalized_value: nullable(numeric),
        unit: nullable(string(100)),
        status: { type: "string", enum: ["pending", "conflicting"] },
        source_url: url,
        retrieved_at: date,
        notes: nullable(string(4000)),
        evidence: nullable(object(evidenceFields, [])),
        data_sources: nullable(object(sourceFields)),
      }),
    ),
  }),
  stage_observations: object({
    data: object({
      import_id: uuid,
      accepted: { ...integer, maximum: ADMIN_RESULT_LIMIT },
      rejected: { type: "integer", const: 0 },
      duplicates: { ...integer, maximum: ADMIN_RESULT_LIMIT },
      warnings: array(string(1000), 10),
    }),
  }),
};

export const adminToolMessages = {
  mfa: "Verify your authenticator in Security before staging evidence.",
  unavailable: "Catalogue query failed. Retry or check database configuration.",
  invalid:
    "Catalogue returned an unexpected result. Inspect the record in the staff console.",
  oversized:
    "Catalogue result is too large. Use a smaller limit or inspect the record in the staff console.",
} as const;
export class AdminResultError extends Error {
  constructor(code: "invalid" | "oversized") {
    super(adminToolMessages[code]);
  }
}

export function parseAdminToolResult<T extends AdminResultTool>(
  name: T,
  result: unknown,
): AdminToolResult<T> {
  let candidate = result;
  if (
    name === "university_coverage" &&
    result &&
    typeof result === "object" &&
    !Array.isArray(result)
  ) {
    const row = result as Record<string, unknown>;
    if (Array.isArray(row.requirement_evidence))
      candidate = {
        ...row,
        requirement_evidence: row.requirement_evidence.slice(
          0,
          ADMIN_RESULT_LIMIT,
        ),
        requirement_evidence_total:
          row.requirement_evidence_total ?? row.requirement_evidence.length,
        requirement_evidence_truncated:
          Number(
            row.requirement_evidence_total ?? row.requirement_evidence.length,
          ) > ADMIN_RESULT_LIMIT,
      };
  }
  const parsed = adminResultSchemas[name].safeParse(candidate);
  if (!parsed.success) throw new AdminResultError("invalid");
  // Zod objects intentionally strip non-contract fields before serialization.
  // A provider error, credentials or a future unreviewed column cannot spill into MCP.
  const serialized = JSON.stringify({ data: parsed.data });
  if (new TextEncoder().encode(serialized).byteLength > ADMIN_RESULT_MAX_BYTES)
    throw new AdminResultError("oversized");
  return parsed.data as AdminToolResult<T>;
}
