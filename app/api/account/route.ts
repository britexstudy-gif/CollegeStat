import {
  authenticate,
  sameOrigin,
  serverConfig,
  serverError,
} from "@/server/config";
import { createClient } from "@supabase/supabase-js";
import { createAccountDeletionHandler } from "@/server/account-deletion";

export const DELETE = createAccountDeletionHandler({
  sameOrigin,
  authenticate,
  service: (signal) => {
    const config = serverConfig();
    if (!config.url || !config.service) return null;
    // Auth-admin calls have no per-call abort option. Bind a separate client to
    // this request's deadline, rather than altering a shared SDK fetch/session.
    const dispatch = fetch;
    const db = createClient(config.url, config.service, {
      global: {
        fetch: (input, init) => dispatch(input, { ...init, signal }),
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return {
      consumeLimit: (owner) =>
        db
          .rpc("consume_rate_limit", {
            key: "account-delete:" + owner,
            max_hits: 3,
            window_seconds: 3600,
          })
          .abortSignal(signal),
      revokeSessions: (token) => db.auth.admin.signOut(token, "global"),
      deleteUser: (owner) => db.auth.admin.deleteUser(owner),
    };
  },
  failure: (error) => serverError("account_delete_failed", error),
});
