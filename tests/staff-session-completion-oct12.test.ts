import test from "node:test";
import assert from "node:assert/strict";
import { AccountScope } from "../lib/account-owner";
import {
  StaffSessionScope,
  StaffSessionExpiredError,
  captureStaffSessionCompletion,
} from "../lib/staff-session";
import { createStaffFetch } from "../services/admin-client";

const OWNER = "10000000-0000-4000-8000-000000000001";
const A = "20000000-0000-4000-8000-000000000001";
const B = "20000000-0000-4000-8000-000000000002";
const receipt = {
  active: true,
  server_time: "2026-10-12T00:00:00Z",
  expires_at: "2026-10-12T00:15:00Z",
};

function setup() {
  const account = new AccountScope();
  account.changeOwner(OWNER);
  const boundary = new StaffSessionScope(() => 0);
  boundary.identify(A);
  boundary.accept(receipt);
  return { account, boundary };
}

test("a delayed renewal or expiry-check failure from A cannot close active replacement B", async () => {
  for (const operation of ["renewal", "expiry-check", "keep-working"]) {
    const { account, boundary } = setup();
    let revision = 1;
    const ownsCompletion = captureStaffSessionCompletion(
      account,
      boundary,
      () => revision,
    );
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((_resolve, fail) => (reject = fail));
    let ended = false;
    const completed = pending.catch(() => {
      if (!ownsCompletion()) return;
      ended = true;
      boundary.close();
    });

    boundary.identify(B);
    revision++;
    boundary.accept(receipt);
    const replacementGeneration = boundary.capture();
    reject(new Error(`Delayed ${operation} failure`));
    await completed;

    assert.equal(ended, false, operation);
    assert.equal(boundary.identity(), B);
    assert.equal(boundary.active(), true);
    boundary.assertCurrent(replacementGeneration);
  }
});

test("a current renewal failure still closes access and invalidates pending admin work", async () => {
  const { account, boundary } = setup();
  const generation = boundary.capture();
  const ownsCompletion = captureStaffSessionCompletion(
    account,
    boundary,
    () => 1,
  );
  await Promise.reject(new Error("Offline")).catch(() => {
    if (ownsCompletion()) boundary.close();
  });
  assert.equal(boundary.active(), false);
  assert.throws(() => boundary.assertCurrent(generation));
});

test("a delayed staff lookup cannot dispatch using the same owner's replacement session", async () => {
  const { account, boundary } = setup();
  let resolve!: (value: {
    data: { session: { access_token: string; user: { id: string } } };
  }) => void;
  const lookup = new Promise<{
    data: { session: { access_token: string; user: { id: string } } };
  }>((done) => (resolve = done));
  let dispatched = 0;
  const request = createStaffFetch({
    getSession: () => lookup,
    fetch: async () => {
      dispatched++;
      return Response.json({ ok: true });
    },
  });
  const pending = request("/api/staff/mcp", { action: "save" }, undefined, {
    scope: account,
    staffSession: boundary,
  });
  boundary.identify(B);
  boundary.accept(receipt);
  resolve({
    data: {
      session: {
        user: { id: OWNER },
        access_token:
          "header." +
          Buffer.from(JSON.stringify({ session_id: B })).toString("base64url") +
          ".fixture",
      },
    },
  });
  await assert.rejects(pending, StaffSessionExpiredError);
  assert.equal(dispatched, 0);
  assert.equal(boundary.active(), true);
});

test("completion guards reject a reopened session and account A-to-B-to-A transitions", () => {
  const { account, boundary } = setup();
  let revision = 1;
  const original = captureStaffSessionCompletion(
    account,
    boundary,
    () => revision,
  );
  revision++;
  boundary.close();
  boundary.accept(receipt);
  assert.equal(original(), false, "new verification cannot inherit old work");

  const reopened = captureStaffSessionCompletion(
    account,
    boundary,
    () => revision,
  );
  account.changeOwner("10000000-0000-4000-8000-000000000002");
  account.changeOwner(OWNER);
  assert.equal(
    reopened(),
    false,
    "returning to the owner cannot inherit old work",
  );

  const current = captureStaffSessionCompletion(
    account,
    boundary,
    () => revision,
  );
  assert.equal(current(), true, "unchanged token refresh retains the session");
  boundary.identify(B);
  assert.equal(
    current(),
    false,
    "session identity independently guards completions",
  );
});
