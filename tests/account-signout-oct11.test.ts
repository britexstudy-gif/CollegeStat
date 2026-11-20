import test from "node:test";
import assert from "node:assert/strict";
import { AccountScope } from "../lib/account-owner";
import { ownsSignOutResult, runAccountSignOut } from "../lib/account-signout";

function account() {
  const scope = new AccountScope();
  scope.changeOwner("account-a");
  return scope;
}
function deferred<T>() {
  let resolve!: (result: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("a stale sign-out callback cannot dispatch after A to B to A", async () => {
  const scope = account();
  const stale = scope.capture();
  scope.changeOwner("account-b");
  scope.changeOwner("account-a");
  let dispatched = 0;
  assert.equal(
    await runAccountSignOut(scope, stale, async () => {
      dispatched++;
      return { error: null };
    }),
    false,
  );
  assert.equal(dispatched, 0);
});

test("a logout is confirmed for its initiating account or the direct signed-out event", async () => {
  const scope = account();
  const token = scope.capture();
  assert.equal(
    await runAccountSignOut(scope, token, async () => ({ error: null })),
    true,
  );
  assert.equal(
    await runAccountSignOut(scope, token, async () => {
      scope.changeOwner(null);
      return { error: null };
    }),
    true,
  );
  assert.equal(ownsSignOutResult(scope, token), true);
});

test("a delayed logout completion cannot claim a replacement account's result", async () => {
  const scope = account();
  const token = scope.capture();
  const reply = deferred<{ error: Error | null }>();
  const pending = runAccountSignOut(scope, token, () => reply.promise);
  scope.changeOwner("account-b");
  reply.resolve({ error: null });
  assert.equal(await pending, false);
  assert.equal(scope.capture().owner, "account-b");
});

test("a delayed SDK signed-out event after a replacement account is never confirmed as A's logout", async () => {
  const scope = account();
  const token = scope.capture();
  const reply = deferred<{ error: Error | null }>();
  const pending = runAccountSignOut(scope, token, () => reply.promise);
  scope.changeOwner("account-b");
  // This models the documented SDK limit; the app cannot undo SDK session removal.
  scope.changeOwner(null);
  reply.resolve({ error: null });
  assert.equal(await pending, false);
  assert.equal(ownsSignOutResult(scope, token), false);
});

test("current-account SDK failure remains an error, while a stale failure is silent", async () => {
  const scope = account();
  const error = new Error("synthetic logout unavailable");
  await assert.rejects(
    runAccountSignOut(scope, scope.capture(), async () => ({ error })),
    error,
  );
  const reply = deferred<{ error: Error | null }>();
  const pending = runAccountSignOut(
    scope,
    scope.capture(),
    () => reply.promise,
  );
  scope.changeOwner("account-b");
  reply.reject(error);
  assert.equal(await pending, false);
});

test("an SDK error after the direct signed-out event is not reported as confirmed revocation", async () => {
  const scope = account();
  const error = new Error("synthetic remote revocation failed");
  await assert.rejects(
    runAccountSignOut(scope, scope.capture(), async () => {
      scope.changeOwner(null);
      return { error };
    }),
    error,
  );
});

test("anonymous callers and unconfirmed SDK receipts do not report successful sign-out", async () => {
  let dispatched = 0;
  const anonymous = new AccountScope();
  assert.equal(
    await runAccountSignOut(anonymous, anonymous.capture(), async () => {
      dispatched++;
      return { error: null };
    }),
    false,
  );
  assert.equal(dispatched, 0);
  const scope = account();
  await assert.rejects(
    runAccountSignOut(scope, scope.capture(), async () => undefined as never),
    /could not be confirmed/,
  );
});
