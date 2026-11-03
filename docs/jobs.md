# Recommended jobs

Recommended jobs is a shared catalog plus private preferences. It is separate from Career AI. Turning the jobs page on does not fetch Greenhouse, Lever, or Ashby, send email, or start a schedule.

The migration is `supabase/migrations/20261021120000_recommended_jobs.sql`. It does not rewrite companies or applications. `application_postings` uses the existing `applications (user_id, id)` unique key from `20261019160000_networking_tasks_preparation.sql`.

## Feature flags

All of these are server-only. None belong in a `NEXT_PUBLIC_` variable.

| Variable | Default | What it controls |
| --- | --- | --- |
| `JOB_RECOMMENDATIONS_ENABLED` | On in local development. Off when `NODE_ENV` or `VERCEL_ENV` is `production`. | The `/jobs` and `/jobs/alerts` pages and their form actions. |
| `JOB_RECOMMENDATIONS_ALLOWED_USER_IDS` | Unset, which keeps the behavior above. | Comma-separated user ids. When set, `/jobs`, `/jobs/alerts`, posting detail, their actions, the nav item, and the Add-to-Tracker prefill are available only to those users. Everyone else sees the normal off state. A malformed entry closes the section to everyone. |
| `JOB_INGESTION_ENABLED` | Off until set to `true`. | Permission to call a live source adapter, and the ingestion step of the scheduler. An adapter file is not enough. |
| `JOB_REFRESH_ENABLED` | Off until set to `true`. | The alerts step of the scheduler. |
| `JOB_EMAIL_DELIVERY_ENABLED` and `JOB_EMAIL_FROM` | Off. Both must be set before the email adapter even considers a message. | Still does not send mail. The sender returns `sender_not_approved`. |
| `JOB_CATALOG_WRITE_SECRET` | Unset. Must be 32–200 characters and match `job_catalog_gate.secret`. | HMAC for catalog and alert writes. |
| `CRON_SECRET` | Unset. Must be at least 32 characters. | Bearer token for `/api/jobs/scheduler`. Vercel Cron sends it automatically when it is set on the project. A set but short value is rejected and does not fall back. |
| `JOB_SCHEDULER_SECRET` | Unset. Used only when `CRON_SECRET` is unset, with the same 32 character minimum. | Older name for the scheduler bearer. A missing, empty, or short secret is rejected even when a job flag is on. |

`AI_FEATURES_ENABLED` does not affect jobs. Jobs flags do not enable managed AI.

## Tables and policies

Shared, readable by signed-in users only when the source is `approved`:

- `catalog_employers` — public company name and domain. No private notes, status, or research.
- `job_sources` — provider, board identifier, usage, attribution, retention, allowed fields, refresh limit, approval, and terms.
- `job_postings` — one row per source and source job id.

Users cannot insert, update, or delete those tables. `anon` has no grants.

Private, owned by `auth.uid()`:

- `job_preferences`
- `saved_searches`
- `posting_states` — saved, hidden, and feedback (`already_applied` or `not_interested`)
- `employer_preferences` — `preferred` or `excluded`
- `application_postings` — links one private application to one posting. Deleting the application removes the link. Deleting a posting is restricted while a link exists.
- `job_alert_subscriptions`
- `job_alert_deliveries` — select and update `read_at` only. A trigger rejects every other change. Users cannot insert deliveries.

The runner has no user session, so it reads approved sources through `list_job_ingestion_sources` from `20261028120000_jobs_activation.sql`. That function checks its own HMAC operation name, `list-ingestion-sources`, and rejects a payload whose `now` is more than five minutes from the database clock. It returns activation fields only.

The same migration makes `apply_job_catalog` and `record_job_source_failure` return `{ok: false, reason: "source_not_live"}` without writing anything unless the source is approved, terms permitted, and live ingestion on. `register_job_source` and `approve_job_source` require a payload `now` within five minutes of the database clock, so a captured approval cannot be replayed after a revoke. The CLI adds `now` to each call.

`job_catalog_gate`, `job_source_runs`, and `job_processing_locks` have no policies and no grants for `anon` or `authenticated`.

Catalog and alert writes go through security-definer functions. Each call checks an HMAC of `operation + newline + exact payload` with `extensions.hmac`, the same construction as `createHmac('sha256', secret)` in Node. `assert_job_operation_proof` is revoked from `public`, `anon`, and `authenticated`. The gate secret ships null, so every write fails until an operator sets it in the database and sets the matching server secret. The app does not use the Supabase service-role key.

`search_recommended_jobs` is security invoker. It filters, scores, and paginates in SQL. The page does not load the catalog into the browser and filter it there.

Indexes follow those filters: status and country, arrangement/employment/seniority, posted date, employer, and the user-owned lookup columns.

## Source registry

A source row is a company board on a known ATS, not a worldwide search.

| Provider | Documented read URL | Identifier |
| --- | --- | --- |
| Greenhouse | `https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | Board token |
| Lever | `https://api.lever.co/v0/postings/{site}?mode=json`, or `api.eu.lever.co` when region is `eu` | Site name |
| Ashby | `https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true` | Job board name |

Host allowlist: `boards-api.greenhouse.io`, `api.lever.co`, `api.eu.lever.co`, `api.ashbyhq.com`. Requests use HTTPS, no userinfo, no IP hosts, manual redirects, a 10 second timeout, and a 10,000,000 byte cap. The cap is enforced while the body streams: a larger `Content-Length` is refused before reading, and a body without one is aborted as soon as it passes 10 MB. A dense Greenhouse board with `content=true` is about 11.5 KB per job, so the cap is roughly 850 jobs. Identifiers are `[A-Za-z0-9_-]{1,80}`.

The three adapters normalize fixture payloads in tests. `permitLiveFetch` is required before any HTTP call, and `ingestionAllowed` still has to pass. The ingestion runner in `src/lib/jobs/ingest.ts` is the only caller that sets `permitLiveFetch`, and only for sources that pass `ingestionAllowed`.

Seeded rows `provider:greenhouse`, `provider:lever`, and `provider:ashby` are drafts: terms `unclear`, live ingestion false, refresh limit 0. Signed-in users cannot read drafts.

LinkedIn and Indeed are external search links built from the current filters. Those pages are not indexed. The app does not scrape them, replay a browser session, or claim that Easy Apply is excluded on the external site.

User-assisted import is the existing application form. `source=linkedin` or `source=indeed` only prefills the source name and says the row is not a catalog job.

There is no general-purpose crawler. A future company career site should be added as another approved ATS adapter, or as a source row that points at Greenhouse, Lever, or Ashby.

## Licensing and activation

A public JSON URL is not permission to store or redistribute the listing. Leave `terms_status` as `unclear` and `live_ingestion_enabled` false until the provider terms and the employer's board terms are reviewed.

Live ingestion requires every one of these:

- `JOB_INGESTION_ENABLED=true`
- source approval `approved`
- terms `permitted`
- live ingestion true
- a source identifier
- refresh limit from 1 to 24
- non-empty usage, attribution, retention, and allowed storage fields

`approve_job_source` rejects live ingestion when approval, terms, or the refresh limit are missing. The table constraint rejects the same combination.

### Operator runbook

The CLI is `scripts/jobs/cli.ts`. Run it from the repository root:

```bash
npx tsx --conditions=react-server scripts/jobs/cli.ts <command> [flags]
```

Every database command targets local Supabase. It reads `.env.development.local` and refuses to run unless `NEXT_PUBLIC_SUPABASE_URL` is `http://127.0.0.1:54321`. `--target production` reads `.env.local` instead, prints the project host and the action, and continues only after you type the project ref. The CLI reads the Supabase URL, publishable key, and `JOB_CATALOG_WRITE_SECRET` only from that file, and refuses to run if any of them is exported in the shell. It never prints a secret.

1. Read the provider docs and the employer's terms. Record what may be stored and for how long. Get the board token or site name from the employer, not by guessing.
2. **Preview** the live board. Nothing is written.

   ```bash
   JOB_INGESTION_ENABLED=true npx tsx --conditions=react-server scripts/jobs/cli.ts preview greenhouse <board-token>
   JOB_INGESTION_ENABLED=true npx tsx --conditions=react-server scripts/jobs/cli.ts preview lever <site> --region eu
   ```

   It prints the posting count, the first titles, and tallies of locations, countries, work arrangement, compensation presence, and application method.
3. **Register** the board. This always stores a draft with terms `unclear`, refresh limit 0, and live ingestion off. The slug defaults to `<provider>:<identifier>` in lowercase.

   ```bash
   npx tsx --conditions=react-server scripts/jobs/cli.ts register \
     --provider greenhouse --identifier <board-token> \
     --employer-name "Example Co" --employer-domain example.com \
     --usage "Store normalized public posting fields for signed-in recommendations." \
     --attribution "Name Greenhouse and link the original posting." \
     --retention "Expire listings omitted from a successful full refresh." \
     --fields title,location,country,urls,compensation,plain_text
   ```

4. **Approve** it. Defaults are `--status draft`, `--terms unclear`, `--refresh-limit 0`, and live off, so each change has to be named. For a live source use `--refresh-limit 2`: the limit counts runs in a rolling 24 hours, and Vercel Hobby cron runs once a day at a jittered minute within its hour, so two daily runs can land under 24 hours apart and a limit of 1 would skip the second. `--live` needs `--status approved`, `--terms permitted`, and `--refresh-limit` from 1 to 24. The usage, attribution, retention, and fields flags are required because approval rewrites them.

   ```bash
   npx tsx --conditions=react-server scripts/jobs/cli.ts approve --slug greenhouse:<board-token> \
     --status approved --terms permitted --refresh-limit 2 --live \
     --usage "..." --attribution "..." --retention "..." --fields title,location,country,urls,compensation,plain_text
   ```

   To stop a board, approve it again without `--live`, or with `--status revoked`.
5. **Refresh** once by hand and read the summary.

   ```bash
   JOB_INGESTION_ENABLED=true npx tsx --conditions=react-server scripts/jobs/cli.ts refresh
   ```

   Against local Supabase, `refresh --fixtures` reads `src/lib/jobs/sources/fixtures` instead of the network. `--fixtures` is refused with `--target production`.
6. Check attribution on the job card and that private company notes were not copied into `catalog_employers`.

### Ingestion runner

`runIngestion` lists approved sources, runs `planSourceRefresh` for each one, and calls `apply_job_catalog` or `record_job_source_failure`. The idempotency key is `<slug>:<UTC hour>`, such as `greenhouse:example:2026-10-28T11`, so a second run in the same hour returns `duplicate`. Each source is isolated: a fetch failure or a database error is reported for that source and the run continues.

A failed fetch is recorded and never sends an apply, so it cannot expire listings. Only a complete, non-empty snapshot of at most 2,000 postings is sent with `completeSnapshot: true`. An empty, partial, or truncated snapshot is applied without expiring anything. `allowEmpty` is never set. Lever pages are followed up to 10 pages. Descriptions are trimmed to the 8,000 characters the database keeps before they are sent.

`assert_job_operation_proof` rejects a payload over 2,000,000 characters, so a snapshot is split into chunks of at most 500 postings and about 750,000 characters. A snapshot that fits in one chunk is sent exactly as before. Otherwise each chunk carries `snapshotKey` (the hourly key), `chunkIndex`, and `finalChunk`, and its idempotency key is `<snapshotKey>:c<index>`. Chunks are sent in order and the runner stops at the first one that fails. `20261101120000_jobs_chunked_apply.sql` enforces the rest: chunk N needs chunk N-1 of the same snapshot to have succeeded (`chunk_out_of_order` otherwise), only chunk 0 counts toward the daily refresh limit, and only the final chunk of a complete snapshot expires listings, limited to those not verified since chunk 0 started. A failed or missing middle chunk therefore expires nothing. A rerun in the same hour returns `duplicate` for each chunk already applied and resumes at the first one that was not.

The summary lists, per source, `applied` (fetched, inserted, updated, expired, rejected, chunks), `skipped` with a reason such as `source_not_activated`, `lock_held`, or `rate_limited`, `duplicate`, `failed` with the fetch reason, or `error` with a database code. It has no listing text and no secrets.

## Normalized listing

Unknown stays unknown. The adapters do not invent a salary, a posted date, a country, or an employer.

Stored fields include provider, source job id, employer, title, location, country, region, work arrangement, employment type, seniority, compensation minimum and maximum, currency, salary period, posted date, discovery date, last verified date, listing URL, application URL, application method, content hash, listing status, and a small provenance object.

Greenhouse list results often have no pay and no posted date. A pay range in cents is stored without a period, so it does not satisfy a yearly salary filter and is not copied into an application salary. Country is taken from an explicit country phrase, not from a city. A location named exactly `Remote` is remote. Anything else is `unknown`.

Lever maps `workplaceType` and commitment. Salary intervals that are not yearly stay on their own period and are not converted. Ashby ignores unlisted jobs and ignores equity when reading compensation. `Temporary` stays `unknown`. A missing Ashby id uses the job URL as the source key.

HTML descriptions are converted to text. `script` and `style` contents are removed. Description text is not scored, so instructions inside a posting cannot change the match.

Deduplication uses the source id first. A cross-provider link requires the same canonical application URL, employer domain, normalized title, and location. A URL and title match without the rest stays unlinked. Dedup does not delete postings or applications.

A failed refresh records a failed run and leaves listing status unchanged. A successful complete snapshot can mark omitted rows `expired`. An empty complete snapshot is rejected unless `allowEmpty` is set, so a bad response cannot expire the board. The same idempotency key returns `duplicate` and does not write again. A held processing lock returns `lock_held`. More successful runs than `refresh_limit_per_day` in 24 hours returns `rate_limited`.

Expired means the listing was absent from the last successful full refresh. The card says posted or last checked. It does not say the listing is live.

## Recommendation estimate

Hard filters run before the score: country, work arrangement, employment type, seniority, excluded employers, Easy Apply, posted date, keyword, location, and preferred-only. Unknown country, seniority, or posted date does not satisfy a filter that asks for a specific value.

Salary is comparable only when the period is `year` and the currencies match. A known maximum below the floor fails. A known minimum at or above the floor passes. Hourly pay, a missing period, a missing currency, and a currency mismatch stay unknown. Unknown pay stays visible unless the user hides it.

The score is a preference and qualification match estimate from 0 to 100. It is not an ATS score and not an interview prediction.

| Factor | Points |
| --- | --- |
| Verified skill tokens on the listing | up to 30, divided by the user's verified skill token count |
| Target role tokens in the title | up to 25 |
| Seniority selected by the user | 15 when it matches, 5 when the listing seniority is unknown, 0 when it differs or the user set no preference |
| Verified job-title tokens in the listing title | 5 each, up to 10 |
| Preferred company | 10 |
| Freshness of last verified or posted date | 10 within 7 days, 6 within 30, 3 within 90 |

Tokens are lowercase words of length greater than 1. SQL scoring uses ASCII. The TypeScript scorer strips Unicode marks. Rejected and unverified career facts are not loaded. The SQL function tokenizes the verified rows itself, so the caller cannot add skill points by sending extra tokens. Description text is ignored.

The page shows the SQL score. It shows the TypeScript reasons only when that score matches. Alert matching uses the TypeScript scorer on a capped workspace export.

`applyReranker` is the extension point for a later model. The default passes jobs through unchanged and does not call a provider.

The word "Go" is not treated as the Go language. Use `golang` on a verified skill if that language should count.

## Alerts and scheduling

Alerts default to off. A user can save daily or weekly, pause, or delete. Each subscription has a minimum match, a delivery choice (`in_app`, `email`, or `both`), a timezone, an optional saved search, the last successful run, and the last error.

`/api/jobs/scheduler` accepts `GET`, which Vercel Cron uses, and `POST`. It is not behind the signed-in session check. It returns 503 when both `JOB_INGESTION_ENABLED` and `JOB_REFRESH_ENABLED` are off or the scheduler secret is missing, and 401 when the bearer token does not match. A matching bearer still does nothing useful until `JOB_CATALOG_WRITE_SECRET` matches the database gate.

A run does ingestion first, only when `JOB_INGESTION_ENABLED` is on, then alerts, only when `JOB_REFRESH_ENABLED` is on, so alerts see the refreshed catalog. Either flag alone is enough. The response reports each stage as `{state: "ran", ok, result}` or `{state: "skipped", reason}`. An ingestion failure is reported and alerts still run. The response is 500 when a stage that ran failed, or when ingestion is on but `JOB_CATALOG_WRITE_SECRET` is missing. A duplicate call in the same UTC hour is a no-op for ingestion and an upsert for alerts. A missed day is caught up by the next full refresh.

`vercel.json` schedules one cron, `0 11 * * *` (11:00 UTC daily), on `/api/jobs/scheduler`. The route sets `maxDuration = 300` because ingestion fetches each board in turn. Check that your Vercel plan allows that duration; a lower plan limit cuts the run short, and the next day's run starts over.

The run collects at most 500 active or unverified postings from approved sources, scores them, and records deliveries. The window key is `daily:YYYY-MM-DD` or `weekly:` plus that week's Monday, in the user's timezone. The same subscription, posting, window, and channel cannot insert a second row. A repeated run updates a row only when the existing status is `failed`. An empty match list still marks the subscription successful so the window is not retried. An invalid timezone records a failure and does not mark success.

Email and `both` write an in-app `recorded` row and an email `skipped` row. `deliverJobAlertEmail` never opens a network connection. Supabase Auth SMTP is not used for these messages.

A failed source request is recorded with `record_job_source_failure`. That function does not expire listings.

## Add to tracker

`/applications/new?posting=<uuid>` prefills company, title, URL, location, work arrangement, employment type, source, and requisition id. Status is `saved`. Applied date is empty. Yearly compensation in a known currency is copied. Other compensation is described in the notes and left out of the salary fields.

If one private company has the same normalized name, that company is selected. If several do, the form asks for a choice and does not attach an arbitrary row. If none do, the form starts a new company. The user can edit the form before saving.

Creating the application is skipped when this posting is already linked, or when `find_application_duplicate` finds the same normalized title and URL on any of the user's applications. `applications.job_match_key` is set by a trigger and is unique per user, so a concurrent second insert is rejected. A preexisting duplicate whose key was left null can still be edited. A missing or non-HTTP URL does not create a key. Another user's matching title and URL is a separate application. The original URL opens in a new tab. The app does not submit an application to an employer.

## Local tests

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Database tests use an in-memory PGlite database and the SQL files in `supabase/migrations`. They do not connect to the hosted project. `src/lib/jobs/local-postgres.integration.test.ts` runs only when `LOCAL_SUPABASE_URL` is exactly `http://127.0.0.1:54321` and the local anon and service-role keys are present. Adapter tests read `src/lib/jobs/sources/fixtures`. They do not call Greenhouse, Lever, or Ashby.

Do not run `supabase db reset` unless you have confirmed the target is a disposable local database. The Supabase GitHub integration applies migrations to production when a pull request merges to `main`, so merging is the production deploy for SQL.

For a local end-to-end run, generate a local `JOB_CATALOG_WRITE_SECRET` and `CRON_SECRET` into `.env.development.local`, set the same catalog secret in the local `job_catalog_gate`, register and approve a fixture source with the CLI, run `refresh --fixtures`, and call the scheduler with `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/jobs/scheduler`.

## Production runbook

Do these in order, only when you mean to change the hosted project. `20261021120000_recommended_jobs.sql` is already on `main`, so `job_catalog_gate` exists in production. Merging this branch applies `20261028120000_jobs_activation.sql`.

1. **Generate secrets** on your machine. Keep them out of chat, commits, and the browser.

   ```bash
   openssl rand -hex 32   # JOB_CATALOG_WRITE_SECRET
   openssl rand -hex 32   # CRON_SECRET
   ```

2. **Set the database gate** in the hosted SQL editor. Paste the catalog secret in place of the placeholder. It must be 32–200 characters.

   ```sql
   update public.job_catalog_gate
   set secret = '<JOB_CATALOG_WRITE_SECRET>'
   where id = 1;
   ```

3. **Set Vercel Production environment variables**, server-only, none with `NEXT_PUBLIC_`:
   - `JOB_RECOMMENDATIONS_ENABLED=true`
   - `JOB_RECOMMENDATIONS_ALLOWED_USER_IDS=<your user id>` for a private first release
   - `JOB_CATALOG_WRITE_SECRET=<same value as the gate>`
   - `CRON_SECRET=<cron secret>`
   - `JOB_INGESTION_ENABLED=true` when you want the daily cron to fetch. Leave it unset until the first manual refresh looks right.
   - `JOB_REFRESH_ENABLED=true` only when alerts should run. Email stays inactive either way.
4. **Merge** the pull request. The Supabase integration applies the migration, and Vercel deploys the route and the cron.
5. **First board.** Add `JOB_CATALOG_WRITE_SECRET` to `.env.local` on your machine, then run `preview`, `register`, and `approve` from the operator runbook with `--target production`. Each command shows the production host and asks for the project ref.
6. **First manual refresh.**

   ```bash
   JOB_INGESTION_ENABLED=true npx tsx --conditions=react-server scripts/jobs/cli.ts refresh --target production
   ```

   Expect `applied` with an inserted count for the board. `skipped` with `source_not_activated` or `source_not_live` means the approval did not set `--live`.
7. **Verify `/jobs`** while signed in as an allowlisted user: the board's listings appear with attribution. Sign in as another account and confirm the off state. After the next 11:00 UTC run, check the Vercel cron log for a 200 and a `duplicate` or `applied` outcome.

Email stays inactive until a product sender is chosen and `deliverJobAlertEmail` is implemented for that sender. Setting the email flag does not send mail today.

Missing jobs tables do not block companies, applications, or the rest of the existing tracker.
