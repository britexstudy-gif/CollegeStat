import test from "node:test";
import assert from "node:assert/strict";
import { AccountScope } from "../lib/account-owner";
import {
  createAccountExport,
  ExportAccountChangedError,
} from "../services/workspace";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const scopeFor = () => {
  const scope = new AccountScope();
  scope.changeOwner(A);
  return scope;
};
type Deps = Parameters<typeof createAccountExport>[0];
function harness(overrides: Partial<Deps> = {}) {
  const sent: { url: URL; init?: RequestInit }[] = [],
    downloads: unknown[] = [];
  const dispatch =
    overrides.fetch ??
    (async (input) => {
      const url = new URL(String(input));
      return Response.json(
        url.pathname.endsWith("/profiles")
          ? [{ id: A }]
          : url.pathname.endsWith("/writing_draft_versions") &&
              !url.searchParams.get("id")
            ? [
                {
                  id: "11111111-1111-4111-8111-111111111111",
                  user_id: A,
                  body: "My private writing.",
                },
              ]
            : [],
      );
    });
  const exportData = createAccountExport({
    url: "https://export.example.test",
    key: "publishable-key",
    session: async () => ({ owner: A, token: "token-A" }),
    ...overrides,
    fetch: async (input, init) => {
      sent.push({ url: new URL(String(input)), init });
      return dispatch(input, init);
    },
    download: (_name, value) => downloads.push(value),
  });
  return { sent, downloads, exportData };
}
test("account export includes private writing with frozen owner filters and credentials", async () => {
  const h = harness();
  await h.exportData(A, scopeFor());
  assert.equal(h.sent.length, 17);
  const data = h.downloads[0] as Record<string, unknown>;
  assert.deepEqual(data.student_education, []);
  assert.deepEqual(data.student_test_attempts, []);
  assert.equal(h.downloads.length, 1);
  const exported = h.downloads[0] as Record<string, { body: string }[]>;
  assert.equal(exported.writing_draft_versions[0].body, "My private writing.");
  for (const request of h.sent) {
    assert.equal(
      new Headers(request.init?.headers).get("authorization"),
      "Bearer token-A",
    );
    assert.equal(
      request.url.searchParams.get(
        request.url.pathname.endsWith("/profiles") ? "id" : "user_id",
      ),
      "eq." + A,
    );
    assert.ok(request.init?.signal);
  }
});
test("account export dispatch does not bind native browser fetch to the dependencies", async () => {
  let downloaded = false;
  const exportData = createAccountExport({
    url: "https://export.example.test",
    key: "publishable-key",
    session: async () => ({ owner: A, token: "token-A" }),
    fetch: async function (this: unknown) {
      assert.equal(this, undefined);
      return Response.json([]);
    },
    download: () => {
      downloaded = true;
    },
  });
  await exportData(A, scopeFor());
  assert.equal(downloaded, true);
});
test("A to B to A during an export cannot download stale personal data or send later queries", async () => {
  const scope = scopeFor();
  const h = harness({
    fetch: async () => {
      scope.changeOwner(B);
      scope.changeOwner(A);
      return Response.json([{ id: A }]);
    },
  });
  await assert.rejects(h.exportData(A, scope), ExportAccountChangedError);
  assert.equal(h.sent.length, 1);
  assert.equal(h.downloads.length, 0);
});
test("export refuses a different session owner before requesting private tables", async () => {
  const h = harness({ session: async () => ({ owner: B, token: "token-B" }) });
  await assert.rejects(h.exportData(A, scopeFor()), ExportAccountChangedError);
  assert.equal(h.sent.length, 0);
  assert.equal(h.downloads.length, 0);
});
test("unexpected cross-owner export rows cannot be downloaded", async () => {
  const h = harness({ fetch: async () => Response.json([{ id: B }]) });
  await assert.rejects(h.exportData(A, scopeFor()), /unexpected response/);
  assert.equal(h.downloads.length, 0);
});
const rowId = (n: number) =>
  `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
test("writing history follows a shorter server cap to an empty final page", async () => {
  const source = Array.from({ length: 1201 }, (_, i) => ({
    id: rowId(i + 1),
    user_id: A,
  }));
  const h = harness({
    fetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/writing_draft_versions")) {
        const cursor = url.searchParams.get("id")?.slice(3) || "";
        return Response.json(source.filter((r) => r.id > cursor).slice(0, 400));
      }
      return Response.json(
        url.pathname.endsWith("/profiles") ? [{ id: A }] : [],
      );
    },
  });
  await h.exportData(A, scopeFor());
  assert.equal(
    (h.downloads[0] as { writing_draft_versions: unknown[] })
      .writing_draft_versions.length,
    1201,
  );
  assert.equal(
    h.sent.filter((r) => r.url.pathname.endsWith("/writing_draft_versions"))
      .length,
    5,
  );
  assert.ok(h.sent.every((r) => !r.url.searchParams.has("offset")));
});
test("repeated or descending export cursors never download partial records", async () => {
  for (const rows of [
    [
      { id: rowId(1), user_id: A },
      { id: rowId(1), user_id: A },
    ],
    [
      { id: rowId(2), user_id: A },
      { id: rowId(1), user_id: A },
    ],
  ]) {
    const h = harness({
      fetch: async (input) =>
        Response.json(
          new URL(String(input)).pathname.endsWith("/profiles")
            ? [{ id: A }]
            : rows,
        ),
    });
    await assert.rejects(h.exportData(A, scopeFor()), /fully read/);
    assert.equal(h.downloads.length, 0);
  }
});
test("stalled session, fetch and JSON stages have bounded export errors", async () => {
  const never = new Promise<never>(() => {});
  for (const overrides of [
    { session: () => never },
    { fetch: () => never },
    {
      fetch: async () =>
        ({ ok: true, json: () => never }) as unknown as Response,
    },
  ]) {
    const h = harness({ ...overrides, timeoutMs: 10 });
    await assert.rejects(h.exportData(A, scopeFor()), /took too long/);
    assert.equal(h.downloads.length, 0);
  }
});
test("account changes abort export even if lookup ignores cancellation", async () => {
  const scope = scopeFor();
  let resolve!: (value: { owner: string; token: string }) => void;
  const h = harness({
    session: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  const pending = h.exportData(A, scope);
  scope.changeOwner(B);
  scope.changeOwner(A);
  resolve({ owner: A, token: "old" });
  await assert.rejects(pending, ExportAccountChangedError);
  assert.equal(h.sent.length, 0);
});
test("all private qualification fields remain in owner-only exports", async () => {
  const h = harness({
    fetch: async (input) => {
      const url = new URL(String(input));
      const kind = url.pathname.split("/").at(-1);
      return Response.json(
        kind === "profiles"
          ? [{ id: A }]
          : !url.searchParams.has("id") && kind?.startsWith("student_")
            ? [
                {
                  id: rowId(1),
                  user_id: A,
                  score_label: "exact original",
                  scale_label: "original scale",
                },
              ]
            : [],
      );
    },
  });
  await h.exportData(A, scopeFor());
  assert.equal(
    (h.downloads[0] as { student_test_attempts: { score_label: string }[] })
      .student_test_attempts[0].score_label,
    "exact original",
  );
});
