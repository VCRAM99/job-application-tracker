# Job Application Tracker

A dark-first job search workspace with email/password authentication, companies, applications, networking, tasks, preparation, a dashboard, and CSV/XLSX import plus CSV export.

## Requirements

- Node.js 24 (developed on v24.10.0)
- npm 11 (developed on 11.6.2)
- A Supabase project with email/password auth

## Local setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` from the Supabase dashboard, then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run build` | Production build |
| `npm start` | Serve the production build |

## Environment variables

| Name | Where it is used |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server. Project URL from the Supabase Connect dialog. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server. Publishable key (`sb_publishable_...`). The legacy `anon` key also works in this variable. |
| `NEXT_PUBLIC_SITE_URL` | Public site origin used in auth email redirects. Use `http://localhost:3000` locally and your production origin on Vercel. |

Do not create a `NEXT_PUBLIC_` variable for the secret key. This milestone does not use the Supabase secret or service-role key. If you copy one for a later server-only task, name it `SUPABASE_SECRET_KEY`, keep it off the client, and never prefix it with `NEXT_PUBLIC_`. The app refuses to start the Supabase client if a secret key is placed in the publishable key variable.

## Supabase project

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open **Connect** (or **Project Settings → API**) and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
     If the dashboard still shows only the legacy anon key, paste that anon key into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Do not paste the service-role or secret key.
3. Open **Authentication → Sign In / Providers → Email**.
   - Enable the Email provider.
   - Turn **Confirm email** on. Registration in this app expects a verification email before sign-in.
   - Set the minimum password length to **8** so it matches the form rules (a letter and a number are also required by the app).
   - Leave Google and other social providers disabled.
4. Open **Authentication → URL Configuration**.
   - Site URL for production mail: `https://jobtracker.varunsr.com`
   - Keep localhost in the redirect allow list for local work.
   - Add redirect URLs:
     - `http://localhost:3000/**`
     - `https://jobtracker.varunsr.com/**`
   - Also allow these exact paths if the project does not accept wildcards:
     - `http://localhost:3000/auth/confirm`
     - `http://localhost:3000/reset-password`
     - `http://localhost:3000/dashboard`
     - `https://jobtracker.varunsr.com/auth/confirm`
     - `https://jobtracker.varunsr.com/reset-password`
     - `https://jobtracker.varunsr.com/dashboard`
5. On Vercel, set the same three environment variables. Production `NEXT_PUBLIC_SITE_URL` must be exactly `https://jobtracker.varunsr.com`. Local `.env.local` keeps `http://localhost:3000`. The app rejects any other origin when `VERCEL_ENV` is `production`. Keep both localhost and production URLs in the Supabase redirect allow list.

### Email templates

The app confirms email and recovery links at `/auth/confirm` using `token_hash`. That works when the link is opened in a different browser than the one that requested it. Update the templates under **Authentication → Emails**.

**Confirm signup** — set the action link to:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard">Confirm your email</a>
```

**Reset password** — set the action link to:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Reset your password</a>
```

`{{ .SiteURL }}` must be the app origin (`http://localhost:3000` locally, `https://jobtracker.varunsr.com` in production), not the Supabase project URL. Those links match `/auth/confirm`: `type=signup` is verified immediately, and `type=recovery` is stored and not verified until the reset form is submitted.

Recovery links are not consumed when the email is opened. `/auth/confirm` stores the recovery token in a short-lived HTTP-only cookie and redirects to `/reset-password` without the token in the address. The form verifies that cookie on submit, so a mail scanner that only prefetches the link does not invalidate it, and a normal signed-in session cannot use this page.

### Custom SMTP with Resend

The hosted Supabase mailer is rate limited (about two messages per hour). Production mail should use Resend. Do not put the Resend API key in this repository or in a `NEXT_PUBLIC_` variable.

1. Create a Resend account at [resend.com](https://resend.com).
2. In Resend, open **Domains** and add `varunsr.com`.
3. Resend shows the DNS records for that domain. Add those records at the DNS host for `varunsr.com` exactly as Resend displays them. They normally include a domain-verification TXT record, DKIM records, and an SPF TXT record. Do not invent the values. Wait until Resend marks the domain verified. Verifying the root domain covers `jobtracker.varunsr.com`.
4. In Resend, create an API key that can send from `varunsr.com`. Store it in a password manager. It is the SMTP password.
5. In Supabase, open **Authentication → Emails → SMTP Settings** and enable custom SMTP:
   - Sender email: `noreply@varunsr.com`
   - Sender name: `Job Tracker`
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the Resend API key
6. Set the Supabase Site URL to `https://jobtracker.varunsr.com` when testing production mail. Leave the localhost redirect URLs in the allow list.
7. Raise the Supabase email rate limit above the built-in cap after SMTP is enabled.
8. Test with a real inbox you control. Sign up with a new address and confirm the message links to `https://jobtracker.varunsr.com/auth/confirm?token_hash=...&type=signup&next=/dashboard`. Then use **Forgot password** and confirm the link uses `type=recovery` and `next=/reset-password`. This repository has not verified delivery to a real inbox.

### What the auth flows do

- **Sign up** creates the user and asks them to confirm their email. If Supabase reports an existing account, the form says so. If email confirmation is turned off in the dashboard, Supabase returns a session and the app sends the user to the dashboard.
- **Sign in** rejects invalid credentials and unverified addresses with a specific message.
- **Forgot password** always shows the same success message when Supabase accepts the request, so the form does not reveal whether the email is registered. Rate-limit errors are shown.
- **Reset password** at `/reset-password` accepts only a recovery `token_hash` with `type=recovery`. A normal signed-in session cannot set a password on that page. Missing or expired links show an error and a way to request a new email. Signed-in password changes are on **Settings** and require the current password.
- **Sign out** clears the Supabase session cookie.
- Sessions stay in HTTP-only cookies. `src/proxy.ts` refreshes them and redirects unauthenticated visitors away from protected routes. Protected layouts also call `getClaims()` on the server. Hiding a link is not treated as authorization.

## Routes

Public: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/confirm`.

Protected: `/dashboard`, `/companies`, `/applications`, `/networking`, `/tasks`, `/preparation`, `/settings`.

`/companies`, `/applications`, `/networking`, `/tasks`, `/preparation`, and `/dashboard` use the signed-in user's records. `/settings` holds the account.

## Data model

`companies` and `applications` are defined in [supabase/migrations/20261018204000_companies_and_applications.sql](supabase/migrations/20261018204000_companies_and_applications.sql). Contacts, tasks, and preparation items are defined in [supabase/migrations/20261019160000_networking_tasks_preparation.sql](supabase/migrations/20261019160000_networking_tasks_preparation.sql). Column rules, metric definitions, and row-level security are described in [docs/data-model.md](docs/data-model.md).

Migrations are not applied by deploying the Next.js app. Apply them to the existing hosted project from this repository. This does not reset or delete the database.

1. Install nothing globally. From the repository root, the Supabase CLI runs through npx.
2. Sign in: `npx supabase login`
3. Link this repo to the existing project: `npx supabase link --project-ref dccbxmloaptulwjisitq`
   When prompted, enter the database password from **Project Settings → Database** in the Supabase dashboard. Do not create a new project.
4. Apply pending migrations: `npx supabase db push`
5. Do not run `supabase db reset`, `supabase db push --db-url` against an unknown URL, or any command that drops schemas.

`db push` only runs migration files that are not already recorded. If it asks for confirmation, read the listed migration name. The hosted project should already include `20261018204000_companies_and_applications.sql`, `20261019160000_networking_tasks_preparation.sql`, and `20261019204500_import_companies_and_applications.sql`. A dry run that says the remote database is up to date is the expected result. Stop if it proposes to drop tables or reset the database.

Preview the pending SQL before applying it:

```bash
npx supabase db push --dry-run
```

Then apply it:

```bash
npx supabase db push
```

## Deploying to Vercel

1. Import the Git repository and set the production domain to `https://jobtracker.varunsr.com`.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL`. The site URL must be `https://jobtracker.varunsr.com`. Do not set a service-role or secret key.
3. Add that origin to the Supabase redirect allow list. Use it as the Site URL when sending production mail.
4. Deploy. Vercel serves the custom domain over HTTPS and sends HSTS. The app also sends `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, and a production content security policy.

## CSV and XLSX

Companies and applications use the official templates from **Import / export**. Header names must match exactly. Dates are `YYYY-MM-DD`. Accepted values and duplicate rules are in [docs/data-model.md](docs/data-model.md). Exports are CSV only and prefix a cell that starts with `=`, `+`, `-`, or `@` so a spreadsheet does not treat it as a formula.

## Security

- Email confirmation is required before private pages or data are available. An unverified password sign-in is signed out.
- Password recovery uses an HTTP-only cookie. The reset token is not left in the address after `/auth/confirm`, and it is not written to application logs.
- Redirects accept only same-site paths.
- Every user-owned table has row level security on `auth.uid() = user_id`. Composite foreign keys block cross-user company and application links. Import functions are `security invoker` and are executable only by `authenticated`.
- The app does not use the Supabase service role. A secret key in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` prevents the client from starting.
- Deleting a company also deletes its applications. The confirmation dialog shows how many. Other deletes ask for confirmation and report a failure instead of pretending the row was removed.

## Known limitations

- Custom SMTP is not configured by this repository. Signup and recovery mail still depend on the Supabase mailer until the Resend steps above are completed and tested from a real inbox.
- `npm audit` reports high findings in `braces` / `fast-glob` through ESLint and the shadcn CLI, and a moderate `uuid` finding through ExcelJS. The suggested fixes are major downgrades (`shadcn@1.0.0`, `exceljs@3.4.0`) and were not applied. The glob issue is build tooling, not a request handler. ExcelJS calls `uuid` v4 for conditional-formatting ids, which this app does not write; the advisory covers v3, v5, and v6 when a caller supplies a buffer. A hostile spreadsheet can still make ExcelJS use memory while parsing, up to the 1 MB upload limit.
- A value that starts with `=`, `+`, `-`, or `@` gains a leading apostrophe on CSV export.
- If two of your companies share a normalized name, an imported application attaches to the oldest.
- This release does not add a database migration.
