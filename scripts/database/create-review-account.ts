/** Creates a real hosted account only with a server secret and an installed schema. No simulated auth. */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
for (const file of ['.env.local', '.dev.vars']) if (existsSync(file)) process.loadEnvFile(file);
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const create = process.argv.includes('--create');
const email = process.env.REVIEW_ACCOUNT_EMAIL || 'admin.review@collegestat.test';
if (!url || !secret || secret.startsWith('sb_publishable_')) {
  console.error('Not connected: put a server-only secret in ignored .dev.vars. A publishable key cannot create an admin account. Install the SQL bundles using Supabase SQL Editor or a database connection first.');
  process.exit(1);
}
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) throw new Error('Expected the hosted Supabase project URL.');
const db = createClient(url, secret, { auth:{ autoRefreshToken:false, persistSession:false } });
const ids = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const schema = await db.from('profiles').select('id').limit(1);
const catalogue = await db.from('universities').select('id').in('id', ids);
if (schema.error || catalogue.error || catalogue.data?.length !== ids.length) {
  console.error('Setup incomplete: install 01-schema.sql and 02-directory-identities.sql before creating the review account. No account created.'); process.exit(1);
}
if (!create) { console.log('Administrative connection and catalogue are ready. Run with --create to provision a new review account.'); process.exit(0); }
await mkdir('outputs', { recursive:true });
if (existsSync('outputs/review-account.json')) throw new Error('Existing review credentials must be reviewed before creating another account. No account created.');
const password = randomBytes(24).toString('base64url');
const result = await db.auth.admin.createUser({ email, password, email_confirm:true, user_metadata:{ full_name:'CollegeStat Review' } });
if (result.error || !result.data.user) { console.error('Account could not be created. An existing account is never overwritten.'); process.exit(1); }
const userId = result.data.user.id;
// Store credentials before provisioning, so a failed setup remains recoverable without revealing the password.
await writeFile('outputs/review-account.json', JSON.stringify({ email, password, userId, project:url, createdAt:new Date().toISOString() }, null, 2) + '\n', { flag:'wx', mode:0o600 });
const setup = await Promise.all([
  db.from('profiles').update({ role:'admin', display_name:'CollegeStat Review' }).eq('id', userId).select('id,role').single(),
  db.from('saved_universities').insert(ids.map(university_id => ({ user_id:userId, university_id, status:'Researching' }))),
  db.from('comparison_lists').insert({ user_id:userId, name:'My comparison', university_ids:ids }),
  db.from('user_checklist').insert(['Review your programme requirements','Compare costs for your student category','Confirm the official application dates'].map(title => ({ user_id:userId, title, done:false }))),
]);
if (setup.some(r => r.error) || setup[0].data?.role !== 'admin') { console.error('Account exists, but setup is incomplete. Credentials are in ignored outputs/review-account.json. Review database grants before using it.'); process.exit(1); }
console.log('Real administrator review account created with a shortlist, comparison and checklist. Private credentials: outputs/review-account.json (mode 600).');
