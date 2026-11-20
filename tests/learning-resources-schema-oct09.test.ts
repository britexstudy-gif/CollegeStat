import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const SOURCE = "11111111-1111-4111-8111-111111111111";
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STUDENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Fixture = {
  id: string;
  slug: string;
  title: string;
  provider: string;
  kind: string;
  subject: string;
  url: string;
  summary: string;
  access: string;
  country_code: string | null;
  population: string;
  publication_year: number | null;
  retrieved_at: string;
  verified_at: string | null;
  verification_state: string;
  reuse_mode: string;
  steps: unknown;
  evidence: unknown;
  source_id: string;
  published: boolean;
};

test("learning resource migration preserves history and enforces link-only publication with staff access", async (t) => {
  const db = new PGlite();
  let sequence = 0;
  const fixture = (patch: Partial<Fixture> = {}): Fixture => {
    sequence++;
    return {
      id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
      slug: `resource-${sequence}`,
      title: "Official study resource",
      provider: "Official provider",
      kind: "practice",
      subject: "SAT",
      url: "https://example.edu/official-practice",
      summary:
        "An authored description and link to the official practice tool.",
      access: "Free",
      country_code: null,
      population: "Students preparing for the named assessment",
      publication_year: null,
      retrieved_at: "2026-10-09T14:30:00Z",
      verified_at: "2026-10-09T14:35:00Z",
      verification_state: "verified",
      reuse_mode: "link_metadata_only",
      steps: [],
      evidence: {
        content_imported: false,
        source_url: "https://example.edu/official-practice",
      },
      source_id: SOURCE,
      published: false,
      ...patch,
    };
  };
  const insert = (row: Fixture) =>
    db.query(
      `insert into public.learning_resources
    (id,slug,title,provider,kind,subject,url,summary,access,country_code,population,
     publication_year,retrieved_at,verified_at,verification_state,reuse_mode,steps,evidence,source_id,published)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19,$20)
    returning id,slug`,
      [
        row.id,
        row.slug,
        row.title,
        row.provider,
        row.kind,
        row.subject,
        row.url,
        row.summary,
        row.access,
        row.country_code,
        row.population,
        row.publication_year,
        row.retrieved_at,
        row.verified_at,
        row.verification_state,
        row.reuse_mode,
        JSON.stringify(row.steps),
        JSON.stringify(row.evidence),
        row.source_id,
        row.published,
      ],
    );
  const as = async (role: "anon" | "authenticated", owner = "") => {
    await db.exec(`reset role; set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
  };
  const code = (expected: string) => (error: unknown) => {
    assert.equal((error as { code: string }).code, expected);
    return true;
  };

  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      grant usage on schema public to anon,authenticated;
      create table public.data_sources(id uuid primary key,name text not null);
      create function public.is_admin() returns boolean language sql stable as $$
        select coalesce(current_setting('request.jwt.claim.sub',true) = '${ADMIN}',false)
      $$;
      create function public.audit_content() returns trigger language plpgsql as $$
        begin return null; end
      $$;
    `);
    await db.query("insert into public.data_sources(id,name) values($1,$2)", [
      SOURCE,
      "Existing checked source",
    ]);
    const before = (await db.query("select * from public.data_sources")).rows;
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261009180028_learning_resources.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(
      (await db.query("select * from public.data_sources")).rows,
      before,
    );
    assert.equal(
      (
        await db.query<{ enabled: boolean }>(
          "select relrowsecurity enabled from pg_class where oid='public.learning_resources'::regclass",
        )
      ).rows[0].enabled,
      true,
    );

    await t.test(
      "anonymous readers see only verified published resource links",
      async () => {
        const visible = fixture({
          slug: "visibility-visible",
          published: true,
        });
        const unchecked = fixture({
          slug: "visibility-unchecked",
          published: true,
          verification_state: "needs_review",
          verified_at: null,
        });
        const unpublished = fixture({
          slug: "visibility-unpublished",
          published: false,
        });
        const rejected = fixture({
          slug: "visibility-rejected",
          published: true,
          verification_state: "rejected",
          verified_at: null,
        });
        for (const row of [visible, unchecked, unpublished, rejected])
          await insert(row);
        await as("anon");
        assert.deepEqual(
          (
            await db.query<{ slug: string }>(
              "select slug from public.learning_resources where slug like 'visibility-%' order by slug",
            )
          ).rows.map((row) => row.slug),
          [visible.slug],
        );
        await assert.rejects(insert(fixture()), code("42501"));
        await assert.rejects(
          db.query(
            "update public.learning_resources set title='Anonymous edit' where id=$1",
            [visible.id],
          ),
          code("42501"),
        );
        await assert.rejects(
          db.query("delete from public.learning_resources where id=$1", [
            visible.id,
          ]),
          code("42501"),
        );
        await db.exec("reset role");
      },
    );

    await t.test(
      "ordinary students cannot view unpublished evidence or mutate even a public resource",
      async () => {
        await as("authenticated", STUDENT);
        assert.deepEqual(
          (
            await db.query<{ slug: string }>(
              "select slug from public.learning_resources where slug like 'visibility-%' order by slug",
            )
          ).rows.map((row) => row.slug),
          ["visibility-visible"],
        );
        await assert.rejects(insert(fixture()), code("42501"));
        assert.equal(
          (
            await db.query(
              "update public.learning_resources set title='Student edit' where slug='visibility-visible' returning id",
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "delete from public.learning_resources where slug='visibility-visible' returning id",
            )
          ).rows.length,
          0,
        );
        await db.exec("reset role");
        assert.equal(
          (
            await db.query<{ title: string }>(
              "select title from public.learning_resources where slug='visibility-visible'",
            )
          ).rows[0].title,
          "Official study resource",
        );
      },
    );

    await t.test(
      "staff can read private review records and maintain resource metadata",
      async () => {
        await as("authenticated", ADMIN);
        assert.equal(
          (
            await db.query(
              "select id from public.learning_resources where slug like 'visibility-%'",
            )
          ).rows.length,
          4,
        );
        const row = fixture({
          slug: "staff-maintenance",
          verification_state: "needs_review",
          verified_at: null,
        });
        await insert(row);
        assert.equal(
          (
            await db.query(
              "update public.learning_resources set title='Checked by staff' where id=$1 returning id",
              [row.id],
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await db.query(
              "delete from public.learning_resources where id=$1 returning id",
              [row.id],
            )
          ).rows.length,
          1,
        );
        await db.exec("reset role");
      },
    );

    await t.test(
      "verified resources require a verification timestamp",
      async () => {
        await assert.rejects(
          insert(fixture({ verified_at: null })),
          code("23514"),
        );
        await insert(
          fixture({ verification_state: "needs_review", verified_at: null }),
        );
      },
    );

    for (const [label, evidence] of [
      ["missing", {}],
      ["JSON null", { content_imported: null }],
      ["true", { content_imported: true }],
      ["string false", { content_imported: "false" }],
    ] as const) {
      await t.test(
        `content_imported ${label} cannot satisfy the link-only evidence requirement`,
        async () => {
          await assert.rejects(insert(fixture({ evidence })), code("23514"));
        },
      );
    }

    await t.test(
      "resource constraints reject unsafe links, invalid metadata and oversized JSON",
      async () => {
        for (const patch of [
          { slug: "Invalid Slug" },
          { title: "" },
          { title: "x".repeat(201) },
          { provider: "" },
          { kind: "question_bank_import" },
          { subject: "" },
          { url: "javascript:alert(1)" },
          { url: "http://example.edu/practice" },
          { summary: "" },
          { summary: "x".repeat(1501) },
          { country_code: "USA" },
          { publication_year: 1899 },
          { publication_year: 2101 },
          { verification_state: "unknown" },
          { reuse_mode: "copied_questions" },
          { steps: {} },
          { steps: ["x".repeat(8001)] },
          { evidence: [] },
          { evidence: { content_imported: false, notes: "x".repeat(16001) } },
        ] satisfies Array<Partial<Fixture>>) {
          await assert.rejects(insert(fixture(patch)), code("23514"));
        }
        await assert.rejects(
          insert(fixture({ retrieved_at: "not a date" })),
          code("22007"),
        );
        await assert.rejects(
          insert(
            fixture({ source_id: "99999999-9999-4999-8999-999999999999" }),
          ),
          code("23503"),
        );
      },
    );

    await t.test(
      "new resource versions preserve distinct historical observations and reject duplicate versions",
      async () => {
        const old = fixture({
          slug: "history-preserved",
          retrieved_at: "2025-10-09T14:30:00Z",
          publication_year: 2024,
          published: true,
        });
        const latest = fixture({
          slug: old.slug,
          retrieved_at: "2026-10-09T14:30:00Z",
          publication_year: null,
          published: true,
        });
        await insert(old);
        await insert(latest);
        await assert.rejects(
          insert(
            fixture({ slug: latest.slug, retrieved_at: latest.retrieved_at }),
          ),
          code("23505"),
        );
        await as("anon");
        const history = (
          await db.query<{ id: string; publication_year: number | null }>(
            "select id,publication_year from public.learning_resources where slug=$1 order by retrieved_at",
            [old.slug],
          )
        ).rows;
        assert.deepEqual(history, [
          { id: old.id, publication_year: 2024 },
          { id: latest.id, publication_year: null },
        ]);
        await db.exec("reset role");
      },
    );
  } finally {
    await db.close();
  }
});
