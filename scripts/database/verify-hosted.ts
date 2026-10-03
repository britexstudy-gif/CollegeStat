/** Checks the installed project with anonymous and administrator JWTs.
 * A single temporary note is removed in finally. Credentials are never logged.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const credentials=JSON.parse(await readFile('outputs/review-account.json','utf8'));
const client=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const anon=client(),admin=client();
const login=await admin.auth.signInWithPassword({email:credentials.email,password:credentials.password});
assert.ok(!login.error && login.data.user?.id===credentials.userId,'Administrator authentication');
let noteId:string|undefined;
try {
  const plan=JSON.parse(await readFile('outputs/catalogue-import-result.json','utf8'));
  for(const [table,expected] of Object.entries(plan.counts)) {
    const {error,count}=await admin.from(table).select('id',{head:true,count:'exact'});
    assert.ok(!error,table);
    assert.equal(count,expected,table+' complete import');
  }
  const profile=await admin.from('profiles').select('role').eq('id',credentials.userId).single();
  assert.equal(profile.data?.role,'admin');
  const mit=await anon.from('universities').select('id,profile_resources').eq('slug','mit').single();
  assert.ok(mit.data?.profile_resources.reported_programs.length>0);
  assert.ok(mit.data?.profile_resources.research_identity);
  const anonymousProfiles=await anon.from('profiles').select('id');
  assert.equal(anonymousProfiles.data?.length || 0,0,'Anonymous profiles are private');
  const note=await admin.from('user_notes').insert({user_id:credentials.userId,university_id:mit.data.id,body:'Temporary hosted ownership check'}).select('id').single();
  assert.ok(!note.error && note.data);
  noteId=note.data.id;
  const hidden=await anon.from('user_notes').select('id').eq('id',noteId);
  assert.equal(hidden.data?.length || 0,0,'Anonymous note is private');
  const denied=await anon.from('universities').insert({name:'Forbidden check',slug:'forbidden-check',country_code:'US'});
  assert.equal(denied.error?.code,'42501','Anonymous writes denied');
  const seeded=await admin.from('comparison_lists').select('university_ids').eq('user_id',credentials.userId);
  assert.equal(seeded.data?.[0]?.university_ids.length,3);
  const request=await fetch('http://127.0.0.1:5173/api/admin',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+login.data.session!.access_token},body:JSON.stringify({action:'save',entity:'universities',record:{name:''}})});
  assert.equal(request.status,403,'A password-only staff session cannot write through the admin API');
  console.log('PASS hosted counts, real administrator login, profile data, private note isolation, anonymous write denial, seeded comparison, admin API MFA enforcement');
} finally {
  if(noteId) { const removed=await admin.from('user_notes').delete().eq('id',noteId); assert.ok(!removed.error,'Temporary note cleanup'); }
  await admin.auth.signOut();
}
