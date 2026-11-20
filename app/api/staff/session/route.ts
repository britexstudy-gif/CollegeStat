import { authenticate, sameOrigin } from "@/server/config";
import { handleStaffSession } from "@/server/staff-session-handler";
export async function POST(request: Request) {
  return handleStaffSession(request, {
    sameOrigin,
    authenticate: async (request) => {
      const auth = await authenticate(request);
      if (!auth) return null;
      return {
        run: (action, signal) =>
          auth.db.rpc("admin_session_" + action).abortSignal(signal),
      };
    },
  });
}
