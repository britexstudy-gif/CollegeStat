# Account providers

The hosted project `yfyqikmanpgnvyfthzwe` has email/password sign-in enabled. Google and Apple are disabled as checked on 3 October 2026. The app fetches provider availability from `/api/auth/providers`; public build flags cannot enable an unconfigured provider.

## Configuration

1. Set the Supabase public URL and publishable key using `.env.example`. Add each deployed application's `/auth/callback` to Auth's allowed redirect URLs. Use the public site origin for Auth's Site URL.
2. Configure Google and Apple in Supabase Auth Providers with the owner’s provider credentials. Register the Supabase callback URL shown in the dashboard with each provider. Apple requires its Services ID and signing-key configuration; follow its credential renewal requirements.
3. For Telegram, configure OpenID Connect Login in BotFather and register the Supabase callback. Create a Supabase OIDC provider with identifier `custom:telegram`, issuer `https://oauth.telegram.org`, scopes `openid profile`, and `email_optional: true`. Supply BotFather's Client ID/Secret to Supabase. The discovery URL is `https://oauth.telegram.org/.well-known/openid-configuration`. Ordinary sign-in does not need phone or messaging permissions.
4. The public Auth settings expose built-in providers only. To attest to Telegram availability, give the server a secret/service-role key through an ignored server environment (`SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`). The endpoint returns booleans only; it never returns custom provider credentials. Without server attestation, Telegram stays disabled.
5. Test new registration, returning login, cancellation, logout, password reset, safe return routes and private workspace access. Telegram accounts may lack email; identify them by Supabase user UUID.

Provider credentials stay in the provider dashboards or server environment. Never place them in `NEXT_PUBLIC_` variables, source files or project notes. Supabase RLS and role checks protect saved data and the staff console regardless of the sign-in provider.

## Official references

- [Supabase Google Auth](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase Apple Auth](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Supabase custom OAuth/OIDC providers](https://supabase.com/docs/guides/auth/custom-oauth-providers)
- [Telegram OpenID Connect login](https://core.telegram.org/bots/telegram-login)
