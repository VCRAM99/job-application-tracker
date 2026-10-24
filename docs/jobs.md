# Recommended jobs

Recommended jobs is a shared catalog plus private preferences. It is separate from Career AI. Turning the jobs page on does not fetch Greenhouse, Lever, or Ashby, send email, or start a schedule.

The migration is `supabase/migrations/20261021120000_recommended_jobs.sql`. It does not rewrite companies or applications. `application_postings` uses the existing `applications (user_id, id)` unique key from `20261019160000_networking_tasks_preparation.sql`.

## Feature flags

All of these are server-only. None belong in a `NEXT_PUBLIC_` variable.

| Variable | Default | What it controls |
| --- | --- | --- |
| `JOB_RECOMMENDATIONS_ENABLED` | On in local development. Off when `NODE_ENV` or `VERCEL_ENV` is `production`. | The `/jobs` and `/jobs/alerts` pages and their form actions. |
| `JOB_INGESTION_ENABLED` | Off until set to `true`. | Permission to call a live source adapter. An adapter file is not enough. |
| `JOB_REFRESH_ENABLED` | Off until set to `true`. | `POST /api/jobs/scheduler`. |
| `JOB_EMAIL_DELIVERY_ENABLED` and `JOB_EMAIL_FROM` | Off. Both must be set before the email adapter even considers a message. | Still does not send mail. The sender returns `sender_not_approved`. |
| `JOB_CATALOG_WRITE_SECRET` | Unset. Must be 32–200 characters and match `job_catalog_gate.secret`. | HMAC for catalog and alert writes. |
| `JOB_SCHEDULER_SECRET` | Unset. Must be at least 32 characters. A missing, empty, or short secret is rejected even when refresh is enabled. | Bearer token for the scheduler route. |

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

Host allowlist: `boards-api.greenhouse.io`, `api.lever.co`, `api.eu.lever.co`, `api.ashbyhq.com`. Requests use HTTPS, no userinfo, no IP hosts, manual redirects, a 10 second timeout, and a 1,000,000 byte cap. Identifiers are `[A-Za-z0-9_-]{1,80}`.

The three adapters normalize fixture payloads in tests. `permitLiveFetch` is required before any HTTP call, and `ingestionAllowed` still has to pass. The scheduler route does not call the adapters.

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

### Operator checklist for one board

1. Read the provider docs and the employer's terms. Record what may be stored and for how long.
2. Confirm the board token or site name from the employer, not by guessing a private API.
3. Register the source with `register_job_source`. That call always stores a draft.
4. Approve it with live ingestion still false. Run a fixture or a single reviewed fetch in a non-production database.
5. Check attribution on the job card and that private company notes were not copied into `catalog_employers`.
6. Set a refresh limit. Only then consider `liveIngestionEnabled: true`.
7. Set `JOB_INGESTION_ENABLED` on the server that will fetch. Do not put the catalog secret in the browser.
8. Keep email and the scheduler off until their own checklists are done.

Do not start this checklist against the hosted project from a development session.

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

`POST /api/jobs/scheduler` is not behind the signed-in session check. It returns 503 when refresh is off or the scheduler secret is missing, and 401 when the bearer token does not match. A matching bearer still does nothing useful until `JOB_CATALOG_WRITE_SECRET` matches the database gate.

The run collects at most 500 active or unverified postings from approved sources, scores them, and records deliveries. The window key is `daily:YYYY-MM-DD` or `weekly:` plus that week's Monday, in the user's timezone. The same subscription, posting, window, and channel cannot insert a second row. A repeated run updates a row only when the existing status is `failed`. An empty match list still marks the subscription successful so the window is not retried. An invalid timezone records a failure and does not mark success.

Email and `both` write an in-app `recorded` row and an email `skipped` row. `deliverJobAlertEmail` never opens a network connection. Supabase Auth SMTP is not used for these messages.

There is no `vercel.json` cron and no hosted scheduler configuration in this repository. A failed source request must be recorded with `record_job_source_failure`. That function does not expire listings.

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

Do not run `supabase db reset` unless you have confirmed the target is a disposable local database. Do not `db push` this migration to the hosted project until the production checklist below is approved.

`supabase/config.toml` from a local `supabase init` is not part of this feature. Leave it untracked unless you intend to commit a reviewed local stack.

## Production activation

Do all of this only when you mean to change the hosted project.

1. Review the migration diff. Confirm it does not drop tables or grant `service_role` to the app.
2. `npx supabase db push --dry-run` against the intended project. Stop if it proposes anything other than this additive file.
3. Apply the migration. Leave `job_catalog_gate.secret` null until a writer is approved.
4. Deploy the app with jobs flags unset. Production UI stays off.
5. To show the UI against an empty catalog, set `JOB_RECOMMENDATIONS_ENABLED=true`. Ingestion, refresh, and email stay off.
6. To allow catalog writes, generate a 32–200 character secret, store it in `job_catalog_gate.secret`, and set the same value as `JOB_CATALOG_WRITE_SECRET` on the server only.
7. Approve individual boards with the checklist above. Then set `JOB_INGESTION_ENABLED=true`.
8. To run alerts, set `JOB_REFRESH_ENABLED=true` and `JOB_SCHEDULER_SECRET`, and call `POST /api/jobs/scheduler` with `Authorization: Bearer <secret>` from a scheduler you operate. Do not add that secret to the client.
9. Email stays inactive until a product sender is chosen and `deliverJobAlertEmail` is implemented for that sender. Setting the email flag does not send mail today.

Missing jobs tables do not block companies, applications, or the rest of the existing tracker.
