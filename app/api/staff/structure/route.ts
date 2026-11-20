import { adminAccess } from "@/server/admin-access";
import { sameOrigin } from "@/server/config";
import { handleDatabaseStructure } from "@/server/admin-structure";

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json(
      { error: "Same-origin staff request required." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  return handleDatabaseStructure(request, {
    authorize: async (current) => {
      // Existing database-backed administrator, verified aal2 and rate budget.
      // Use the caller's authenticated client, never a service-role key.
      const auth = await adminAccess(current, true);
      return {
        read: (signal) =>
          auth.db.rpc("admin_database_structure").abortSignal(signal),
      };
    },
  });
}
