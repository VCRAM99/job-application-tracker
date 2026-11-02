# Performance baseline (M6a, before changes)

Measured on 2026-11-02 against a production build (`next build && next start`) of `main` at 9d0d75b plus the measurement tooling only. Tooling: `scripts/perf/measure.ts`; method: [docs/testing.md](../testing.md#performance-measurement).

**Setup**

- Local Supabase (Docker) on an Apple Silicon Mac.
- Dataset from `scripts/perf/seed-dataset.ts`: one user with 100 companies, 300 applications, 200 contacts, 150 tasks, 60 preparation items, and 4 verified facts, plus a 500-posting catalog source.
- Every V2 flag on. AI calls go to the local fake provider.

**Columns**

- **First-load JS:** scripts the document references, on a cold cache. Transfer is the compressed size.
- **All JS by idle:** everything fetched by network idle. It includes Next's prefetch of linked routes, which loads other pages' chunks in the background.
- **Server render:** a signed-in fetch of the full HTML stream, median of 5 warm runs.
- **Supabase calls (auth):** requests the server made for one render, from `PERF_TIMING=1` logs. The proxy's session refresh is counted.
- **Lighthouse:** default mobile profile with simulated throttling, median of 3.

Local Supabase answers in about 1–5 ms, so server times here understate production, where each Supabase round trip costs roughly 20–80 ms. The call counts matter more than the milliseconds.

## Pages

| Page | First-load JS KB (transfer / decoded, requests) | All JS by idle KB (requests) | Server render ms | Supabase calls (auth) | Supabase ms | Lighthouse perf / a11y / best practices | LCP ms | TBT ms |
|---|---|---|---|---|---|---|---|---|
| login | 194.4 / 627.2 (15) | 209.5 (17) | 19 | 0 (0) | 0 | 95 / 100 / 96 | 2932 | 24 |
| dashboard | 216.8 / 681.2 (14) | 455.9 (25) | 50 | 14 (4) | 64 | 94 / 100 / 100 | 3091 | 15 |
| applications list | 182.2 / 577.6 (13) | 461.3 (27) | 64 | 7 (4) | 33 | 94 / 100 / 100 | 3095 | 17 |
| application detail | 218 / 685.1 (14) | 457.4 (26) | 60 | 27 (12) | 74 | 94 / 100 / 100 | 3092 | 9 |
| jobs | 185.2 / 589.6 (13) | 451.7 (25) | 89 | 10 (4) | 69 | 95 / 100 / 100 | 2937 | 9 |
| analyze result | 184.3 / 585.3 (13) | 448.2 (24) | 54 | 13 (3) | 74 | 95 / 100 / 100 | 2939 | 14 |
| resumes | 277.7 / 933.3 (15) | 448.2 (24) | 42 | 5 (4) | 30 | 94 / 100 / 96 | 3089 | 13 |
| career | 219.6 / 707.8 (15) | 454.9 (25) | 52 | 16 (3) | 147 | 94 / 94 / 96 | 3099 | 21 |
| networking | 218.4 / 685.3 (14) | 454.9 (25) | 64 | 8 (4) | 47 | 93 / 100 / 100 | 3241 | 14 |
| daily tasks | 291.1 / 961.2 (14) | 449.8 (25) | 48 | 8 (5) | 32 | 92 / 100 / 100 | 3405 | 22 |

What stands out:

- **Repeated auth checks.** Every signed-in render makes 3–5 auth calls, and application detail makes 12 of its 27. `getCurrentUser` calls `getClaims` and `getUser` each time, and the layout, the page, and every loader call it separately.
- **Waterfalls.** Application detail waits for the application, then its company, then resume versions and the latest analysis. The dashboard renders suggested follow-ups inline, so their five queries start only after the dashboard's own five finish.
- **Heavy chunks on pages that rarely need them.** Daily tasks loads recharts in its first-load JS (about 94 KB transfer more than other pages), though both charts sit in collapsed sections. Resumes loads the Supabase browser client (about 85 KB transfer), which only the upload uses.
- **About 455 KB of JS by idle on every signed-in page.** Most of it is prefetch of other routes' chunks for the sidebar links, so it doesn't block the first paint (TBT is under 25 ms everywhere).
- **The same LCP on every page (~2.9–3.4 s).** Under Lighthouse's simulated slow 4G, the shared framework chunks set the floor.
- **No unbounded rendering limits.** Applications and contacts render every row (300 and 200 here).

## Ten slowest statements (pg_stat_statements)

Statements on `public` tables during the measured runs, by mean time. They are normalized: `$n` are parameters.

| # | Mean ms | Calls | Statement |
|---|---|---|---|
| 1 | 2.51 | 10 | `SELECT applications.* FROM applications WHERE user_id = $1` (applications list) |
| 2 | 1.62 | 10 | `SELECT contacts.* FROM contacts WHERE user_id = $1` (networking) |
| 3 | 1.08 | 10 | `SELECT id, job_title, company_id, status, applied_at, … FROM applications WHERE user_id = $1` (dashboard) |
| 4 | 0.84 | 20 | `SELECT id, job_title, status, applied_at, status_changed_at, … FROM applications` (follow-ups) |
| 5 | 0.76 | 10 | `SELECT id, job_title, company_id FROM applications` (contact options) |
| 6 | 0.38 | 10 | `SELECT id, title, status, due_date FROM tasks` (dashboard) |
| 7 | 0.36 | 20 | `SELECT id, name, next_follow_up_date, application_id FROM contacts` (follow-ups) |
| 8 | 0.33 | 10 | `SELECT id, name, next_follow_up_date FROM contacts` (dashboard) |
| 9 | 0.25 | 10 | `SELECT id, name, priority_tier, research_status, follow_up_date FROM companies` (dashboard) |
| 10 | 0.17 | 10 | `SELECT id, name FROM companies ORDER BY name` (company options) |

## EXPLAIN ANALYZE (auto_explain pass)

A second pass turned on `auto_explain` (`log_min_duration = 0`, `log_analyze = on`, no bind parameters) for PostgREST's role and loaded each page twice. The ten slowest plans:

| # | ms | Statement |
|---|---|---|
| 1 | 164.44 | `search_job_postings` body: `with scored as (select posting.id, posting.title, … )` with `/jobs` filters |
| 2 | 155.68 | the same function, second load |
| 3 | 3.32 | `SELECT execution_mode, provider, model FROM ai_user_settings` (first call after reconnect) |
| 4 | 2.55 | `SELECT contacts.* FROM contacts WHERE user_id = $1` |
| 5 | 1.94 | `SELECT id, job_title, status, applied_at, status_changed_at, … FROM applications` |
| 6 | 1.92 | `SELECT id, job_title, company_id, status, … FROM applications` |
| 7 | 1.88 | `SELECT applications.* FROM applications WHERE user_id = $1` |
| 8 | 1.46 | follow-up applications query, second load |
| 9 | 1.39 | contacts list, second load |
| 10 | 1.30 | dashboard applications query, second load |

**Jobs search (#1, #2).** The joins are cheap. The bitmap index scan on `job_postings_source_job_key` returns 502 postings in about 0.3 ms, and the anti and left joins to `posting_states`, `catalog_employers`, and `employer_preferences` each use their primary key, about 4 ms in total. The remaining ~160 ms is the `WindowAgg` and the per-row match scoring computed in SQL over all 502 rows before the top-10 sort. No index changes that, because the function has to score every candidate row. Making it faster means changing the function (precomputed match tokens, or scoring after a cheaper prefilter), which is a function migration, outside M6a's index-only allowance.

**Record lists (#4–#10).** Each is a sequential scan of one user's rows, for example `Seq Scan on applications (rows=300) (actual time=0.021..0.070)`, followed by PostgREST's JSON aggregate. With hundreds of rows per user that is the best plan. `user_id`, `(user_id, status)`, and `(user_id, follow_up)` indexes already exist (`applications_user_id_idx`, `applications_user_status_idx`, `applications_user_follow_up_idx`, and the same for contacts, tasks, and companies).

**Conclusion: no index is justified.** M6a adds no migration.
