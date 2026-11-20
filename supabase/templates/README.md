# Email templates

One template is sent to every user, so each carries English first and a short Russian and Uzbek line under it. They use no images and no hosted files: tables, inline styles, a dark-mode media query, 600 px maximum width.

Paste each file into **Supabase Dashboard → Authentication → Email Templates** (select the project, then the template tab), set the subject, and save.

| Dashboard tab | File | Subject |
|---|---|---|
| Magic Link | `magic_link.html` | Your CollegeStat sign-in code |
| Confirm sign up | `confirmation.html` | Confirm your CollegeStat account |
| Change Email Address | `email_change.html` | Confirm your new CollegeStat email |
| Reset Password | `recovery.html` | Reset your CollegeStat password |

Notes

- The code flow needs `{{ .Token }}` in the **Magic Link** template. The default template only has a link, so students would never see a code until this one is pasted. The app's "Email me a sign-in code" button calls `signInWithOtp`, and Supabase sends the Magic Link template for existing users and the Confirm sign up template for brand-new users, so paste both.
- The one-click button uses `{{ .ConfirmationURL }}`. The app uses PKCE, so the button only works in the browser that asked for the code. Opened in a mail app's built-in browser it fails, which is why the code is the main path and the page tells people to use it.
- Templates say 15 minutes; OTP expiry is set to 900 s and change the text in all four files if you change it. The app's code screen carries the same line (`au.code.hint`).
- Email change: with "Secure email change" on (default), Supabase sends a code to both the old and the new address. Both need to be entered in turn. The app does not yet have a screen for this; the template is ready for it.
- Authentication → Rate Limits: the built-in mailer is limited to a few emails an hour per project. Supabase's own sender is for testing only.
- Custom SMTP (Resend) comes later, with a domain: Authentication → Emails → SMTP Settings. Templates stay the same; only the sender changes. Verify SPF and DKIM before launch so codes do not land in spam.
- Preview locally by replacing `{{ .Token }}` with `482917` and the other variables with sample values.
