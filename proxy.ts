import { NextRequest, NextResponse } from "next/server";
import { isStaffPath } from "@/lib/staff-route";
import {
  dashboardSignInRedirect,
  SESSION_HINT_COOKIE,
} from "@/lib/auth-navigation";
const PUBLIC_READ_APIS = new Set([
  "/api/catalog",
  "/api/rankings/national",
  "/api/learning-resources",
  "/api/auth/providers",
]);
export function proxy(request: NextRequest) {
  // Overwrite the incoming hint. Layout uses this only to defer optional public
  // cards; account authorization continues to use the verified session and RLS.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-collegestat-request-path", request.nextUrl.pathname);
  // Lets the root layout start a public page's data reads early (server/route-prefetch.ts).
  requestHeaders.set("x-collegestat-request-search", request.nextUrl.search);
  // Signed-out visitors to /dashboard or /dashboard/* go to sign-in and come
  // back to the same path afterwards (the return URL is path-only, see safeNext).
  const signIn =
    request.method === "GET" || request.method === "HEAD"
      ? dashboardSignInRedirect(
          request.nextUrl.pathname,
          request.nextUrl.search,
          Boolean(request.cookies.get(SESSION_HINT_COOKIE)?.value),
        )
      : null;
  const response = signIn
    ? NextResponse.redirect(new URL(signIn, request.url), 307)
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=()",
  );
  response.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  );
  if (request.nextUrl.protocol === "https:")
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  // Anonymous, published-data GET endpoints set their own short public
  // Cache-Control (and no-store on errors); overriding them with no-store here
  // made every catalogue/search/explore call re-download from the Worker.
  const publicRead =
    (request.method === "GET" || request.method === "HEAD") &&
    (PUBLIC_READ_APIS.has(request.nextUrl.pathname) ||
      request.nextUrl.pathname.startsWith("/api/public/"));
  if (
    (request.nextUrl.pathname.startsWith("/api/") && !publicRead) ||
    request.nextUrl.pathname.startsWith("/auth/") ||
    request.nextUrl.pathname.startsWith("/admin") ||
    isStaffPath(request.nextUrl.pathname) ||
    ["/dashboard", "/saved", "/profile"].includes(request.nextUrl.pathname) ||
    request.nextUrl.pathname.startsWith("/dashboard/")
  )
    response.headers.set("Cache-Control", "private, no-store");
  if (isStaffPath(request.nextUrl.pathname))
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg).*)"],
};
