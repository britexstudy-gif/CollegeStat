# Social sign-in setup

The sign-in screen includes Google, Apple, and Telegram. The buttons start a real Supabase OAuth flow only after the corresponding provider is configured. Until then they show a clear setup message.

1. Connect the app to Supabase using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Enable Google and Apple in the Supabase Auth dashboard, configure each provider's client ID, secret, and callback URL, then set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` and `NEXT_PUBLIC_AUTH_APPLE_ENABLED=true`.
3. For Telegram, create a bot and register allowed origins and redirect URLs with BotFather. In Supabase Auth, create an OIDC custom provider with identifier `custom:telegram`, issuer `https://oauth.telegram.org`, scopes `openid` and `profile`, and optional email enabled. Set `NEXT_PUBLIC_AUTH_TELEGRAM_ENABLED=true` after it is active.
4. Add this application's `/auth/callback` URL to Supabase's allowed redirect URLs for every deployed origin.

Keep provider secrets in the provider dashboards or server-side configuration, never in `NEXT_PUBLIC_` variables.

Reference: [Supabase custom OAuth/OIDC providers](https://supabase.com/docs/guides/auth/custom-oauth-providers), [Telegram Login](https://core.telegram.org/bots/telegram-login).
