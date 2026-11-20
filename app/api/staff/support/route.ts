import { z } from "zod";
import { adminAccess } from "@/server/admin-access";
import { sameOrigin, serverError } from "@/server/config";
import { readJSON } from "@/server/http";
import { supportReview, supportStatuses } from "@/lib/support-requests";
const inputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list"),
      status: z.enum(supportStatuses).nullable(),
      page: z.number().int().min(0).max(1000),
    })
    .strict(),
  supportReview.extend({ action: z.literal("review") }),
]);
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!sameOrigin(request))
    return Response.json(
      { error: "Use the staff inbox." },
      { status: 403, headers },
    );
  try {
    const auth = await adminAccess(request, true);
    const input = inputSchema.parse(await readJSON(request, 16000));
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(12000),
    ]);
    if (input.action === "list") {
      let query = auth.db
        .from("support_requests")
        .select(
          "id,user_id,kind,name,email,subject,message,page_path,status,admin_note,created_at,updated_at",
        )
        .order("created_at", { ascending: false })
        .range(input.page * 25, input.page * 25 + 25);
      if (input.status) query = query.eq("status", input.status);
      const { data, error } = await query.abortSignal(signal);
      if (error) throw error;
      return Response.json(
        {
          records: (data || []).slice(0, 25),
          has_more: (data || []).length > 25,
        },
        { headers },
      );
    }
    const { data, error } = await auth.db
      .rpc("review_support_request", {
        request_id: input.id,
        next_status: input.status,
        internal_note: input.admin_note,
        expected_update: input.expected_updated_at,
      })
      .abortSignal(signal);
    if (error) throw error;
    if (!data)
      return Response.json(
        { error: "This message changed. Reload before saving." },
        { status: 409, headers },
      );
    return Response.json({ record: data }, { headers });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Check the inbox request." },
        { status: 400, headers },
      );
    const result = serverError("staff_support", error);
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  }
}
