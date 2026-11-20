import test from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../lib/domain";
import { signInHref } from "../lib/auth-navigation";
import { isStaffPath, STAFF_PATH, STAFF_SIGN_IN } from "../lib/staff-route";
import { authAvailability } from "../lib/auth-availability";
import {
  AccountScope,
  changeAccountOwner,
  emptyAccount,
  visibleAccount,
} from "../lib/account-owner";

// Redirect validation: internal paths pass, external/protocol-relative/auth pass through safely.
test("safeNext keeps internal routes and neutralizes external or auth-loop targets", () => {
  assert.equal(safeNext(null), "/dashboard");
  assert.equal(safeNext(""), "/dashboard");
  assert.equal(safeNext("/dashboard"), "/dashboard");
  assert.equal(safeNext("/profile?x=1"), "/profile?x=1");
  assert.equal(safeNext(STAFF_PATH), STAFF_PATH);
  // Auth pages would loop, so they fall back to the dashboard.
  assert.equal(safeNext("/auth/sign-in"), "/dashboard");
  assert.equal(safeNext("/auth/callback?next=/dashboard"), "/dashboard");
  // External and protocol-relative targets never leave the origin.
  for (const hostile of [
    "https://evil.test",
    "http://evil.test/x",
    "//evil.test",
    "javascript:alert(1)",
    "/\\evil",
    "data:text/plain,hi",
  ])
    assert.equal(safeNext(hostile), "/dashboard", hostile);
});

test("signInHref never emits an external URL and separates staff sign-in", () => {
  const student = signInHref("/dashboard");
  assert.match(student, /^\/auth\/sign-in\?/);
  assert.ok(!student.includes("evil"));
  const staff = signInHref(STAFF_PATH);
  assert.ok(staff.startsWith(STAFF_SIGN_IN + "?"));
  const hostile = signInHref("https://evil.test");
  assert.match(hostile, /^\/auth\/sign-in\?/);
  assert.ok(!hostile.includes("evil.test"));
  const authLoop = signInHref("/auth/sign-in");
  assert.match(authLoop, /^\/auth\/sign-in\?next=%2Fdashboard/);
});

test("staff path helper matches only the discreet console entry", () => {
  assert.equal(isStaffPath(null), false);
  assert.equal(isStaffPath("/"), false);
  assert.equal(isStaffPath("/staff"), false);
  assert.equal(isStaffPath(STAFF_PATH), true);
  assert.equal(isStaffPath(STAFF_PATH + "/review"), true);
  assert.equal(isStaffPath("/staffx"), false);
});

// Provider availability must fail closed and require exact Telegram OIDC identity.
test("auth availability requires backend booleans and exact Telegram OIDC tuple", () => {
  assert.deepEqual(authAvailability(null), {
    email: false,
    google: false,
    apple: false,
    telegram: false,
    signup: false,
  });
  // String "true" from a misread payload must not enable a provider.
  assert.equal(
    authAvailability({ external: { google: "true", email: true } }).google,
    false,
  );
  const oidc = {
    identifier: "custom:telegram",
    enabled: true,
    provider_type: "oidc",
    issuer: "https://oauth.telegram.org",
  };
  assert.equal(
    authAvailability({ external: {}, disable_signup: false }, [oidc]).telegram,
    true,
  );
  for (const unsafe of [
    { ...oidc, enabled: "true" },
    { ...oidc, issuer: "https://oauth.telegram.org.evil.test" },
    { ...oidc, provider_type: "oauth2" },
    { ...oidc, identifier: "telegram" },
  ])
    assert.equal(
      authAvailability({ external: {} }, [unsafe]).telegram,
      false,
      JSON.stringify(unsafe),
    );
});

// Owner isolation: switching identity synchronously invalidates prior state.
test("account switch masks prior owner and never revives stale tokens", () => {
  const owned = {
    ...emptyAccount<{ id: string }>("A"),
    loaded: true,
    profile: { id: "A" },
    saved: ["uni-a"],
    savedScholarships: ["award-a"],
    compare: ["cmp-a"],
  };
  const masked = visibleAccount(owned, "B");
  assert.equal(masked.profile, null);
  assert.deepEqual(masked.saved, []);
  assert.deepEqual(masked.compare, []);
  assert.equal(masked.loaded, false);

  // Anonymous local comparison carries into the first sign-in only.
  const anon = { ...emptyAccount(), compare: ["local-id"] };
  assert.deepEqual(changeAccountOwner(anon, "A").compare, ["local-id"]);
  assert.deepEqual(changeAccountOwner(owned, "B").compare, []);
  assert.deepEqual(changeAccountOwner(owned, null).compare, []);

  const scope = new AccountScope();
  scope.changeOwner("A");
  const stale = scope.capture();
  scope.changeOwner("B");
  assert.equal(scope.isCurrent(stale), false);
  scope.changeOwner("A");
  assert.equal(
    scope.isCurrent(stale),
    false,
    "returning to A must not revive its old requests",
  );
});
