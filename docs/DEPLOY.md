# Deploying CollegeStat

Production runs as one Cloudflare Worker with static assets, reading the public catalogue and accounts from a production Supabase project. Hosted builds (`NEXT_PUBLIC_CATALOGUE_SOURCE=supabase`) leave the bundled JSON snapshots out of the Worker, so the upload is about 1.5 MB gzipped. A bundled-mode build is about 23 MB and is for local previews only.

## One-time setup

### Supabase (production project)

1. Create a separate production project. Do not reuse the development project.
2. Apply `supabase/migrations/` in filename order, then run `npm run supabase:bundle` and apply the generated imports as described in the README.
3. Import the catalogue with `node --import tsx scripts/database/hosted-catalogue.ts --check`, then `--apply`, and confirm with `node --import tsx scripts/database/verify-hosted.ts`.
4. Decide on `supabase/proposals/admin-mfa-enforcement.sql` and apply it if approved.
5. Under **Authentication**:
   - Set the Site URL and redirect allowlist to the production domain, including `/auth/callback`.
   - Configure custom SMTP so verification and recovery emails come from your domain.
   - Turn on leaked-password protection and review the Auth rate limits.
6. Turn on daily backups and point-in-time recovery, then run one restore drill.

### Cloudflare

1. Create an API token with the **Edit Cloudflare Workers** template.
2. Run a first deploy locally (see below) and attach the production domain to the `collegestat` Worker.
3. Set server-only secrets on the Worker. Each command prompts for its value:

   ```sh
   npx wrangler secret put SUPABASE_URL --name collegestat
   npx wrangler secret put SUPABASE_SECRET_KEY --name collegestat
   npx wrangler secret put OPENAI_API_KEY --name collegestat   # optional
   npx wrangler secret put OPENAI_MODEL --name collegestat     # optional
   ```

4. Add a rate-limiting rule for `/api/*`. The research fallback's own throttle is per isolate only.

### GitHub

In **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | Token from Cloudflare step 1 |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| Variable | `NEXT_PUBLIC_SITE_URL` | `https://` production origin. Without it the site is marked noindex. |
| Variable | `NEXT_PUBLIC_SUPABASE_URL` | Production project URL |
| Variable | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production publishable key |
| Variable | `NEXT_PUBLIC_MAP_STYLE_URL` | Licensed map tile style; the default demo tiles are not for production |
| Variable | `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED`, `NEXT_PUBLIC_AUTH_APPLE_ENABLED` | `true` only after the provider is configured in Supabase |
| Variable | `NEXT_PUBLIC_SUPPORT_URL` | Optional donation link |
| Variable | `DEPLOY_ENABLED` | `true` to turn on automatic deploys |

Create a `production` environment in **Settings → Environments** if you want deploys to wait for approval.

## Deploying

When `DEPLOY_ENABLED=true`, `.github/workflows/deploy.yml` deploys `main` after **Check CollegeStat** passes. It can also be run by hand from the Actions tab.

To deploy manually:

```sh
NEXT_PUBLIC_CATALOGUE_SOURCE=supabase NEXT_PUBLIC_SITE_URL=https://example.com \
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... npm run build
npx wrangler deploy --config dist/server/wrangler.json
```

Roll back with `npx wrangler rollback --name collegestat`.

## Before announcing the launch

On the production domain, test sign-up and email verification, password recovery, saving and the dashboard, account deletion, the staff console with MFA, and logo uploads to storage. These have not yet been exercised against a hosted project. Replace the placeholder Terms and Privacy pages, and add error monitoring and an uptime check.
