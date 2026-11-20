import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../lib/domain";
import { dashboardSignInRedirect, isDashboardPath } from "../lib/auth-navigation";

test("signed-out dashboard requests go to sign-in with a path-only return URL", () => {
  assert.equal(
    dashboardSignInRedirect("/dashboard", "", false),
    "/auth/sign-in?next=%2Fdashboard&returnTo=%2Fdashboard",
  );
  const nested = dashboardSignInRedirect("/dashboard/library/scholarships", "?country=UZ", false)!;
  const params = new URL(nested, "https://example.test").searchParams;
  assert.equal(params.get("next"), "/dashboard/library/scholarships?country=UZ");
  assert.equal(safeNext(params.get("next")), "/dashboard/library/scholarships?country=UZ");
});

test("signed-in hints and other routes are not redirected", () => {
  assert.equal(dashboardSignInRedirect("/dashboard/welcome", "", true), null);
  for (const path of ["/", "/universities", "/dashboards", "/zz-preview", "/zz-l3", "/auth/sign-in"])
    assert.equal(dashboardSignInRedirect(path, "", false), null, path);
  assert.equal(isDashboardPath("/dashboard"), true);
  assert.equal(isDashboardPath("/dashboard/compare"), true);
  assert.equal(isDashboardPath("/dashboard-old"), false);
});

test("return URLs cannot leave the site", () => {
  for (const bad of [
    "https://evil.example/x",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    " /dashboard",
    "javascript:alert(1)",
    "dashboard",
    "/auth/sign-in?next=/dashboard",
    "/dashboard/../auth/callback",
    null,
    "",
  ])
    assert.equal(safeNext(bad), "/dashboard", String(bad));
  assert.equal(safeNext("/dashboard/compare?ids=a,b#top"), "/dashboard/compare?ids=a,b#top");
  assert.equal(safeNext("/universities"), "/universities");
});
