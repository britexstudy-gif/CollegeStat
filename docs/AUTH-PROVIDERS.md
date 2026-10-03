# Production account providers

Google, Apple and Telegram buttons share Supabase's session, callback and protected workspace. No preview account is created. The current repository has no Supabase credentials; an owner must connect a Supabase project and provider accounts before these flows can be verified end to end.

1. Supply the public Supabase URL and anon key through the environment variables in `.env.example`. Configure the public site origin and `/auth/callback` redirect in Supabase Auth.
2. Enable Google and Apple in Supabase Auth Providers using the respective account credentials. Register the callback URL shown by Supabase with each provider. Apple requires a Services ID and signing key configuration.
3. For Telegram, create a bot in BotFather, select OpenID Connect Login and register the Supabase callback URL. Create an OIDC provider in Supabase with identifier `custom:telegram`, issuer `https://oauth.telegram.org`, scopes `openid` and `profile`, and `email_optional: true`. Supply BotFather's Client ID and Client Secret only to Supabase. Do not request the phone or messaging permission for ordinary sign-in.
4. Set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED`, `NEXT_PUBLIC_AUTH_APPLE_ENABLED`, and `NEXT_PUBLIC_AUTH_TELEGRAM_ENABLED` to `true` after configuring each provider. The buttons show an availability error until configured.
5. Verify a new registration, returning login, cancellation, logout, safe redirect, and access to the same private saved-list/dashboard. Telegram accounts can have no email; identify users by Supabase UUID.

References checked September 26, 2026:
- https://supabase.com/docs/guides/auth/custom-oauth-providers
- https://supabase.com/docs/guides/self-hosting/self-hosted-custom-oauth-providers
- https://core.telegram.org/bots/telegram-login
