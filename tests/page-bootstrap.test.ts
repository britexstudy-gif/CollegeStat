import assert from "node:assert/strict";
import test from "node:test";
import { defersPublicCatalogue } from "../lib/page-bootstrap";

test("account and external reading bootstraps defer cards while discovery retains SSR data", () => {
  for (const path of [
    "/auth/sign-in",
    "/auth/sign-up",
    "/auth/forgot-password",
    "/staff/college-console/sign-in",
    "/staff/college-console",
    "/admin",
    "/dashboard",
    "/dashboard/universities",
    "/dashboard/university/mit",
    "/dashboard/rankings",
    "/dashboard/compare",
    "/dashboard/library/resources/funding",
    "/dashboard/prepare",
    "/dashboard/profile",
    "/profile",
    "/saved",
    "/articles",
    "/articles/how-to-write-a-college-essay",
  ])
    assert.equal(defersPublicCatalogue(path), true, path);
  for (const path of [
    "",
    "/",
    "/universities",
    "/university/mit",
    "/rankings",
    "/scholarships",
    "/authentic",
    "/dashboard-fake",
    "/administrator",
    "/articles-extra",
  ])
    assert.equal(defersPublicCatalogue(path), false, path);
});
