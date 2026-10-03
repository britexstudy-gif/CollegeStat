import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signInHref } from '../lib/auth-navigation';
import { isStaffPath, STAFF_PATH } from '../lib/staff-route';
import { normalizeUniversity, type RankingEntry } from '../lib/domain';
import { universityRanks, rankLabel } from '../lib/ranking-highlights';
import { globalCatalogue } from '../server/global-catalogue';
import { entitySchemas } from '../services/admin-schema';

test('authentication preserves a research query while refusing external redirects', () => {
  const route='/compare?ids=first,second&category=admissions';
  const p=new URL(signInHref(route),'https://collegestat.test').searchParams;
  assert.equal(p.get('next'),route);
  assert.equal(p.get('returnTo'),route);
  for(const bad of ['https://evil.test','//evil.test','/\\evil.test','/auth/sign-in']) {
    const q=new URL(signInHref(bad),'https://collegestat.test').searchParams;
    assert.equal(q.get('next'),'/profile');
  }
  assert.ok(isStaffPath(STAFF_PATH+'/requirements'));
  assert.ok(!isStaffPath(STAFF_PATH+'-public'));
  assert.ok(!isStaffPath('/admin'));
});
test('hosted profile resources retain programs and research independently of relational evidence', () => {
  const source=globalCatalogue.find(u=>u.slug==='mit')!;
  const u=normalizeUniversity({id:source.id,profile_resources:{reported_programs:source.reported_programs,research_identity:source.research_identity},requirements:source.requirements});
  assert.deepEqual(u.reported_programs,source.reported_programs);
  assert.deepEqual(u.research_identity,source.research_identity);
  assert.deepEqual(u.requirements,source.requirements);
});
test('current verified database rankings supersede the snapshot without turning a band into an exact position', () => {
  const u=globalCatalogue.find(u=>u.slug==='mit')!;
  const entry: RankingEntry={id:'live',university_id:u.id,edition_id:'edition',year:2028,source_id:'source',source_url:'https://www.topuniversities.com/example',verification_status:'verified',verified_at:'2026-10-03T00:00:00Z',notes:null,rank:null,rank_label:'101–150',score:null,ranking_editions:{id:'edition',provider_id:'provider',year:2028,subject:'Overall',region:'Global',permitted:true,ranking_providers:{id:'provider',name:'QS',slug:'qs',website:'https://www.topuniversities.com',license_status:'permitted',methodology:null}}};
  const ranked=universityRanks({...u,ranking_entries:[entry]}).find(r=>r.provider==='qs')!;
  assert.equal(ranked.year,2028);
  assert.equal(rankLabel(ranked),'101–150');
  assert.equal(universityRanks({...u,ranking_entries:[{...entry,verification_status:'needs_review'}]}).find(r=>r.provider==='qs')!.year,2027);
});
test('admin accepts attributed local logos and preserves conditional requirement status', () => {
  const base={name:'University',slug:'university',country_code:'GB',website:'http://example.edu',logo_url:'/logos/hku.svg'};
  assert.ok(entitySchemas.universities.safeParse(base).success);
  assert.ok(!entitySchemas.universities.safeParse({...base,logo_url:'/logos/../private.png'}).success);
  const u=globalCatalogue.find(u=>u.name==='University of Toronto')!;
  const conditional=u.requirements.find(r=>r.required==null)!;
  assert.equal(entitySchemas.requirements.parse(conditional).required,null);
});
