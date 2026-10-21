# Setup

Operational notes for running Job Tracker locally or in production. The public overview is in the [README](../README.md).

## Environment variables

| Name | Where it is used |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server. Project URL from the Supabase Connect dialog. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server. Publishable key (`sb_publishable_...`). The legacy anon key also works in this variable. |
| `NEXT_PUBLIC_SITE_URL` | Public site origin used in auth email redirects. Use `http://localhost:3000` locally and `https://jobtracker.varunsr.com` on Vercel. |

Do not create a `NEXT_PUBLIC_` variable for the secret key. The app does not use the Supabase secret or service-role key. If a secret key is placed in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, the client refuses to start.

Career AI uses additional server-only variables. They are listed in `.env.example` and explained in [ai.md](ai.md). Leave them unset in production until you intend to enable the feature. Do not put provider keys in `NEXT_PUBLIC_` variables.

## Supabase project

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open **Connect** (or **Project Settings → API**) and copy the project URL and publishable key into `.env.local`. If the dashboard shows only the legacy anon key, paste that into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Do not paste the service-role or secret key.
3. Open **Authentication → Sign In / Providers → Email**.
   - Enable the Email provider.
   - Turn **Confirm email** on.
   - Set the minimum password length to 8. The app also requires a letter and a number.
   - Leave social providers disabled.
4. Open **Authentication → URL Configuration**.
   - Site URL for production mail: `https://jobtracker.varunsr.com`
   - Redirect URLs: `http://localhost:3000/**` and `https://jobtracker.varunsr.com/**`
   - If the project does not accept wildcards, also allow `/auth/confirm`, `/reset-password`, and `/dashboard` on both origins.
5. On Vercel, set the same three variables. Production `NEXT_PUBLIC_SITE_URL` must be exactly `https://jobtracker.varunsr.com`. The app rejects any other origin when `VERCEL_ENV` is `production`.

## Email templates

Confirmation and recovery links open `/auth/confirm` with `token_hash`, so they work in a different browser from the one that requested the email. Update the templates under **Authentication → Emails**.

Confirm signup:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard">Confirm your email</a>
```

Reset password:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Reset your password</a>
```

`{{ .SiteURL }}` must be the app origin, not the Supabase project URL. `type=signup` is verified immediately. `type=recovery` is stored and verified when the reset form is submitted. `/auth/confirm` keeps the recovery token in a short-lived HTTP-only cookie and redirects to `/reset-password` without the token in the address. A normal signed-in session cannot set a password on that page. Signed-in password changes are on Settings and require the current password.

## Custom SMTP with Resend

The hosted Supabase mailer is rate limited. Production mail can use Resend. Do not commit the Resend API key or put it in a `NEXT_PUBLIC_` variable.

1. Create a Resend account and verify the sending domain. Copy the DNS records Resend shows. Do not invent those values.
2. Create an API key that can send from that domain. It is the SMTP password.
3. In Supabase, open **Authentication → Emails → SMTP Settings**:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the Resend API key
4. Set the Supabase Site URL to `https://jobtracker.varunsr.com` when testing production mail, and keep the localhost redirect URLs.
5. Send a real signup and a password reset to an inbox you control. This repository has not recorded a successful delivery test.

## Database migrations

Migrations live in `supabase/migrations` and are described in [supabase/migrations/README.md](../supabase/migrations/README.md). Applying them does not reset the database. Do not run `supabase db reset`.

```bash
npx supabase login
npx supabase link --project-ref dccbxmloaptulwjisitq
npx supabase db push --dry-run
npx supabase db push
```

`db push` runs only migration files that are not already recorded. Stop if the dry run proposes to drop tables. Until `20261019220000_daily_tasks_and_health.sql` is applied, Daily Tasks shows an unavailable message and the rest of the app still loads.

`20261021043000_career_knowledge_and_ai.sql` adds the career profile and AI accounting tables. It does not change existing tables. The app still runs if that file has not been applied. Do not push it to production until you have reviewed [ai.md](ai.md) and chosen to enable the feature.

## Deploying to Vercel

Import the Git repository and set the production domain to `https://jobtracker.varunsr.com`. Set the three public environment variables. Do not set a service-role key. Add that origin to the Supabase redirect allow list.

## Known limitations

- Signup and recovery mail depend on the Supabase mailer until custom SMTP is configured and tested from a real inbox.
- `npm audit` reports findings in `braces` / `fast-glob` through ESLint and the shadcn CLI, and a `uuid` finding through ExcelJS. The suggested fixes are major downgrades and were not applied.
- CSV export prefixes a cell that starts with `=`, `+`, `-`, or `@` so a spreadsheet does not treat it as a formula.
- If two companies share a normalized name, an imported application attaches to the oldest.
