import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

test("narrow explorer projection preserves public results, medians, sorts and evidence precedence", async () => {
  const db = new PGlite({ extensions: { pg_trgm } });
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub',auth.uid(),'aal',current_setting('request.jwt.claim.aal',true),'role',auth.role()) $$;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text);
      alter table storage.objects enable row level security;
      grant select,insert,update,delete on storage.objects to anon,authenticated;
    `);
    for (const file of (await readdir("supabase/migrations")).sort())
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    for (const file of [
      "seed.sql",
      "seed-evidence.sql",
      "seed-intelligence.sql",
    ])
      await db.exec(await readFile("supabase/" + file, "utf8"));
    await db.exec(`
      update public.universities set university_type=case when country_code='US' then 'Private' else 'Public' end;
      update public.universities set profile_resources=jsonb_build_object(
        'country_name','United States',
        'discovery',jsonb_build_object('admission',12,'international',25,'graduation',88,'aid',50,'tuition',32000),
        'reported_programs',jsonb_build_array(jsonb_build_object('name','Architecture','level','Bachelor')),
        'rankings',jsonb_build_array(jsonb_build_object('provider','qs','year',2027,'rank',12))
      ) where slug='stanford';
      update public.universities set imported_records='[
        {"metric":"acceptance_rate","value":83,"reporting_year":2026,"verification_status":"verified","publication_status":"published"},
        {"metric":"acceptance_rate","value":99,"reporting_year":2027,"verification_status":"pending","publication_status":"published"},
        {"metric":"acceptance_rate","value":97,"reporting_year":2028,"verification_status":"verified","publication_status":"held"}
      ]'::jsonb where slug='stanford';
      insert into public.universities(slug,name,country_code,published) values('hidden-performance-fixture','Hidden performance fixture','US',false);
    `);
    await db.exec(
      await readFile(
        "tests/fixtures/explore-universities-before-20261009.sql",
        "utf8",
      ),
    );
    const cases: Record<string, string | number>[] = [
      {},
      { q: "Technology" },
      { q: "MIT United" },
      { q: "Architecture" },
      { country: "US" },
      { country: "DE" },
      { region: "Europe" },
      { city: "Cambridge" },
      { type: "Public" },
      { type: "Private" },
      { cost_max: 35000 },
      { admission_min: 80, admission_max: 85 },
      { ielts_max: 7 },
      { intl_min: 20 },
      { graduation_min: 80 },
      { aid: "yes" },
      { scholarships: "yes" },
      { field: "Computer Science", degree: "Bachelor", language: "English" },
      { field: "Architecture", degree: "Bachelor" },
      { q: "No result" },
      ...[
        "rank",
        "name",
        "rank_desc",
        "tuition",
        "tuition_desc",
        "admission",
        "admission_desc",
        "international",
        "international_asc",
      ].map((sort) => ({ sort })),
    ];
    const query = async (
      filters: Record<string, string | number>,
      page = 1,
    ) => {
      const result = await db.query<{ result: unknown }>(
        "select public.explore_universities($1::jsonb,$2) result",
        [JSON.stringify(filters), page],
      );
      return result.rows[0].result;
    };
    await db.exec("set role anon");
    const before = await Promise.all(cases.map((filters) => query(filters)));
    const laterPage = await query({}, 2);
    assert.equal((before[0] as { total: number }).total, 6);
    assert.ok(
      (before[11] as { ids: string[] }).ids.includes(
        "11111111-1111-4111-8111-111111111111",
      ),
    );
    await db.exec("reset role");
    await db.exec(
      await readFile(
        "scripts/database/optimize-explorer-projection.sql",
        "utf8",
      ),
    );
    await db.exec("set role anon");
    for (let index = 0; index < cases.length; index++)
      assert.deepEqual(
        await query(cases[index]),
        before[index],
        JSON.stringify(cases[index]),
      );
    assert.deepEqual(await query({}, 2), laterPage);
    await assert.rejects(query({ unknown: "filter" }));
    await assert.rejects(query({ ielts_max: 10 }));
    await assert.rejects(query({}, 10001));
    await assert.rejects(db.query("select * from public.user_notes"));
    await db.exec("reset role");
    const security = await db.query<{ invoker: boolean }>(
      "select not prosecdef invoker from pg_proc where proname='explore_universities'",
    );
    assert.equal(security.rows[0].invoker, true);

    // The home bootstrap keeps the explorer's actual first twelve institutions
    // and exact public counts, without computing unrelated global medians.
    await db.exec(await readFile("scripts/database/home-catalogue-summary.sql", "utf8"));
    await db.exec(`
      insert into public.universities(slug,name,country_code,published,profile_resources)
      select 'featured-fixture-'||n,'Featured fixture '||lpad(n::text,2,'0'),
        case when n%2=0 then 'FR' else 'JP' end,true,
        jsonb_build_object('rankings',jsonb_build_array(
          jsonb_build_object('provider','the','year',2027,'rank',1),
          jsonb_build_object('provider','qs','year',2026,'rank',1),
          jsonb_build_object('provider','qs','year','2027','rank',n/2+1)
        ))
      from generate_series(1,26) n;
      update public.ranking_providers set license_status='permitted' where slug='qs';
      insert into public.ranking_editions(provider_id,year,subject,region,permitted)
      select id,2027,'Overall','Global',true from public.ranking_providers where slug='qs'
      on conflict(provider_id,year,subject,region) do update set permitted=true;
      insert into public.ranking_entries(university_id,edition_id,source_id,verification_status,verified_at,rank)
      select u.id,e.id,'cb248b9f-fe90-573d-adaa-37838de0165a','verified',now(),99
      from public.universities u,public.ranking_editions e,public.ranking_providers p
      where u.slug='featured-fixture-1' and e.provider_id=p.id and p.slug='qs'
        and e.year=2027 and e.subject='Overall' and e.region='Global';
      insert into public.ranking_entries(university_id,edition_id,source_id,verification_status,rank)
      select u.id,e.id,'cb248b9f-fe90-573d-adaa-37838de0165a','needs_review',1
      from public.universities u,public.ranking_editions e,public.ranking_providers p
      where u.slug='featured-fixture-26' and e.provider_id=p.id and p.slug='qs'
        and e.year=2027 and e.subject='Overall' and e.region='Global';
    `);
    const home = async () => (await db.query<{
      result: { ids: string[]; total: number; countries: number }
    }>("select public.home_catalogue_summary() result")).rows[0].result;
    const assertHome = async () => {
      const explorer = await query({}) as { ids: string[]; total: number; countries: number };
      assert.deepEqual(await home(), {
        ids: explorer.ids.slice(0,12),
        total: explorer.total,
        countries: explorer.countries,
      });
    };
    await db.exec("set role anon");
    await assertHome();
    const actualHome = await home();
    assert.equal(actualHome.total,32);
    assert.equal(actualHome.countries,7);
    assert.equal(actualHome.ids.length,12);
    await assert.rejects(db.query("select * from public.user_notes"));
    await assert.rejects(db.query("update public.universities set published=false"));
    await db.exec("reset role");
    const homeSecurity = await db.query<{ invoker: boolean }>(
      "select not prosecdef invoker from pg_proc where proname='home_catalogue_summary'",
    );
    assert.equal(homeSecurity.rows[0].invoker,true);
    // Provider restrictions must make normalized positions fall back exactly as
    // in the explorer; empty published catalogues must also remain truly empty.
    await db.exec("update public.ranking_providers set license_status='restricted' where slug='qs'; set role anon");
    await assertHome();
    await db.exec("reset role; update public.universities set published=false; set role anon");
    await assertHome();
    assert.deepEqual(await home(),{ids:[],total:0,countries:0});
  } finally {
    await db.close();
  }
});
