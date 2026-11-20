import { createClient } from "@supabase/supabase-js";
import { authenticate, sameOrigin, serverConfig } from "@/server/config";
import { handleSupport } from "@/server/support-handler";
import { abortable } from "@/lib/abortable";
import { HttpError } from "@/server/http";

export async function POST(request: Request) {
  return handleSupport(request, {
    sameOrigin,
    send: async (input, current, signal) => {
      const auth = current.headers.has("authorization")
        ? await abortable(authenticate(current), signal)
        : null;
      if (current.headers.has("authorization") && !auth)
        throw new HttpError(
          401,
          "Sign in again before sending. Your draft is kept.",
        );
      if (!auth && !input.email)
        throw new HttpError(400, "Add an email address for a guest message.");
      const config = serverConfig();
      const db =
        auth?.db ??
        createClient(config.url, config.anon, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      const { data, error } = await db
        .rpc("submit_support_request", {
          request_id: input.id,
          request_kind: input.kind,
          sender_name: input.name,
          sender_email: input.email,
          request_subject: input.subject,
          request_message: input.message,
          request_path: input.page_path,
          review_consent: input.consent,
          honeypot: input.website,
        })
        .abortSignal(signal);
      if (error) throw new Error("Support storage could not be confirmed");
      return data;
    },
  });
}
