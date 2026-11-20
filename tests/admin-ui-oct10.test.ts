import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adminPageForTotal,
  adminRecordRange,
  parseAdminImport,
  recordState,
} from "../components/college/admin-supabase-status";

test("final-page deletions and empty filtered queues return an existing page", () => {
  assert.equal(adminPageForTotal(3, 51), 3);
  assert.equal(adminPageForTotal(3, 50), 2);
  assert.equal(adminPageForTotal(2, 0), 1);
  assert.equal(adminRecordRange(2, 26), "26–26 of 26 records");
  assert.equal(adminRecordRange(9, 50), "26–50 of 50 records");
  assert.equal(adminRecordRange(1, 0), "0 records");
});

test("CSV staging preserves quoted source notes, commas, CRLF and BOM headers", () => {
  assert.deepEqual(
    parseAdminImport(
      '\uFEFFmetric,value,notes\r\nacceptance_rate,10,"First year, domestic"\r\nother,0,"Line 1\nLine 2 says ""quoted"""',
    ),
    [
      { metric: "acceptance_rate", value: "10", notes: "First year, domestic" },
      { metric: "other", value: "0", notes: 'Line 1\nLine 2 says "quoted"' },
    ],
  );
});

test("ambiguous and truncated imports cannot silently overwrite or omit evidence fields", () => {
  for (const value of [
    "metric,value,value\na,1,2",
    "metric,,value\na,b,2",
    "metric,value,notes\na,1",
    "metric,value\na,1,extra",
    'metric,notes\na,"unclosed',
    "metric,value",
    "",
    "[]",
    '{"metric":"a"}',
    "[null]",
    "[[1,2]]",
    "[4]",
  ])
    assert.throws(() => parseAdminImport(value), value);
  assert.throws(
    () => parseAdminImport('[{"notes":"' + "é".repeat(500001) + '"}]'),
    /1 MB/,
  );
});

test("JSON observations keep explicit nulls and false values without coercion", () => {
  assert.deepEqual(
    parseAdminImport('[{"value":0,"required":false,"year":null}]'),
    [{ value: 0, required: false, year: null }],
  );
});

test("failed or pending operations are not presented as verified publication", () => {
  assert.equal(
    recordState({
      id: "fixture",
      status: "failed",
      verification_status: "verified",
    }).tone,
    "failed",
  );
  assert.equal(
    recordState({ id: "fixture", status: "pending", published: true }).label,
    "Pending review",
  );
  assert.equal(
    recordState({ id: "fixture", published: false }).label,
    "Unpublished",
  );
});

import { AccountScope } from "../lib/account-owner";
import {
  AdminLogoChangedError,
  uploadAdminLogo,
} from "../lib/admin-logo-upload";
const ownerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function logoFixture() {
  const scope = new AccountScope();
  scope.changeOwner(ownerA);
  const session = {
    data: {
      session: {
        access_token: "synthetic-owner-a-token",
        user: { id: ownerA },
      },
    },
  };
  const uploads: { path: string; accessToken: string }[] = [];
  let editor = true;
  const context = {
    scope,
    token: scope.capture(),
    isEditorCurrent: () => editor,
  };
  const dependencies = {
    getSession: async () => session,
    upload: async (input: { path: string; accessToken: string }) => {
      uploads.push(input);
      return { error: null };
    },
    publicUrl: (path: string) =>
      "https://example.test/university-logos/" + path,
    randomId: () => "synthetic-random-path",
  };
  return {
    scope,
    session,
    uploads,
    context,
    dependencies,
    replaceEditor: () => {
      editor = false;
    },
  };
}
const png = { type: "image/png", size: 100 };

test("logo uploads pin the initiating owner token and preserve storage errors", async () => {
  const f = logoFixture();
  assert.equal(
    await uploadAdminLogo(png, f.context, f.dependencies),
    "https://example.test/university-logos/synthetic-random-path.png",
  );
  assert.equal(f.uploads[0].accessToken, "synthetic-owner-a-token");
  await assert.rejects(
    uploadAdminLogo(png, f.context, {
      ...f.dependencies,
      upload: async () => ({ error: new Error("storage denial") }),
    }),
    /storage access/,
  );
  await assert.rejects(
    uploadAdminLogo(png, f.context, {
      ...f.dependencies,
      upload: async () => {
        throw new Error("network throw");
      },
    }),
    /network throw/,
  );
});

test("changing accounts during session lookup prevents a logo write", async () => {
  const f = logoFixture(),
    pending = deferred<typeof f.session>();
  const result = uploadAdminLogo(png, f.context, {
    ...f.dependencies,
    getSession: () => pending.promise,
  });
  f.scope.changeOwner(ownerB);
  pending.resolve(f.session);
  await assert.rejects(result, AdminLogoChangedError);
  assert.equal(f.uploads.length, 0);
});

test("A to B to A and a replacement editor cannot inherit a late uploaded logo", async () => {
  for (const change of ["account", "editor"]) {
    const f = logoFixture(),
      pending = deferred<{ error: null }>();
    const began = deferred<void>();
    const result = uploadAdminLogo(png, f.context, {
      ...f.dependencies,
      upload: async (input) => {
        f.uploads.push(input);
        began.resolve();
        return pending.promise;
      },
    });
    await began.promise;
    if (change === "account") {
      f.scope.changeOwner(ownerB);
      f.scope.changeOwner(ownerA);
    } else f.replaceEditor();
    pending.resolve({ error: null });
    await assert.rejects(result, AdminLogoChangedError);
    assert.equal(f.uploads.length, 1);
    assert.equal(f.uploads[0].accessToken, "synthetic-owner-a-token");
  }
});

test("actual session-owner mismatch and invalid files fail before uploading", async () => {
  const f = logoFixture();
  await assert.rejects(
    uploadAdminLogo(png, f.context, {
      ...f.dependencies,
      getSession: async () => ({
        data: {
          session: { access_token: "synthetic-b", user: { id: ownerB } },
        },
      }),
    }),
    AdminLogoChangedError,
  );
  for (const invalid of [
    { type: "image/svg+xml", size: 100 },
    { type: "image/png", size: 5242881 },
  ])
    await assert.rejects(
      uploadAdminLogo(invalid, f.context, f.dependencies),
      /under 5 MB/,
    );
  assert.equal(f.uploads.length, 0);
});
