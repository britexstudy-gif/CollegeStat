"use client";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCollege } from "./provider";
import { signInHref, writeSessionHint } from "@/lib/auth-navigation";

/**
 * The proxy redirects signed-out dashboard requests on the server. This covers
 * the rest: a routing cookie that outlived its session, or a sign-out while a
 * dashboard page is open. Both return to the same path after sign-in.
 */
export function DashboardAuthRedirect() {
  const s = useCollege();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    if (!s.authReady || s.user) return;
    writeSessionHint(false);
    const query = params.toString();
    router.replace(signInHref((pathname || "/dashboard") + (query ? "?" + query : "")));
  }, [s.authReady, s.user, pathname, params, router]);
  return null;
}
