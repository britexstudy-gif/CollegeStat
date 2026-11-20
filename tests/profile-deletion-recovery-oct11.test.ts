import test from "node:test";
import assert from "node:assert/strict";
import { AccountScope } from "../lib/account-owner";
import {
  createProfileAccountService,
  ProfileAccountChangedError,
} from "../services/profile-account";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
function scopeFor() {
  const scope = new AccountScope();
  scope.changeOwner(A);
  return scope;
}
function serviceFor(response: () => Promise<Response>, timeoutMs = 1000) {
  return createProfileAccountService({
    url: "https://profile.example.test",
    key: "public-test-key",
    timeoutMs,
    session: async () => ({ owner: A, token: "frozen-A-token" }),
    fetch: async (_input, init) => {
      assert.equal(init?.method, "DELETE");
      assert.equal(String(_input), "/api/account");
      return response();
    },
  });
}

test("failed account deletion preserves the server's sign-in recovery guidance after revocation", async () => {
  const message =
    "Your account could not be deleted. Sign in again before retrying.";
  const service = serviceFor(async () =>
    Response.json({ error: message }, { status: 500 }),
  );
  await assert.rejects(service.remove(scopeFor()), { message });
});

test("deletion rate-limit failures retain the waiting guidance instead of encouraging an immediate retry", async () => {
  const message = "Please wait before retrying account deletion";
  const service = serviceFor(async () =>
    Response.json({ error: message }, { status: 429 }),
  );
  await assert.rejects(service.remove(scopeFor()), { message });
});

test("unknown error bodies cannot expose server internals or claim a failed deletion succeeded", async () => {
  for (const body of [
    { error: "private-service-key-exception", deleted: true },
    { error: { secret: "private-service-key" } },
    null,
  ]) {
    const service = serviceFor(async () =>
      Response.json(body, { status: 500 }),
    );
    await assert.rejects(service.remove(scopeFor()), {
      message:
        "Account deletion could not be completed. Sign in again before retrying.",
    });
  }
});

test("an invalid deletion error body provides safe recovery guidance", async () => {
  const service = serviceFor(
    async () => new Response("not-json", { status: 502 }),
  );
  await assert.rejects(service.remove(scopeFor()), {
    message:
      "Account deletion could not be completed. Sign in again before retrying.",
  });
});

test("failed deletion body parsing shares the operation deadline even when cancellation is ignored", async () => {
  const service = serviceFor(
    async () =>
      ({
        ok: false,
        json: () => new Promise(() => {}),
      }) as unknown as Response,
    5,
  );
  await assert.rejects(service.remove(scopeFor()), /timed out/);
});

test("a changed owner cannot consume delayed deletion recovery messages", async () => {
  let decoding!: () => void;
  const started = new Promise<void>((resolve) => {
    decoding = resolve;
  });
  let decoded!: (value: unknown) => void;
  const body = new Promise<unknown>((resolve) => {
    decoded = resolve;
  });
  const service = serviceFor(
    async () =>
      ({
        ok: false,
        json: () => {
          decoding();
          return body;
        },
      }) as unknown as Response,
  );
  const scope = scopeFor();
  const pending = service.remove(scope);
  await started;
  scope.changeOwner(B);
  scope.changeOwner(A);
  await assert.rejects(pending, ProfileAccountChangedError);
  decoded({
    error: "Your account could not be deleted. Sign in again before retrying.",
  });
});
