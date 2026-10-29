import { readJSON } from "@/server/http";
import { z } from "zod";
import { sameOrigin, serverError } from "@/server/config";
import { adminAccess } from "@/server/admin-access";
import { entitySchemas, Entity } from "@/services/admin-schema";
import { observationSchema } from "@/lib/research";
const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("review_identity"),
    id: z.string().uuid(),
    approve: z.boolean(),
    existing_id: z.string().uuid().nullable(),
  }),
  z.object({
    action: z.literal("save"),
    entity: z.enum(Object.keys(entitySchemas) as [Entity, ...Entity[]]),
    record: z.record(z.string(), z.unknown()),
  }),
  z.object({
    action: z.literal("import"),
    source_id: z.string().uuid(),
    rows: z.array(z.unknown()).min(1).max(500),
  }),
  z.object({
    action: z.literal("verify"),
    entity: z.string(),
    id: z.string().uuid(),
  }),
  z.object({ action: z.literal("retry"), id: z.string().uuid() }),
  z.object({
    action: z.literal("review"),
    id: z.string().uuid(),
    approve: z.boolean(),
  }),
]);
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  try {
    const auth = await adminAccess(request, true);
    const parsed = requestSchema.safeParse(await readJSON(request, 1000000));
    if (!parsed.success)
      return Response.json(
        { error: "Invalid administrative request" },
        { status: 400 },
      );
    const input = parsed.data;
    if (input.action === "review_identity") {
      const { data, error } = await auth.db.rpc(
        "review_institution_candidate",
        {
          candidate: input.id,
          accept: input.approve,
          existing: input.existing_id,
        },
      );
      if (error)
        return Response.json(
          {
            error:
              "Review failed. Check for an existing university with this name, website, or ROR ID; link its UUID instead of creating a duplicate.",
          },
          { status: 409 },
        );
      return Response.json({ university_id: data });
    }
    if (input.action === "save") {
      const record = entitySchemas[input.entity].safeParse(input.record);
      if (!record.success)
        return Response.json(
          {
            error: record.error.issues
              .map((i) => i.path.join(".") + ": " + i.message)
              .join("; "),
          },
          { status: 400 },
        );
      const { error } = await auth.db
        .from(input.entity)
        .upsert(record.data as Record<string, unknown>);
      if (error) throw error;
      return Response.json({ saved: true });
    }
    if (input.action === "verify" || input.action === "retry") {
      const { error } =
        input.action === "verify"
          ? await auth.db.rpc("verify_record", {
              entity: input.entity,
              record_id: input.id,
            })
          : await auth.db.rpc("retry_ingestion_job", { job_id: input.id });
      if (error) throw error;
      return Response.json({ saved: true });
    }
    if (input.action === "review") {
      const { error } = await auth.db.rpc(
        input.approve ? "approve_observation" : "reject_observation",
        { observation_id: input.id },
      );
      if (error) throw error;
      return Response.json({ reviewed: true });
    }
    const rows = input.rows.map((row) => observationSchema.safeParse(row));
    if (rows.some((r) => !r.success))
      return Response.json(
        {
          error:
            "Every row must include a valid university, metric, year, value, unit and HTTPS source. Nothing was imported.",
        },
        { status: 400 },
      );
    const { data, error } = await auth.db.rpc("stage_observations", {
      source: input.source_id,
      rows: rows.map((r) => r.data),
    });
    if (error) throw error;
    return Response.json(data);
  } catch (e) {
    return serverError("admin_operation_failed", e);
  }
}
