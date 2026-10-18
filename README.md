# Job Application Tracker

A dark-first job search workspace. This milestone is the application foundation: a responsive shell, placeholder sections, and email/password authentication with Supabase.

Business features such as company records, applications, networking, tasks, preparation, and CSV/XLSX import are not implemented yet.

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
   - Site URL for local work: `http://localhost:3000`
   - Add redirect URLs:
     - `http://localhost:3000/**`
     - `https://YOUR_PRODUCTION_DOMAIN/**`
   - Also allow these exact paths if your project does not accept wildcards:
     - `http://localhost:3000/auth/confirm`
     - `http://localhost:3000/reset-password`
     - `http://localhost:3000/dashboard`
     - `https://YOUR_PRODUCTION_DOMAIN/auth/confirm`
     - `https://YOUR_PRODUCTION_DOMAIN/reset-password`
     - `https://YOUR_PRODUCTION_DOMAIN/dashboard`
5. On Vercel, set the same three environment variables. Set `NEXT_PUBLIC_SITE_URL` to the canonical production origin, for example `https://YOUR_PRODUCTION_DOMAIN`. Also set the Supabase Site URL to that origin when you are testing production emails. You can keep both localhost and production URLs in the redirect allow list at the same time.

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

`{{ .SiteURL }}` must be the app origin (`http://localhost:3000` or your production domain), not the Supabase project URL.

Recovery links are not consumed when the email is opened. `/auth/confirm` stores the recovery token in a short-lived HTTP-only cookie and redirects to `/reset-password` without the token in the address. The form verifies that cookie on submit, so a mail scanner that only prefetches the link does not invalidate it, and a normal signed-in session cannot use this page.

The default Supabase mailer is rate limited (about two messages per hour). Configure custom SMTP before you rely on this in production.

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

Protected feature pages are placeholders.

## Data model

No business tables are created in this milestone. The intended multi-user model and row-level security rules are in [docs/data-model.md](docs/data-model.md). SQL migrations belong in `supabase/migrations/` and should be applied later, when those tables are actually created.

## Deploying to Vercel

1. Import the Git repository.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL`.
3. Add the production origin to the Supabase redirect allow list and, when sending production mail, set it as the Site URL.
4. Deploy. The app uses the Next.js App Router and does not require a service-role key for this milestone.
