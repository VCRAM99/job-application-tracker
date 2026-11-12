# Launch runbook (Job Tracker 2.0 beta)

These are the exact steps to turn on the V2 features in production: first for a closed beta, then for everyone (`BETA_USER_IDS=*`, step 4). Gemini only, and users bring their own key (BYOK). Do them in order, and run each step's check before moving on. Every step can be undone by unsetting the flag it adds (see [Rollback](#rollback)).

**What merging the M6c PR does on its own:**

- Supabase applies one migration, `20261104120000_job_source_status.sql`. It adds a read-only, HMAC-gated function for `jobs status`, and caps the resumes bucket at 30 files per user: the upload policy is recreated with the same rule plus the cap, counted by a small owner-only function. No table, column, or data changes.
- Nothing else changes in production. AI features stay off (`AI_FEATURES_ENABLED` unset), and V2 stays closed to anyone not on `BETA_USER_IDS`.
- Recommended Jobs keeps working for the user already on `JOB_RECOMMENDATIONS_ALLOWED_USER_IDS`.

**Conventions:**

- **Setting a variable:** use Vercel → Project → Settings → Environment Variables → Production, then redeploy (Deployments → ⋯ → Redeploy) so the variable takes effect.
- **Running SQL:** use the Supabase dashboard → SQL Editor of the production project.
- **Secrets:** generate them on your own machine and paste them straight into Vercel or the SQL editor. Never commit them or paste them into chat.

## 0. Before you start

1. Merge the M6c PR. Wait for the Supabase integration to report that the migration applied and for the Vercel production deployment to finish.
2. **Check.** Open the live site signed in as your account. V1 pages work, and Jobs works for the allowlisted user. Nothing else in the nav has changed.
3. Find your own user id. In Supabase, go to Authentication → Users, then your row → User UID. Copy the UUID; you need it below.

## 1. Supabase Auth settings (dashboard)

These are recommended settings in the hosted dashboard. The repository does not change them.

| Where | Setting | Value |
|---|---|---|
| Authentication → Sign In / Providers → Email | Confirm email | On (already required by the app) |
| | Secure password change | On |
| | Minimum password length | 8, with letters and digits required (the app checks the same) |
| | Leaked password protection (if your plan offers it) | On |
| Authentication → Rate Limits | Emails sent per hour | Keep the default (custom SMTP raises it) |
| | Sign-ups and sign-ins per 5 minutes per IP | 30 |
| | Token refreshes per 5 minutes per IP | 150 |
| | Token verifications per 5 minutes per IP | 30 |
| Authentication → Sessions | Refresh token rotation, reuse interval | On, 10 seconds |
| Authentication → URL Configuration | Site URL and Redirect URLs | As in [setup.md](setup.md) |
| Authentication → Attack Protection | CAPTCHA | **Leave off until step 7.** Turning it on before the site key is live blocks every sign-in. |

**Check:** sign out and sign in again. A new test sign-up still gets the confirmation email.

## 2. Generate the AI secrets

Run these on your machine. Each prints a new random value, so keep the terminal private.

```bash
openssl rand -base64 32
```

Run it twice:

- the first value is **`AI_CREDENTIALS_KEY`**, which encrypts saved provider keys (AES-256-GCM);
- the second value is **`AI_ACCOUNTING_SECRET`**, which signs AI usage reservations (HMAC).

Treat both as passwords. Losing `AI_CREDENTIALS_KEY` makes saved provider keys unreadable; users would have to save their key again.

## 3. Store the accounting secret in the database

In the SQL Editor, paste your `AI_ACCOUNTING_SECRET` in place of the placeholder:

```sql
update public.ai_accounting_gate set secret = '<AI_ACCOUNTING_SECRET>' where id = 1;
```

**Check:**

```sql
select id, secret is not null as configured, char_length(secret) between 32 and 200 as valid_length from public.ai_accounting_gate;
```

It should return `1 | true | true`. Do not `select secret`.

## 4. Vercel environment variables

Add these for **Production**. Leave everything not listed unset.

| Name | Value | Notes |
|---|---|---|
| `BETA_USER_IDS` | Closed beta: your UUID, comma-separated with other beta users' UUIDs. **Public launch: `*`** | Gates every V2 feature, including Jobs. `*` on its own means every signed-in user (never a signed-out request). Unset means nobody on Vercel. One malformed entry closes V2 to everyone; `*` mixed with UUIDs counts as malformed. With `*`, a set `JOB_RECOMMENDATIONS_ALLOWED_USER_IDS` only narrows Jobs to its listed users, so unset it to open Jobs to everyone. |
| `AI_FEATURES_ENABLED` | `true` | Career AI (profile extraction, settings). Needed by every AI feature. |
| `AI_CREDENTIALS_KEY` | Value from step 2 | Server-only. Never use a `NEXT_PUBLIC_` name. |
| `AI_CREDENTIALS_KEY_VERSION` | `1` | |
| `AI_ACCOUNTING_SECRET` | Value from step 2 | Must match step 3 exactly. |
| `AI_PROVIDERS_ENABLED` | `google` | Gemini only. This is also the default on Vercel; setting it makes the choice explicit. |
| `JOB_ANALYSIS_ENABLED` | `true` | Fit analysis. |
| `RESUME_STUDIO_ENABLED` | `true` | Resume Studio. Tailoring also needs fit analysis. |
| `CAREER_COACH_ENABLED` | `true` | Interview prep, research, drafts, follow-ups. |
| `JOB_RECOMMENDATIONS_ENABLED` | `true` (already set) | Keep `JOB_RECOMMENDATIONS_ALLOWED_USER_IDS` as is; BETA users get Jobs too. |

Leave the existing jobs variables as they are: `JOB_INGESTION_ENABLED`, `JOB_REFRESH_ENABLED`, `JOB_SCHEDULER_SECRET`, `JOB_CATALOG_WRITE_SECRET`, `JOB_EMAIL_DELIVERY_ENABLED` and `JOB_EMAIL_FROM`.

Also set **`NEXT_PUBLIC_CONTACT_EMAIL`** to the address that receives privacy and account-deletion requests. `/privacy` and `/terms` show it, and the address is inlined at build time, so redeploy after setting it. Without it, those pages say no contact address has been published.

**Do not set:** `AI_MANAGED_ENABLED`, `AI_MANAGED_MONTHLY_*`, `AI_PLATFORM_*_API_KEY`, `JOB_ANALYSIS_MOCK_PROVIDER`, or `PERF_TIMING`.

- **Managed AI** stays unreachable while the managed variables are unset: no picker offers it, and the server refuses it.
- **The mock provider** never runs on Vercel anyway.
- **`JOB_ANALYSIS_*_MODEL`** are optional operator overrides. Leave them unset; each user's model choice in Settings applies, and the default is `gemini-3.5-flash-lite`.

You can set the flags one at a time if you prefer: `AI_FEATURES_ENABLED` first, then `JOB_ANALYSIS_ENABLED`, then `RESUME_STUDIO_ENABLED`, then `CAREER_COACH_ENABLED`, redeploying and checking after each.

Redeploy.

**Checks:**

1. **As your beta user:**
   - The nav shows Jobs, Fit, Resumes, and Career.
   - Settings → AI offers only Google Gemini and "Bring your own key", and shows the Gemini free-tier note.
   - "Managed" appears nowhere.
2. **Save a paid Gemini key.** It shows as Unverified. The app never calls it "connected".
3. **Fit analysis:** paste a job description (200+ characters) and analyze. You get requirements with quotes and the visible qualification disclaimer.
4. **Resume Studio:** upload a PDF or DOCX, parse it, tailor it to the analysis, accept an edit, and download the PDF and DOCX.
5. **Coach:** from the analysis, generate questions; from an application, draft a message. It shows "AI draft" and "Not sent", and nothing is sent.
6. **As a non-beta account** (a second test account), while the list holds UUIDs: only V1 appears in the nav. Typing `/analyze`, `/resumes`, `/career`, or `/jobs` shows the off state, not the feature.
7. **Public launch** (`BETA_USER_IDS=*`):
   - Do step 7 (CAPTCHA) first, and set `NEXT_PUBLIC_CONTACT_EMAIL` (below). Sign-ups are open to anyone.
   - Then set `*`, unset `JOB_RECOMMENDATIONS_ALLOWED_USER_IDS` if Jobs should be open too, and redeploy.
   - Check that a brand-new test account sees Jobs, Fit, Resumes, and Career, and that `/privacy` and `/terms` load while signed out.
8. **Rate limit:** more than 6 AI runs in a minute shows "You have reached the AI request limit for now."

## 5. Sentry (optional, recommended)

1. At sentry.io, create a project with platform **Next.js** in your organization. Copy its **DSN** (Project Settings → Client Keys).
2. Optional, for readable stack traces: create an **auth token** with `project:releases` and `org:read` scopes (Settings → Auth Tokens). Note your org slug and project slug.
3. In the Sentry project → Settings → Security & Privacy:
   - turn on **Data Scrubber** and **Use Default Scrubbers**;
   - add `email`, `password`, `token`, `key`, and `authorization` to **Additional Sensitive Fields**;
   - turn **Store Native Crash Reports** off.
   This is a second layer behind the app's own scrubbing.
4. Add the Vercel variables:

| Name | Value |
|---|---|
| `SENTRY_DSN` | The DSN from step 1. It is copied into the browser bundle at build, which is safe for a DSN. |
| `SENTRY_AUTH_TOKEN` | The token from step 2. Build-time only; source maps upload and are then deleted from the deployment. Optional. |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Slugs from step 2. Needed only with the token. |

5. Redeploy.

**Checks:**

- `https://<your-domain>/monitoring` is the tunnel. A GET returns 405. A POST forwards only envelopes for your own DSN (same host, project, and key) of at most 256 KB; anything else gets 403, 413, or 400.
- The browser console shows no CSP errors.
- Trigger a harmless error (for example an AI run with a revoked key); a Sentry issue appears with tags such as `code` and `provider`, and no request body, cookies, email, or key.

Without `SENTRY_DSN`, nothing from Sentry is loaded or sent.

## 6. Jobs operator: confirm the scheduler

From your machine, using the jobs CLI's production target (it asks for the project ref and reads only what it needs from `.env.local`):

```bash
npx tsx --conditions=react-server scripts/jobs/cli.ts status --target production
```

**Check:** each approved source shows its recent runs (time, status, fetched count, error code). After the next 11:00 UTC cron, a new `succeeded` run appears.

For any live source still at `--refresh-limit 1`, consider re-approving with `--refresh-limit 2`. Vercel Hobby cron fires at a jittered minute inside its hour, so two daily runs can land under 24 hours apart, and a limit of 1 (counted over a rolling 24 hours) would skip one. See [jobs.md](jobs.md).

## 7. CAPTCHA (Cloudflare Turnstile)

Sign-up, sign-in, and the password-reset request show a Turnstile check when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set. The app forwards the token to Supabase Auth; **Supabase decides whether a token is required.** Do the steps in this order: if Supabase CAPTCHA is turned on before the deployed forms send tokens, nobody can sign in.

1. Cloudflare dashboard → Turnstile → **Add widget**.
   - Name it "Job Tracker".
   - Add your production hostname, and Vercel preview domains if you want the check on previews.
   - Widget mode: **Managed**. Copy the **site key** and the **secret key**.
2. Vercel: set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the site key. The key is inlined at build time, so **redeploy**.
3. **Check:**
   - `/login`, `/signup`, and `/forgot-password` each show the check, and sign-in still works (Supabase is not enforcing yet).
   - The response's `Content-Security-Policy` header lists `https://challenges.cloudflare.com` in `script-src` and `frame-src`.
   - The browser console shows no CSP errors.
4. Supabase dashboard → Authentication → Attack Protection → **Enable CAPTCHA protection**. Choose provider **Turnstile** and paste the **secret key**. Save.
5. **Check:**
   - Sign in, sign up with a test address, and request a reset: all three work.
   - With the Turnstile script blocked (for example an ad blocker on `challenges.cloudflare.com`), sign-in fails with "The security check did not pass."

**Rollback:** turn CAPTCHA off in Supabase **first**, then unset `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and redeploy.

## 8. Account deletion requests

There is no self-service "Delete account" button: deleting a Supabase Auth user needs either a service-role key, which the app never holds, or a new database function, which means a migration. Until that exists, handle requests from the address in `NEXT_PUBLIC_CONTACT_EMAIL` as follows:

1. Confirm the request comes from the account's email address.
2. Supabase → Storage → `resumes` → delete the folder named after the user's id. Uploaded files are not linked to the user row, so this is the one manual step.
3. Supabase → Authentication → Users → the user → **Delete user**. Every table that holds the user's rows (43 of them) references `auth.users` with `on delete cascade`, so all of their records go with the account. `src/lib/account/export.test.ts` checks this against the migrations.
4. **Check:** in the SQL Editor, `select count(*) from public.applications where user_id = '<id>';` returns 0.

Users can download everything first from Settings → Your data → **Download my data (JSON)**.

## Rollback

Each switch is independent. Unset the variable (or set it to `false`) and redeploy.

| To turn off | Unset |
|---|---|
| Every V2 feature for everyone | `BETA_USER_IDS` (closed when unset on Vercel), or set it to a single malformed value such as `none` |
| V2 for the public, back to a closed beta | Replace `*` in `BETA_USER_IDS` with the beta users' UUIDs |
| All AI features | `AI_FEATURES_ENABLED`. Fit analysis, Resume Studio, the coach, and career AI all depend on it. |
| One AI feature | `JOB_ANALYSIS_ENABLED`, `RESUME_STUDIO_ENABLED`, or `CAREER_COACH_ENABLED` |
| Recommended Jobs | `JOB_RECOMMENDATIONS_ENABLED` |
| AI accounting (stops every AI call at once) | Run `update public.ai_accounting_gate set secret = null where id = 1;` |
| Sentry | `SENTRY_DSN` (and redeploy) |
| CAPTCHA | Supabase Attack Protection → CAPTCHA off **first**, then `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (and redeploy) |

Turning a flag off hides the feature and refuses its actions; saved data stays private and returns when the flag is turned back on. The migration needs no rollback: `job_source_status` is a read-only function, and the upload cap only refuses a user's 31st stored file. To lift the cap, recreate the "insert own resume files" policy without the `resume_file_count()` condition, using the original definition in `20261102120000_resume_studio.sql`.
