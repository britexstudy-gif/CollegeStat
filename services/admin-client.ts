import { getSupabase } from "@/lib/supabase/client";
import { MCP_VERSION, type AdminTool } from "@/lib/admin-mcp";
import { z } from "zod";
export async function staffFetch<T = unknown>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const session = await getSupabase()?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Sign in required");
  const response = await fetch(path, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": MCP_VERSION,
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(body),
  });
  if (response.status === 202) return undefined as T;
  const result = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(result);
    throw new Error(error.success ? error.data.error : "Staff request failed");
  }
  return result as T;
}
export async function callStaffTool<T = unknown>(
  name: AdminTool,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const response = z
    .object({
      error: z.object({ message: z.string() }).optional(),
      result: z
        .object({
          isError: z.boolean(),
          content: z.array(z.object({ text: z.string() })),
          structuredContent: z.object({ data: z.unknown() }).optional(),
        })
        .optional(),
    })
    .parse(
      await staffFetch(
        "/api/staff/mcp",
        {
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "tools/call",
          params: { name, arguments: args },
        },
        signal,
      ),
    );
  if (response.error) throw new Error(response.error.message);
  if (!response.result) throw new Error("Invalid MCP response");
  if (response.result.isError)
    throw new Error(response.result.content[0]?.text || "Tool failed");
  return response.result.structuredContent?.data as T;
}
