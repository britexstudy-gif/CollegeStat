import test from "node:test";
import assert from "node:assert/strict";
import {
  AccountScope,
  changeAccountOwner,
  emptyAccount,
  visibleAccount,
} from "../lib/account-owner";

const privateAccount = () => ({
  ...emptyAccount<{ id: string; role: string }>("A"),
  loaded: true,
  profile: { id: "A", role: "admin" },
  saved: ["A-university"],
  savedScholarships: ["A-award"],
  compare: ["A-comparison"],
});

test("a new identity cannot see an old account before its fetch completes or after it fails", () => {
  const accountA = privateAccount();
  const masked = visibleAccount(accountA, "B");
  assert.equal(masked.profile, null);
  assert.deepEqual(masked.saved, []);
  assert.deepEqual(masked.savedScholarships, []);
  assert.deepEqual(masked.compare, []);
  assert.equal(masked.loaded, false);
  const waitingForB = changeAccountOwner(accountA, "B");
  // A failed B fetch leaves this empty owned state in place.
  assert.deepEqual(visibleAccount(waitingForB, "B"), masked);
  assert.deepEqual(visibleAccount(accountA, null), emptyAccount(null));
  assert.deepEqual(changeAccountOwner(accountA, null), emptyAccount(null));
});

test("anonymous comparisons carry into first sign-in, but owned selections never cross accounts", () => {
  const anonymous = { ...emptyAccount(), compare: ["local-university"] };
  const accountA = changeAccountOwner(anonymous, "A");
  assert.deepEqual(accountA.compare, ["local-university"]);
  assert.deepEqual(changeAccountOwner(accountA, "B").compare, []);
  assert.deepEqual(changeAccountOwner(accountA, null).compare, []);
  assert.equal(changeAccountOwner(accountA, "A"), accountA);
});

test("auth transitions invalidate account fetches and mutation callbacks synchronously", () => {
  const scope = new AccountScope();
  scope.changeOwner("A");
  const fetchA = scope.capture();
  const saveA = scope.capture();
  scope.changeOwner("B");
  assert.equal(scope.isCurrent(fetchA), false);
  assert.equal(scope.isCurrent(saveA), false);
  assert.equal(scope.isOwner("A"), false);
  assert.equal(scope.isOwner("B"), true);
  const fetchB = scope.capture();
  scope.changeOwner(null);
  assert.equal(scope.isCurrent(fetchB), false);
  scope.changeOwner("A");
  assert.equal(
    scope.isCurrent(fetchA),
    false,
    "returning to A must not revive its old requests",
  );
});

test("same-user token refresh retains private state and pending operations", () => {
  const scope = new AccountScope();
  scope.changeOwner("A");
  const pending = scope.capture();
  const account = privateAccount();
  assert.equal(scope.changeOwner("A"), false);
  assert.equal(scope.isCurrent(pending), true);
  assert.equal(visibleAccount(account, "A"), account);
  assert.equal(changeAccountOwner(account, "A"), account);
});
