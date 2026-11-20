import { test } from "node:test";
import assert from "node:assert/strict";
import { authErrorKey, classifyAuthError, cleanCode, OTP_LENGTH, RESEND_SECONDS } from "../lib/auth-errors";
import { isFirstSignIn, postAuthDestination, WELCOME_PATH } from "../lib/auth-navigation";
import { en } from "../lib/i18n/locales/en";

test("Supabase error codes map to friendly messages that exist in English", () => {
  const cases: [unknown, string][] = [
    [{ code: "otp_expired", status: 403 }, "wrong_or_expired"],
    [{ message: "Token has expired or is invalid" }, "wrong_or_expired"],
    [{ code: "over_request_rate_limit", status: 429 }, "too_many"],
    [{ status: 429 }, "too_many"],
    [{ code: "over_email_send_rate_limit" }, "email_limit"],
    [{ code: "otp_disabled" }, "signups_closed"],
    [{ code: "email_address_invalid" }, "invalid_email"],
    [{ code: "user_banned" }, "blocked"],
    [{ name: "AuthRetryableFetchError", status: 0 }, "network"],
    [{ code: "something_new", status: 500 }, "unknown"],
    [null, "network"],
  ];
  for (const [cause, kind] of cases) assert.equal(classifyAuthError(cause), kind, JSON.stringify(cause));
  for (const cause of cases.map(([c]) => c)) assert.ok(authErrorKey(cause) in en);
});

test("pasted codes keep only six digits", () => {
  assert.equal(cleanCode("123 456"), "123456");
  assert.equal(cleanCode("123-456-789"), "123456");
  assert.equal(cleanCode("ab12"), "12");
  assert.equal(OTP_LENGTH, 6);
  assert.equal(RESEND_SECONDS, 60);
});

const fresh = { email_confirmed_at: "2026-11-14T10:00:01Z", last_sign_in_at: "2026-11-14T10:00:01Z" };
const returning = { email_confirmed_at: "2026-09-01T10:00:00Z", last_sign_in_at: "2026-11-14T10:00:01Z" };

test("first sign-in is detected from the confirmation and sign-in timestamps", () => {
  assert.equal(isFirstSignIn(fresh), true);
  assert.equal(isFirstSignIn(returning), false);
  assert.equal(isFirstSignIn(null), false);
  assert.equal(isFirstSignIn({}), false);
});

test("after verify: new students go to onboarding, returning students to the validated return URL", () => {
  assert.equal(postAuthDestination("/dashboard/compare?ids=a", fresh), WELCOME_PATH);
  assert.equal(postAuthDestination("/dashboard/compare?ids=a", returning), "/dashboard/compare?ids=a");
  assert.equal(postAuthDestination("/universities/mit", returning), "/universities/mit");
  assert.equal(postAuthDestination(null, returning), "/dashboard");
});

test("hostile return URLs fall back to the dashboard and recovery goes to the reset page", () => {
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/auth/sign-in"])
    assert.equal(postAuthDestination(bad, returning), "/dashboard", bad);
  assert.equal(postAuthDestination("/dashboard", returning, { recovery: true }), "/auth/reset-password");
});
