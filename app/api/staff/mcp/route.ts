import { adminAccess } from "@/server/admin-access";
import { sameOrigin, serverError } from "@/server/config";
import { HttpError, readJSON } from "@/server/http";
import { dispatchMCP, MCP_VERSION, rpcSchema } from "@/lib/admin-mcp";
import { runAdminTool } from "@/server/admin-tools";
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403, headers });
  try {
    const auth = await adminAccess(request);
    const accept = request.headers.get("accept") || "";
    if (
      !accept.includes("application/json") ||
      !accept.includes("text/event-stream")
    )
      throw new HttpError(406, "Accept application/json and text/event-stream");
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new HttpError(415, "Use application/json");
    const version = request.headers.get("mcp-protocol-version");
    if (version && version !== MCP_VERSION)
      throw new HttpError(400, "Unsupported MCP protocol version");
    const input = await readJSON(request, 100000);
    const msg = rpcSchema.safeParse(input);
    const staging =
      msg.success &&
      msg.data.method === "tools/call" &&
      msg.data.id !== undefined &&
      msg.data.params?.name === "stage_observations";
    if (staging) {
      const claims = await auth.db.auth.getClaims(auth.token);
      if (claims.error || claims.data?.claims.aal !== "aal2")
        throw new HttpError(
          403,
          "Verify your authenticator in Security before staging evidence.",
        );
    }
    const response = await dispatchMCP(input, (name, args) =>
      runAdminTool(auth.db, name, args, staging),
    );
    return response === null
      ? new Response(null, { status: 202, headers })
      : Response.json(response, { headers });
  } catch (e) {
    const response = serverError("staff_mcp_failed", e);
    for (const [key, value] of Object.entries(headers))
      response.headers.set(key, value);
    return response;
  }
}
// Stateless JSON transport; unsolicited SSE streams and persistent sessions are not offered.
export async function GET(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403, headers });
  try {
    await adminAccess(request);
    return new Response(null, {
      status: 405,
      headers: { ...headers, Allow: "POST" },
    });
  } catch (e) {
    const response = serverError("staff_mcp_failed", e);
    for (const [key, value] of Object.entries(headers))
      response.headers.set(key, value);
    return response;
  }
}
