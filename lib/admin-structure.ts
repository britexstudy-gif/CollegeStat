import { z } from "zod";

/** Fixed metadata scope; adding a table requires an explicit code/SQL review. */
export const structureTables = [
  "countries",
  "cities",
  "universities",
  "university_aliases",
  "campuses",
  "programs",
  "university_programs",
  "admissions",
  "costs",
  "requirements",
  "deadlines",
  "financial_aid",
  "scholarships",
  "university_scholarships",
  "ranking_sources",
  "external_rankings",
  "ranking_providers",
  "ranking_editions",
  "ranking_entries",
  "national_ranking_editions",
  "national_ranking_entries",
  "research_metrics",
  "outcomes",
  "departments",
  "professors",
  "research",
  "media",
  "external_identifiers",
  "institution_candidates",
  "data_sources",
  "data_points",
  "data_imports",
  "source_records",
  "data_quality_checks",
  "verification_logs",
  "audit_logs",
  "ingestion_feeds",
  "ingestion_jobs",
  "stale_evidence",
  "learning_resources",
  "support_requests",
  "exchange_rates",
  "profiles",
  "saved_universities",
  "saved_scholarships",
  "comparison_lists",
  "shared_comparisons",
  "saved_searches",
  "user_lists",
  "user_list_items",
  "user_notes",
  "user_checklist",
  "research_history",
  "notifications",
  "writing_draft_versions",
  "student_education",
  "student_test_attempts",
  "university_admissions",
  "university_requirements",
  "university_deadlines",
  "university_costs",
  "university_rankings",
  "university_identifiers",
] as const;

export const structureByteLimit = 256 * 1024;
const identifier = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z_][a-z0-9_]*$/);
const column = z
  .object({
    name: identifier,
    type: z.string().min(1).max(160),
    nullable: z.boolean(),
    primary_key: z.boolean(),
    has_default: z.boolean(),
  })
  .strict();
const foreignKey = z
  .object({
    name: z.string().min(1).max(63),
    columns: z.array(identifier).min(1).max(16),
    target_schema: z.enum(["public", "auth"]),
    target_table: identifier,
    target_columns: z.array(identifier).min(1).max(16),
  })
  .strict();
const policy = z
  .object({
    name: z.string().min(1).max(63),
    command: z.enum(["ALL", "SELECT", "INSERT", "UPDATE", "DELETE"]),
    roles: z.array(z.string().min(1).max(63)).min(1).max(16),
    permissive: z.boolean(),
  })
  .strict();
const table = z
  .object({
    schema: z.literal("public"),
    name: z.enum(structureTables),
    kind: z.enum(["table", "partitioned_table", "view", "materialized_view"]),
    rls_enabled: z.boolean(),
    rls_forced: z.boolean(),
    security_invoker: z.boolean().nullable(),
    columns: z.array(column).max(100),
    foreign_keys: z.array(foreignKey).max(30),
    policies: z.array(policy).max(40),
  })
  .strict()
  .superRefine((value, ctx) => {
    const names = new Set(value.columns.map((entry) => entry.name));
    if (names.size !== value.columns.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate column metadata",
      });
    if (
      new Set(value.policies.map((entry) => entry.name)).size !==
      value.policies.length
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate policy metadata",
      });
    for (const key of value.foreign_keys) {
      if (
        key.columns.length !== key.target_columns.length ||
        key.columns.some((name) => !names.has(name))
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid relationship metadata",
        });
      if (
        key.target_schema === "public" &&
        !(structureTables as readonly string[]).includes(key.target_table)
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Relationship outside metadata scope",
        });
      if (key.target_schema === "auth" && key.target_table !== "users")
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Relationship outside metadata scope",
        });
    }
  });

export const databaseStructureSchema = z
  .object({
    schema: z.literal("public"),
    scope: z.literal("allowlisted_application_metadata"),
    checked_at: z.string().datetime({ offset: true }),
    tables: z.array(table).max(structureTables.length),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.tables.map((entry) => entry.name)).size !==
      value.tables.length
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate table metadata",
      });
  });

export type DatabaseStructure = z.infer<typeof databaseStructureSchema>;
export type StructureTable = DatabaseStructure["tables"][number];

/** Unknown keys are rejected; the preview cannot quietly include row values or SQL. */
export function parseDatabaseStructure(value: unknown): DatabaseStructure {
  let size: number;
  try {
    const json = JSON.stringify(value);
    if (typeof json !== "string") throw new Error("Missing metadata");
    size = new TextEncoder().encode(json).byteLength;
  } catch {
    throw new Error("Database structure could not be verified.");
  }
  if (size > structureByteLimit)
    throw new Error("Database structure exceeded the preview limit.");
  const result = databaseStructureSchema.safeParse(value);
  if (!result.success)
    throw new Error("Database structure could not be verified.");
  return result.data;
}
