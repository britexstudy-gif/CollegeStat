"use client";
import { useMemo } from "react";
import { useCollege } from "./provider";
import { staffFetch, callStaffTool } from "@/services/admin-client";
import type { AdminTool } from "@/lib/admin-mcp";
import { useStaffSession } from "./staff-session-provider";

/** All staff callers share the scope invalidated synchronously by auth events. */
export function useStaffAccount() {
  const { accountScope: scope } = useCollege();
  const { boundary } = useStaffSession();
  return useMemo(
    () => ({
      scope,
      staffFetch: <T = unknown>(
        path: string,
        body: unknown,
        signal?: AbortSignal,
      ) => staffFetch<T>(path, body, signal, { scope, staffSession: boundary }),
      callStaffTool: <T = unknown>(
        name: AdminTool,
        args: Record<string, unknown>,
        signal?: AbortSignal,
      ) =>
        callStaffTool<T>(name, args, signal, { scope, staffSession: boundary }),
      request: (body: unknown) =>
        staffFetch<Record<string, unknown>>("/api/admin", body, undefined, {
          scope,
          staffSession: boundary,
        }),
    }),
    [scope, boundary],
  );
}
